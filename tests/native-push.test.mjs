// Native notifications: FCM (against a local stand-in for Google's OAuth and FCM endpoints), APNs
// (against a local HTTP/2 server), and who gets notified for messages, comments and tags.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createServer as createHttp2Server, connect } from "node:http2";
import { generateKeyPairSync, createVerify, verify as verifySignature } from "node:crypto";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { createNativePush, TEXTS, validToken } from "../src/native-push.mjs";
import { fixture } from "./support/worker-fixture.mjs";

const ANDROID = (n) => "fcm-token-" + String(n).padStart(3, "0") + "_" + "a".repeat(80);
const IOS = (n) => String(n).padStart(2, "0") + "ab".repeat(31);
const jwtParts = (jwt) => jwt.split(".").map((p, i) => (i < 2 ? JSON.parse(Buffer.from(p, "base64url").toString()) : p));

function memoryDb() {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync("drizzle")
    .filter((x) => x.endsWith(".sql"))
    .sort())
    db.exec(readFileSync("drizzle/" + f, "utf8"));
  db.exec("INSERT INTO users(id,name,email,authId,role,active,createdAt) VALUES('u1','A','a@x','a','member',1,'x'),('u2','B','b@x','b','member',1,'x')");
  return {
    db,
    all: async (s, ...a) => db.prepare(s).all(...a),
    one: async (s, ...a) => db.prepare(s).get(...a),
    run: async (s, ...a) => db.prepare(s).run(...a),
  };
}

/** Local stand-in for Google's token endpoint and FCM v1. */
async function fakeFcm(respond = () => [200, { name: "ok" }]) {
  const seen = { tokens: [], messages: [] };
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url === "/token") {
        seen.tokens.push(new URLSearchParams(body).get("assertion"));
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ access_token: "access-" + seen.tokens.length, expires_in: 3600 }));
        return;
      }
      const message = JSON.parse(body).message;
      seen.messages.push({ auth: req.headers.authorization, url: req.url, message });
      const [status, data] = respond(message, req.headers.authorization);
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(data));
    });
  }).listen(0);
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const account = {
    project_id: "saricicek-test",
    client_email: "push@saricicek-test.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
    token_uri: base + "/token",
  };
  return { server, base, seen, account, publicKey };
}

test("FCM: signed service-account sign-in, generic text, tap target, invalid tokens removed, 401 refresh", async (t) => {
  const fcm = await fakeFcm((m, auth) =>
    m.token === ANDROID(2)
      ? [404, { error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }]
      : auth === "Bearer access-1" && m.token === ANDROID(3)
        ? [401, {}]
        : [200, {}],
  );
  t.after(() => fcm.server.close());
  const store = memoryDb();
  for (const [n, user] of [
    [1, "u1"],
    [2, "u1"],
    [3, "u2"],
  ])
    store.db.prepare("INSERT INTO push_devices VALUES(?,?,?,?,?)").run(ANDROID(n), user, "android", "x", "x");
  const push = createNativePush({ FCM_SERVICE_ACCOUNT: JSON.stringify(fcm.account), FCM_BASE_URL: fcm.base });
  assert.deepEqual(push.available, { android: true, ios: false });

  const first = await push.send(store, ["u1"], "comment", "#post/12");
  assert.deepEqual(first, { sent: 1, removed: 1, failed: 0, skipped: 0 });
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM push_devices WHERE token=?").get(ANDROID(2)).n, 0, "unregistered token removed");
  const [header, claims, signature] = jwtParts(fcm.seen.tokens[0]);
  assert.equal(header.alg, "RS256");
  assert.equal(claims.iss, fcm.account.client_email);
  assert.equal(claims.scope, "https://www.googleapis.com/auth/firebase.messaging");
  const signedPart = fcm.seen.tokens[0].split(".").slice(0, 2).join(".");
  assert.ok(
    createVerify("RSA-SHA256").update(signedPart).verify(fcm.publicKey, Buffer.from(signature, "base64url")),
    "JWT signed with the service account key",
  );
  const sent = fcm.seen.messages[0];
  assert.equal(sent.url, "/v1/projects/saricicek-test/messages:send");
  assert.deepEqual(sent.message.notification, { title: "Sarıçiçek Konağı", body: TEXTS.comment });
  assert.deepEqual(sent.message.data, { url: "#post/12", kind: "comment" });
  assert.equal(sent.message.android.notification.visibility, "PRIVATE");

  // A 401 refreshes the access token once and retries.
  assert.deepEqual(await push.send(store, ["u2"], "message", "#chat"), { sent: 1, removed: 0, failed: 0, skipped: 0 });
  assert.equal(fcm.seen.tokens.length, 2);
  assert.equal(fcm.seen.messages.at(-1).auth, "Bearer access-2");

  // Preferences: someone who turned off comment notifications gets none.
  store.db.prepare("INSERT INTO user_preferences(userId,data,updatedAt) VALUES(?,?,?)").run("u1", JSON.stringify({ notifications: { comments: false } }), "x");
  assert.deepEqual(await push.send(store, ["u1"], "comment", "#post/12"), { sent: 0, removed: 0, failed: 0, skipped: 1 });
});

