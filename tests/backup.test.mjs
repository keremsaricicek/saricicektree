// Off-site backup and restore on the real Node server: back up a family with accounts, private and
// group messages, relations and a photo; restore into an empty folder; start a second server on it
// and check everything is there. Also: damaged file, wrong passphrase, failure alert, S3 signing.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { signS3, backupDue } from "../src/offsite-backup.mjs";

const run = promisify(execFile);
const PASS = "yedek-parolasi-2026";
const root = mkdtempSync(join(tmpdir(), "sf-backup-test-"));

async function startServer(dataDir, port, extraEnv = {}) {
  const origin = `http://localhost:${port}`;
  const child = spawn(process.execPath, ["src/server.mjs"], {
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), APP_ORIGIN: origin, MEDIA_JOBS: "off", ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (;;) {
    const [chunk] = await once(child.stdout, "data");
    if (String(chunk).includes(origin)) break;
  }
  let cookie = "",
    csrf = "";
  const call = async (path, method = "GET", body) => {
    const res = await fetch(origin + path, {
      method,
      headers: { origin, "content-type": "application/json", cookie, "x-csrf-token": csrf },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const type = res.headers.get("content-type") || "";
    const data = type.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer());
    if (res.headers.get("set-cookie")) cookie = res.headers.get("set-cookie").split(";")[0];
    if (data?.csrf) csrf = data.csrf;
    return { status: res.status, body: data };
  };
  const as = async (email, password) => {
    const session = { cookie: "", csrf: "" };
    const res = await fetch(origin + "/api/login", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    session.cookie = res.headers.get("set-cookie")?.split(";")[0] || "";
    session.csrf = (await res.json()).csrf;
    return async (path, method = "GET", body) => {
      const r = await fetch(origin + path, {
        method,
        headers: { origin, "content-type": "application/json", cookie: session.cookie, "x-csrf-token": session.csrf },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const type = r.headers.get("content-type") || "";
      return { status: r.status, body: type.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
    };
  };
  return { child, call, as, stop: async () => (child.kill(), once(child, "exit")) };
}

const script = (name, env, args = []) => run(process.execPath, ["scripts/" + name, ...args], { env: { ...process.env, ...env } });

test("a full backup restores accounts, messages, relations and photos into an empty environment", async (t) => {
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const data = join(root, "live"),
    target = join(root, "offsite"),
    restored = join(root, "restored");
  await run(process.execPath, ["src/admin.mjs"], {
    env: { ...process.env, DATA_DIR: data, ADMIN_EMAIL: "owner@backup.test", ADMIN_PASSWORD: "owner-long-password", ADMIN_NAME: "Owner" },
  });
  const live = await startServer(data, 32000 + Math.floor(Math.random() * 1000));
  let photoId, photoBytes;
  try {
    const owner = await live.as("owner@backup.test", "owner-long-password");
    const invite = await owner("/api/invites", "POST", { email: "ayse@backup.test", role: "member" });
    const token = invite.body.url.split("invite=")[1];
    const ayseAccount = await live.call("/api/accept-invite", "POST", { token, name: "Ayşe", password: "ayse-long-password" });
    assert.equal(ayseAccount.status, 201);
    const ayseId = ayseAccount.body.user.id;
    const ownerId = (await owner("/api/me")).body.user.id;
    const p1 = (await owner("/api/people", "POST", { name: "Dede Sarıçiçek", birthDate: "1930-01-01" })).body.id;
    const p2 = (await owner("/api/people", "POST", { name: "Baba Sarıçiçek", birthDate: "1960-01-01" })).body.id;
    assert.equal((await owner("/api/relations", "POST", { personA: p1, personB: p2, type: "parent" })).status, 201);
    assert.equal(
      (await owner("/api/experience/conversations/dm/" + ayseId, "POST", { body: "Özel mesaj: yedekte kalmalı", clientId: crypto.randomUUID() })).status,
      201,
    );
    const group = (await owner("/api/archive/groups", "POST", { name: "Kuzenler", members: [ownerId, ayseId] })).body.id;
    assert.equal((await owner("/api/experience/conversations/group/" + group, "POST", { body: "Grup mesajı", clientId: crypto.randomUUID() })).status, 201);
    const jpg = readFileSync("tests/fixtures/photo-1100.jpg");
    const up = await owner("/api/experience/memories", "POST", {
      clientId: crypto.randomUUID(),
      photos: [
        {
          date: "1985-06-19",
          place: "Gaziantep",
          description: "Aile buluşması",
          outsiders: "Yok",
          peopleIds: [],
          data: "data:image/jpeg;base64," + jpg.toString("base64"),
        },
      ],
    });
    assert.equal(up.status, 201, JSON.stringify(up.body));
    photoId = (await owner("/api/bootstrap")).body.photos[0].id;
    photoBytes = (await owner("/media/" + photoId)).body;
    assert.ok(photoBytes.length > 1000);

    // Backup while the server runs.
    const out = await script("backup.mjs", { DATA_DIR: data, BACKUP_TARGET: target, BACKUP_PASSPHRASE: PASS });
    assert.match(out.stdout, /Yedek tamam/);
  } finally {
    await live.stop();
  }
  const [file] = readdirSync(target);
  assert.match(file, /^saricicek-.*\.sfbk$/);
  const status = JSON.parse(readFileSync(join(data, "backup-status.json"), "utf8"));
  assert.ok(status.lastSuccess && status.failures === 0);
  assert.ok(!readFileSync(join(target, file)).includes(Buffer.from("Özel mesaj")), "backup is encrypted");

  // Restore into an empty folder and run a second server on it.
  await script("restore.mjs", { BACKUP_PASSPHRASE: PASS }, [join(target, file), restored]);
  const copy = await startServer(restored, 33000 + Math.floor(Math.random() * 1000));
  try {
    const ayse = await copy.as("ayse@backup.test", "ayse-long-password");
    const me = await ayse("/api/me");
    assert.equal(me.status, 200, "member can sign in with the same password");
    const boot = (await ayse("/api/bootstrap")).body;
    assert.deepEqual(boot.people.map((p) => p.name).sort(), ["Baba Sarıçiçek", "Dede Sarıçiçek"]);
    assert.equal(boot.relations.length, 1);
    const ownerId = boot.photos[0]?.createdBy;
    const dm = await ayse("/api/experience/conversations/dm/" + ownerId);
    assert.deepEqual(
      dm.body.items.map((m) => m.body),
      ["Özel mesaj: yedekte kalmalı"],
    );
    const groups = (await ayse("/api/archive/groups")).body.items || (await ayse("/api/archive/groups")).body;
    const g = (Array.isArray(groups) ? groups : []).find((x) => x.name === "Kuzenler");
    assert.ok(g, "group restored");
    assert.deepEqual(
      (await ayse("/api/experience/conversations/group/" + g.id)).body.items.map((m) => m.body),
      ["Grup mesajı"],
    );
    const media = await ayse("/media/" + photoId);
    assert.equal(media.status, 200);
    assert.ok(Buffer.compare(media.body, photoBytes) === 0, "photo bytes identical");
  } finally {
    await copy.stop();
  }

  // A damaged file, a wrong passphrase and a non-empty target are refused; nothing is left behind.
  // One damaged byte inside the data and one in the final authentication tag.
  const damaged = join(root, "damaged.sfbk"),
    badTag = join(root, "bad-tag.sfbk");
  const bytes = readFileSync(join(target, file));
  bytes[Math.floor(bytes.length / 2)] ^= 0xff;
  writeFileSync(damaged, bytes);
  const tagged = readFileSync(join(target, file));
  tagged[tagged.length - 1] ^= 0xff;
  writeFileSync(badTag, tagged);
  for (const [f, pass, dest, pattern] of [
    [damaged, PASS, join(root, "r1"), /Yedek( çözülemedi| dosyası eksik|teki dosya bozuk)/],
    [badTag, PASS, join(root, "r3"), /Yedek çözülemedi/],
    [join(target, file), "yanlis-parola-1234", join(root, "r2"), /çözülemedi/],
    [join(target, file), PASS, restored, /boş olmalı/],
  ]) {
    await assert.rejects(script("restore.mjs", { BACKUP_PASSPHRASE: pass }, [f, dest]), (e) => pattern.test(e.stderr));
    if (dest !== restored) assert.ok(!existsSync(dest), "no partial restore left in " + dest);
  }
  assert.deepEqual(
    readdirSync(restored).filter((f) => f.startsWith(".restore-")),
    [],
    "staging folders cleaned up",
  );
  // An existing empty folder (e.g. a mounted volume) is restored into in place and stays empty on failure.
  const mounted = join(root, "mounted");
  mkdirSync(mounted);
  await assert.rejects(script("restore.mjs", { BACKUP_PASSPHRASE: "yanlis-parola-1234" }, [join(target, file), mounted]));
  assert.deepEqual(readdirSync(mounted), []);
  await script("restore.mjs", { BACKUP_PASSPHRASE: PASS }, [join(target, file), mounted]);
  assert.ok(readdirSync(mounted).includes("family.sqlite"));
});

test("a failed backup is recorded for the admin panel and sent to the alert address", async () => {
  const data = join(tmpdir(), "sf-backup-fail-" + Date.now());
  mkdirSync(data);
  const db = new DatabaseSync(join(data, "family.sqlite"));
  for (const f of readdirSync("drizzle").filter((x) => x.endsWith(".sql") && x !== "0000_crazy_proemial_gods.sql"))
    if (f.includes("error_log")) db.exec(readFileSync("drizzle/" + f, "utf8"));
  db.exec("CREATE TABLE IF NOT EXISTS t(x)");
  db.close();
  const alerts = [];
  const hook = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => (alerts.push(JSON.parse(body)), res.end("ok")));
  }).listen(0);
  try {
    await assert.rejects(
      script("backup.mjs", {
        DATA_DIR: data,
        BACKUP_TARGET: "s3://bucket/family", // no keys configured
        BACKUP_PASSPHRASE: PASS,
        BACKUP_ALERT_URL: `http://localhost:${hook.address().port}/alert`,
      }),
    );
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].text, /yedeği alınamadı.*BACKUP_S3_ACCESS_KEY_ID/);
    const check = new DatabaseSync(join(data, "family.sqlite"));
    assert.equal(check.prepare("SELECT event FROM error_log").get().event, "backup.offsite_failed");
    check.close();
    const status = JSON.parse(readFileSync(join(data, "backup-status.json"), "utf8"));
    assert.equal(status.failures, 1);
    assert.equal(backupDue(status, new Date(Date.parse(status.lastFailure) + 10 * 60000)), false, "waits an hour after a failure");
    assert.equal(backupDue(status, new Date(Date.parse(status.lastFailure) + 61 * 60000)), true);
  } finally {
    hook.close();
    rmSync(data, { recursive: true, force: true });
  }
});

test("S3 request signing matches the AWS reference signer", async () => {
  const { SignatureV4 } = await import("@smithy/signature-v4");
  const { Sha256 } = await import("@aws-crypto/sha256-js");
  const credentials = { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY" };
  const date = new Date("2026-09-27T02:15:00Z");
  const payloadHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  for (const url of [
    "https://s3.eu-central-1.amazonaws.com/aile-yedek/saricicek/saricicek-2026-09-27T02-15-00-000Z.sfbk",
    "https://example.r2.dev/b/k%20ey.sfbk?x-id=PutObject",
  ]) {
    const u = new URL(url);
    const mine = signS3({ method: "PUT", url, headers: { "content-length": 1234 }, payloadHash, ...credentials, region: "eu-central-1", date });
    const reference = await new SignatureV4({
      credentials,
      region: "eu-central-1",
      service: "s3",
      sha256: Sha256,
      uriEscapePath: false,
      applyChecksum: false,
    }).sign(
      {
        method: "PUT",
        protocol: u.protocol,
        hostname: u.hostname,
        path: u.pathname,
        query: Object.fromEntries(u.searchParams),
        headers: { host: u.host, "content-length": "1234", "x-amz-content-sha256": payloadHash },
      },
      { signingDate: date },
    );
    assert.equal(mine.authorization, reference.headers.authorization, url);
  }
});
