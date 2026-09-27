// Live Hayat updates, reactions, photo copies and message retry.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import worker from "../worker/index.mjs";
import { fixture } from "./support/worker-fixture.mjs";
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5L8AAAAASUVORK5CYII=";
const meta = { date: "1985-06-19", place: "Gaziantep", description: "Aile buluşması", outsiders: "Aile dostumuz", peopleIds: [] };
const webp = (n = 64) => {
  const b = new Uint8Array(n);
  b.set(
    [..."RIFF"].map((c) => c.charCodeAt(0)),
    0,
  );
  b.set(
    [..."WEBP"].map((c) => c.charCodeAt(0)),
    8,
  );
  return "data:image/webp;base64," + Buffer.from(b).toString("base64");
};
const post = async (call, body, email) => (await call("/api/experience/feed", "POST", { clientId: crypto.randomUUID(), ...body }, email)).body.id;

test("emoji reactions: fixed set, one per person, counted on the card and hidden from people who cannot see the post", async () => {
  const { call, member } = fixture();
  const a = await member("a@test.invalid"),
    b = await member("b@test.invalid");
  const open = await post(call, { body: "Bayram sabahı", visibility: "family" });
  assert.equal((await call("/api/experience/feed/" + open + "/reaction", "PUT", { emoji: "🌿" }, a.email)).status, 200);
  assert.equal((await call("/api/experience/feed/" + open + "/reaction", "PUT", { emoji: "😂" }, b.email)).status, 200);
  assert.equal((await call("/api/experience/feed/" + open + "/reaction", "PUT", { emoji: "🥹" }, a.email)).status, 200, "changing a reaction replaces it");
  assert.equal((await call("/api/experience/feed/" + open + "/reaction", "PUT", { emoji: "💣" }, a.email)).status, 400, "only the fixed set is accepted");
  const card = (await call("/api/experience/feed", "GET", null, a.email)).body.items.find((p) => p.id === open);
  assert.deepEqual(card.reactions, { "🥹": 1, "😂": 1 });
  assert.equal(card.myReaction, "🥹");
  assert.equal((await call("/api/experience/feed/" + open + "/reaction", "DELETE", {}, a.email)).status, 200);
  assert.deepEqual((await call("/api/experience/feed", "GET", null, a.email)).body.items.find((p) => p.id === open).reactions, { "😂": 1 });
  const hidden = await post(call, { body: "Yalnız bana", visibility: "private" });
  assert.equal((await call("/api/experience/feed/" + hidden + "/reaction", "PUT", { emoji: "🌿" }, a.email)).status, 404);
});

test("comment likes toggle, count once per person and respect the post audience; existing post likes stay", async () => {
  const { call, member } = fixture();
  const a = await member("a@test.invalid"),
    b = await member("b@test.invalid");
  const id = await post(call, { body: "Hatırlayan var mı?", visibility: "family" });
  assert.equal((await call("/api/experience/feed/" + id + "/like", "PUT", {}, a.email)).status, 200);
  assert.equal(
    (await call("/api/experience/feed/" + id + "/comments", "POST", { body: "Ben hatırlıyorum", clientId: crypto.randomUUID() }, b.email)).status,
    201,
  );
  const cid = (await call("/api/experience/feed/" + id + "/comments", "GET", null, a.email)).body.items.find((x) => x.body === "Ben hatırlıyorum").id;
  assert.equal((await call("/api/experience/feed/comments/" + cid + "/like", "PUT", {}, a.email)).status, 200);
  assert.equal((await call("/api/experience/feed/comments/" + cid + "/like", "PUT", {}, a.email)).status, 200, "liking twice is idempotent");
  let list = (await call("/api/experience/feed/" + id + "/comments", "GET", null, a.email)).body.items;
  assert.equal(list.find((x) => x.id === cid).likes, 1);
  assert.ok(list.find((x) => x.id === cid).liked);
  assert.equal((await call("/api/experience/feed/comments/" + cid + "/like", "DELETE", {}, a.email)).status, 200);
  list = (await call("/api/experience/feed/" + id + "/comments", "GET", null, a.email)).body.items;
  assert.equal(list.find((x) => x.id === cid).likes, 0);
  const card = (await call("/api/experience/feed", "GET", null, a.email)).body.items.find((p) => p.id === id);
  assert.equal(card.likes, 1, "post like kept");
  const secret = await post(call, { body: "Özel", visibility: "private" });
  await call("/api/experience/feed/" + secret + "/comments", "POST", { body: "not", clientId: crypto.randomUUID() });
  const own = (await call("/api/experience/feed/" + secret + "/comments")).body.items[0].id;
  assert.equal((await call("/api/experience/feed/comments/" + own + "/like", "PUT", {}, a.email)).status, 404);
});

