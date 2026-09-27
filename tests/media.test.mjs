// Photo checks, smaller copies and the background optimiser.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectImage } from "../src/media-check.mjs";
import { runMediaJobs } from "../src/media-jobs.mjs";
import { fixture } from "./support/worker-fixture.mjs";

const fixture64 = (name) => "data:image/*;base64," + readFileSync("tests/fixtures/" + name).toString("base64");
const meta = { date: "1985-06-19", place: "Gaziantep", description: "Aile buluşması", outsiders: "Aile dostumuz", peopleIds: [] };
const upload = async (call, name = "photo-1100.jpg", extra = {}) => {
  await call("/api/me"); // picks up the CSRF token
  return call("/api/experience/memories", "POST", { clientId: crypto.randomUUID(), photos: [{ ...meta, data: fixture64(name) }], ...extra });
};
// Job context over the fixture's database and bucket, as the Node server would build it.
const jobCtx = ({ db, env }) => ({
  one: async (sql, ...a) => db.prepare(sql).get(...a),
  all: async (sql, ...a) => db.prepare(sql).all(...a),
  run: async (sql, ...a) => db.prepare(sql).run(...a),
  storage: { put: (k, b) => env.BUCKET.put(k, b), get: (k) => env.BUCKET.get(k) },
});

test("image check reads the real structure and pixel size, and refuses cut-off or disguised files", () => {
  const jpg = new Uint8Array(readFileSync("tests/fixtures/photo-1100.jpg"));
  assert.deepEqual(inspectImage(jpg), { mime: "image/jpeg", width: 1100, height: 733 });
  assert.deepEqual(inspectImage(new Uint8Array(readFileSync("tests/fixtures/copy-320.webp"))), { mime: "image/webp", width: 320, height: 213 });
  assert.throws(() => inspectImage(jpg.subarray(0, jpg.length - 100)), /geçerli/);
  const fakeWebp = new Uint8Array(64);
  fakeWebp.set([82, 73, 70, 70], 0);
  fakeWebp.set([87, 69, 66, 80], 8);
  assert.throws(() => inspectImage(fakeWebp), /geçerli/);
  // A tiny PNG that claims 20,000 × 20,000 pixels (a decompression bomb) is refused by size.
  const png = new Uint8Array(readFileSync("public/assets/images/layers.png"));
  const bomb = png.slice();
  new DataView(bomb.buffer).setUint32(16, 20000);
  new DataView(bomb.buffer).setUint32(20, 20000);
  assert.throws(() => inspectImage(bomb), /çok büyük/);
  assert.throws(() => inspectImage(jpg, ["image/webp"]), /WEBP/);
});

test("uploads record the real size; copies must really be the size they claim; partial copies stay listed", async () => {
  const { call } = fixture();
  const up = await upload(call);
  assert.equal(up.status, 201);
  const id = up.body.id;
  assert.equal(up.body.optimization, "client", "the Worker has no image library, so the browser makes copies");
  let item = (await call("/api/experience/memories/" + id)).body;
  assert.deepEqual([item.media.width, item.media.height, item.media.status], [1100, 733, "pending"]);
  const put = (variants, extra = {}) => call("/api/experience/memories/" + id + "/variants", "PUT", { variants, ...extra });
  // The declared original size is ignored; the stored file decides (1100 px, so 1600 is refused).
  assert.equal((await put([{ width: 1600, data: fixture64("copy-640.webp") }], { width: 5000, height: 4000 })).status, 400);
  assert.equal((await put([{ width: 320, data: fixture64("copy-300-wrong.webp") }])).status, 400, "300 px file sent as 320");
  assert.equal((await put([{ width: 320, data: fixture64("photo-1100.jpg") }])).status, 400, "an 1100 px file sent as 320");
  const ok = await put([
    { width: 320, data: fixture64("copy-320.webp") },
    { width: 640, data: fixture64("copy-640.webp") },
  ]);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.missing, [1080]);
  const missing = (await call("/api/experience/memories/variants/missing")).body;
  assert.deepEqual(missing.items.find((x) => x.id === id).missing, [1080], "a photo with some copies is still listed");
  item = (await call("/api/experience/memories/" + id)).body;
  assert.deepEqual([item.media.variants, item.media.status], [[320, 640], "pending"]);
});

test("background optimiser makes the missing copies, records failures and retries later", async () => {
  const f = fixture();
  const ctx = jobCtx(f);
  const id = (await upload(f.call)).body.id;
  const t0 = Date.parse("2026-09-27T10:00:00Z");
  const failing = async () => {
    throw Error("encoder unavailable");
  };
  assert.deepEqual(await runMediaJobs(ctx, { now: t0, encode: failing }), { ready: 0, failed: 1 });
  let row = f.db.prepare("SELECT status,attempts,lastError,nextAttemptAt FROM photo_media WHERE photoId=?").get(id);
  assert.deepEqual([row.status, row.attempts, row.lastError], ["failed", 1, "encoder unavailable"]);
  assert.ok(Date.parse(row.nextAttemptAt) > t0, "retry is scheduled, not immediate");
  assert.deepEqual(await runMediaJobs(ctx, { now: t0 + 1000 }), { ready: 0, failed: 0 }, "not retried before its time");
  assert.deepEqual(await runMediaJobs(ctx, { now: t0 + 3600_000 }), { ready: 1, failed: 0 });
  row = f.db.prepare("SELECT status,lastError FROM photo_media WHERE photoId=?").get(id);
  assert.deepEqual([row.status, row.lastError], ["ready", null]);
  const widths = f.db
    .prepare("SELECT width FROM photo_variants WHERE photoId=? ORDER BY width")
    .all(id)
    .map((r) => r.width);
  assert.deepEqual(widths, [320, 640, 1080]);
  const small = await f.call("/media/" + id + "?w=320");
  assert.equal(inspectImage(new Uint8Array(small.body)).width, 320);
});

test("photos saved before status tracking are adopted and completed", async () => {
  const f = fixture();
  const id = (await upload(f.call)).body.id;
  f.db.prepare("DELETE FROM photo_media WHERE photoId=?").run(id);
  assert.deepEqual(await runMediaJobs(jobCtx(f), { now: Date.now() }), { ready: 1, failed: 0 });
  assert.equal(f.db.prepare("SELECT width FROM photo_media WHERE photoId=?").get(id).width, 1100);
});