test("APNs: ES256 provider token, headers and body over HTTP/2; 410 removes the device", async (t) => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const requests = [];
  const server = createHttp2Server();
  server.on("stream", (stream, headers) => {
    let body = "";
    stream.on("data", (c) => (body += c));
    stream.on("end", () => {
      requests.push({ headers, body: JSON.parse(body) });
      const gone = headers[":path"].endsWith(IOS(2));
      stream.respond({ ":status": gone ? 410 : 200, "content-type": "application/json" });
      stream.end(gone ? JSON.stringify({ reason: "Unregistered" }) : "");
    });
  });
  server.listen(0);
  await once(server, "listening");
  t.after(() => server.close());
  const store = memoryDb();
  store.db.prepare("INSERT INTO push_devices VALUES(?,?,?,?,?)").run(IOS(1), "u1", "ios", "x", "x");
  store.db.prepare("INSERT INTO push_devices VALUES(?,?,?,?,?)").run(IOS(2), "u1", "ios", "x", "x");
  const push = createNativePush(
    { APNS_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).replace(/\n/g, "\\n"), APNS_KEY_ID: "ABC123DEFG", APNS_TEAM_ID: "TEAM123456" },
    { http2Connect: () => connect("http://127.0.0.1:" + server.address().port) },
  );
  t.after(() => push.close());
  assert.deepEqual(push.available, { android: false, ios: true });
  assert.deepEqual(await push.send(store, ["u1"], "tag", "#post/7"), { sent: 1, removed: 1, failed: 0, skipped: 0 });
  const [ok] = requests;
  assert.equal(ok.headers[":path"], "/3/device/" + IOS(1));
  assert.equal(ok.headers["apns-topic"], "com.saricicek.family");
  assert.equal(ok.headers["apns-push-type"], "alert");
  assert.deepEqual(ok.body, { aps: { alert: { title: "Sarıçiçek Konağı", body: TEXTS.tag }, sound: "default", "thread-id": "tag" }, url: "#post/7" });
  const jwt = ok.headers.authorization.replace("bearer ", "");
  const [header, claims, signature] = jwtParts(jwt);
  assert.deepEqual([header.alg, header.kid, claims.iss], ["ES256", "ABC123DEFG", "TEAM123456"]);
  assert.ok(
    verifySignature(
      "sha256",
      Buffer.from(jwt.split(".").slice(0, 2).join(".")),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url"),
    ),
    "provider token signed with the .p8 key",
  );
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM push_devices").get().n, 1);
});