test("change feed returns a cursor and only posts the reader may see", async () => {
  const { call, member } = fixture();
  const a = await member("a@test.invalid");
  const start = (await call("/api/experience/feed/changes", "GET", null, a.email)).body;
  assert.equal(start.cursor, 0, "a new family starts at 0");
  const open = await post(call, { body: "Herkese", visibility: "family" });
  const secret = await post(call, { body: "Gizli", visibility: "private" });
  await call("/api/experience/feed/" + secret + "/reaction", "PUT", { emoji: "🌿" });
  const next = (await call("/api/experience/feed/changes?after=" + start.cursor, "GET", null, a.email)).body;
  assert.ok(next.posts.includes(open));
  assert.ok(!next.posts.includes(secret), "private post id never leaks");
  assert.ok(next.cursor > start.cursor);
  const again = (await call("/api/experience/feed/changes?after=" + next.cursor, "GET", null, a.email)).body;
  assert.deepEqual(again.posts, []);
});

test("photo copies: never larger than the source, JPEG/WebP only, served with the original access rules", async () => {
  const { call, member } = fixture();
  const a = await member("a@test.invalid"),
    b = await member("b@test.invalid");
  const real = (name) => "data:image/*;base64," + readFileSync("tests/fixtures/" + name).toString("base64");
  const up = await call("/api/experience/memories", "POST", {
    clientId: crypto.randomUUID(),
    photos: [{ ...meta, data: real("photo-1100.jpg") }],
    visibility: "selected",
    userIds: [a.id],
  });
  assert.ok([200, 201].includes(up.status));
  const id = up.body.id || up.body.ids[0];
  const put = (variants) => call("/api/experience/memories/" + id + "/variants", "PUT", { variants });
  assert.equal((await put([{ width: 1600, data: real("copy-640.webp") }])).status, 400, "no upscaling beyond the 1100 px source");
  assert.equal((await put([{ width: 500, data: real("copy-640.webp") }])).status, 400, "only the fixed widths");
  assert.equal((await put([{ width: 320, data: "data:image/png;base64," + png }])).status, 400, "PNG copies refused");
  assert.equal(
    (
      await put([
        { width: 320, data: real("copy-320.webp") },
        { width: 640, data: real("copy-640.webp") },
      ])
    ).status,
    200,
  );
  const size = (name) => readFileSync("tests/fixtures/" + name).length;
  const small = await call("/media/" + id + "?w=300");
  assert.equal(small.status, 200);
  assert.equal(small.body.byteLength, size("copy-320.webp"));
  assert.equal((await call("/media/" + id + "?w=600")).body.byteLength, size("copy-640.webp"));
  assert.equal((await call("/media/" + id)).body.byteLength, size("photo-1100.jpg"), "original kept");
  assert.equal((await call("/media/" + id + "?w=300", "GET", null, a.email)).status, 200, "selected member sees the copy");
  assert.equal((await call("/media/" + id + "?w=300", "GET", null, b.email)).status, 404, "copy hidden like the original");
  assert.equal((await call("/api/experience/memories/" + id + "/variants", "PUT", { variants: [] }, b.email)).status, 404);
  assert.equal((await call("/api/experience/memories/" + id + "/focus", "PATCH", { x: 30, y: 20 }, a.email)).status, 403, "viewer cannot move the crop focus");
  assert.equal((await call("/api/experience/memories/" + id + "/focus", "PATCH", { x: 130, y: 20 })).status, 400);
  assert.equal((await call("/api/experience/memories/" + id + "/focus", "PATCH", { x: 30, y: 20 })).status, 200);
  const item = (await call("/api/experience/memories/" + id)).body;
  assert.deepEqual([item.media.width, item.media.focusX, item.media.focusY, item.media.variants], [1100, 30, 20, [320, 640]]);
  assert.equal((await call("/api/experience/memories/variants/missing", "GET", null, a.email)).status, 403);
});