test("device registration, and who is notified for messages, comments and tags", async (t) => {
  const fcm = await fakeFcm();
  t.after(() => fcm.server.close());
  const { db, env, call, member } = fixture();
  Object.assign(env, { FCM_SERVICE_ACCOUNT: JSON.stringify(fcm.account), FCM_BASE_URL: fcm.base });
  const a = await member("anne@test.invalid"),
    b = await member("baba@test.invalid"),
    c = await member("cocuk@test.invalid");
  assert.deepEqual((await call("/api/config")).body.nativePush, { android: true, ios: false });
  for (const [who, n] of [
    [a, 1],
    [b, 2],
    [c, 3],
  ]) {
    await call("/api/me", "GET", null, who.email);
    assert.equal((await call("/api/notifications/device", "POST", { platform: "android", token: ANDROID(n) }, who.email)).status, 200);
  }
  assert.equal((await call("/api/notifications/device", "POST", { platform: "android", token: "short" }, a.email)).status, 400);
  assert.equal((await call("/api/notifications/device", "POST", { platform: "ios", token: ANDROID(9) }, a.email)).status, 400);
  const tokenOf = (m) => m.message.token;
  const drain = async () => {
    await new Promise((r) => setTimeout(r, 30));
    return fcm.seen.messages.splice(0).map((m) => [tokenOf(m), m.message.data.kind, m.message.data.url]);
  };

  // A private message notifies only the recipient.
  await call("/api/experience/conversations/dm/" + b.id, "POST", { body: "Merhaba", clientId: crypto.randomUUID() }, a.email);
  assert.deepEqual(await drain(), [[ANDROID(2), "message", "#chat"]]);

  // Tag a person linked to B on a family post: B is notified with the post link.
  const person = (await call("/api/people", "POST", { name: "Baba Kişi" })).body.id;
  db.prepare("INSERT INTO profile_details VALUES(?,?,?)").run(person, b.id, "{}");
  const post = (
    await call("/api/experience/feed", "POST", { body: "Bayram", visibility: "family", clientId: crypto.randomUUID(), peopleIds: [person] }, a.email)
  ).body.id;
  assert.deepEqual(await drain(), [[ANDROID(2), "tag", "#post/" + post]]);

  // A tag on a post B may not see sends B nothing (it would reveal the post).
  const hidden = await call(
    "/api/experience/feed",
    "POST",
    { body: "Gizli", visibility: "selected", userIds: [c.id], clientId: crypto.randomUUID(), peopleIds: [person] },
    a.email,
  );
  assert.equal(hidden.status, 201, JSON.stringify(hidden.body));
  assert.deepEqual(await drain(), []);

  // A comment notifies the post's author, not the commenter.
  await call("/api/experience/feed/" + post + "/comments", "POST", { body: "Ne güzel" }, c.email);
  assert.deepEqual(await drain(), [[ANDROID(1), "comment", "#post/" + post]]);

  // Nothing private in any notification.
  for (const m of fcm.seen.messages) assert.ok(!JSON.stringify(m).includes("Merhaba"));

  // Signing in on the same phone with another account moves the device; unregistering and account deletion remove it.
  await call("/api/notifications/device", "POST", { platform: "android", token: ANDROID(2) }, c.email);
  assert.equal(db.prepare("SELECT userId FROM push_devices WHERE token=?").get(ANDROID(2)).userId, c.id);
  await call("/api/notifications/device", "DELETE", { platform: "android", token: ANDROID(3) }, c.email);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM push_devices WHERE token=?").get(ANDROID(3)).n, 0);
  await call("/api/account", "DELETE", { confirm: "HESABIMI SİL" }, c.email);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM push_devices WHERE userId=?").get(c.id).n, 0);
});

test("device token formats", () => {
  assert.ok(validToken("android", ANDROID(1)));
  assert.ok(validToken("ios", IOS(1)));
  assert.ok(!validToken("ios", "zz" + IOS(1).slice(2)));
  assert.ok(!validToken("android", "a b"));
  assert.ok(!validToken("web", ANDROID(1)));
});