test("message retry with the same clientId stores one message", async () => {
  const { call, member } = fixture();
  const a = await member("a@test.invalid");
  const clientId = crypto.randomUUID();
  const send = () => call("/api/experience/conversations/dm/" + a.id, "POST", { body: "Bağlantı gidip geldi", clientId });
  assert.ok([200, 201].includes((await send()).status));
  assert.ok([200, 201].includes((await send()).status), "retry accepted");
  const log = (await call("/api/experience/conversations/dm/" + a.id)).body;
  const items = log.items || log.messages || [];
  assert.equal(items.filter((m) => m.body === "Bağlantı gidip geldi").length, 1);
});

test("backups carry reactions, comment likes and photo focus", async () => {
  const { db } = fixture();
  const src = readFileSync("src/backups.mjs", "utf8");
  for (const t of ["photo_media", "feed_emoji", "feed_comment_likes"]) assert.match(src, new RegExp(`["']${t}["']`), t + " in backup");
  for (const t of ["photo_media", "photo_variants", "feed_emoji", "feed_comment_likes", "feed_activity"])
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name=?").get(t), t + " table exists");
});

test("tree portraits follow both the profile field audience and the photo audience", async () => {
  const { call, member } = fixture();
  const a = await member("a@test.invalid"),
    b = await member("b@test.invalid");
  const upload = (extra) => call("/api/experience/memories", "POST", { clientId: crypto.randomUUID(), photos: [{ ...meta, data: png }], ...extra });
  const onlyA = (await upload({ visibility: "selected", userIds: [a.id] })).body.id,
    everyone = (await upload({})).body.id;
  const p1 = (await call("/api/people", "POST", { name: "Ayşe Sarıçiçek" })).body.id,
    p2 = (await call("/api/people", "POST", { name: "Ali Sarıçiçek" })).body.id;
  assert.equal((await call("/api/experience/profile/" + p1, "PUT", { fields: { portrait: { value: onlyA, visibility: "family" } } })).status, 200);
  assert.equal(
    (await call("/api/experience/profile/" + p2, "PUT", { fields: { portrait: { value: everyone, visibility: "selected", users: [a.id] } } })).status,
    200,
  );
  const seen = async (email) => (await call("/api/experience/portraits", "GET", null, email)).body.items.map((x) => x.personId).sort();
  assert.deepEqual(await seen(a.email), [p1, p2].sort());
  assert.deepEqual(await seen(b.email), [], "hidden photo and hidden field both stay private");
  assert.deepEqual(await seen(), [p1, p2].sort());
});

test("live cursor only moves for posts the reader may see, so private activity is not revealed", async () => {
  const { call, member } = fixture();
  const a = await member("a@test.invalid");
  const start = (await call("/api/experience/feed/changes", "GET", null, a.email)).body.cursor;
  const secret = await post(call, { body: "Özel not", visibility: "private" });
  await call("/api/experience/feed/" + secret + "/reaction", "PUT", { emoji: "🌿" });
  const after = (await call("/api/experience/feed/changes", "GET", null, a.email)).body.cursor;
  assert.equal(after, start, "someone else's private activity must not move my cursor");
  const open = await post(call, { body: "Herkese", visibility: "family" });
  const moved = (await call("/api/experience/feed/changes?after=" + after, "GET", null, a.email)).body;
  assert.ok(moved.cursor > after);
  assert.deepEqual(moved.posts, [open]);
});

test("deleting and restoring a post reaches the readers who could see it, and only them", async () => {
  const { call, member } = fixture();
  const a = await member("a@test.invalid"),
    b = await member("b@test.invalid");
  const shared = await post(call, { body: "Sadece A", visibility: "selected", userIds: [a.id] });
  const ca = (await call("/api/experience/feed/changes", "GET", null, a.email)).body.cursor;
  const cb = (await call("/api/experience/feed/changes", "GET", null, b.email)).body.cursor;
  assert.equal((await call("/api/experience/feed/" + shared, "DELETE", {})).status, 200);
  const forA = (await call("/api/experience/feed/changes?after=" + ca, "GET", null, a.email)).body;
  assert.deepEqual(forA.removed, [shared]);
  assert.deepEqual(forA.posts, []);
  const forB = (await call("/api/experience/feed/changes?after=" + cb, "GET", null, b.email)).body;
  assert.deepEqual([forB.cursor, forB.removed || []], [cb, []], "B never saw the post and learns nothing");
  assert.equal((await call("/api/experience/feed/" + shared + "/restore", "POST", {})).status, 200);
  const back = (await call("/api/experience/feed/changes?after=" + forA.cursor, "GET", null, a.email)).body;
  assert.deepEqual([back.posts, back.fresh], [[shared], true]);
});
