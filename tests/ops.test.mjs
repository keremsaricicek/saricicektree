// Error records for the admin panel: browser reports, unexpected server failures, access rules.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fixture } from "./support/worker-fixture.mjs";

test("browser error reports are stored with limited fields and only staff can read them", async () => {
  const { call, member } = fixture();
  await member("uye@test.invalid");
  await call("/api/me", "GET", null, "uye@test.invalid");
  const sent = await call(
    "/api/experience/ops/client-error",
    "POST",
    { event: "photo.variants_failed", message: "x".repeat(500), area: "gallery" },
    "uye@test.invalid",
  );
  assert.equal(sent.status, 201);
  assert.equal((await call("/api/experience/ops/client-error", "POST", { event: "Bad Event!" }, "uye@test.invalid")).status, 400);
  assert.equal((await call("/api/experience/ops/errors", "GET", null, "uye@test.invalid")).status, 403);
  const list = await call("/api/experience/ops/errors");
  assert.equal(list.status, 200);
  const [item] = list.body.items;
  assert.equal(item.source, "client");
  assert.equal(item.event, "photo.variants_failed");
  assert.equal(item.message.length, 200);
});

test("an unexpected server failure is answered generically and recorded without the request body", async () => {
  const { call, env } = fixture();
  env.BUCKET.put = async () => {
    throw new Error("bucket unavailable");
  };
  await call("/api/me");
  const data = "data:image/jpeg;base64," + readFileSync("tests/fixtures/photo-1100.jpg").toString("base64");
  const photo = { date: "1985-06-19", place: "Gaziantep", description: "Özel aile notu", outsiders: "Aile dostumuz", peopleIds: [], data };
  const r = await call("/api/experience/memories", "POST", { clientId: crypto.randomUUID(), photos: [photo] });
  assert.equal(r.status, 500);
  assert.equal(r.body.error, "İşlem tamamlanamadı. Lütfen tekrar deneyin.");
  const [item] = (await call("/api/experience/ops/errors")).body.items;
  assert.equal(item.source, "server");
  assert.equal(item.event, "request.failed");
  assert.equal(item.message, "bucket unavailable");
  assert.ok(!JSON.stringify(item).includes("Özel aile notu"));
});

test("usage summary counts activity without exposing message text, and is staff-only", async () => {
  const { call, member } = fixture();
  const a = await member("aktif@test.invalid"),
    b = await member("sessiz@test.invalid");
  await call("/api/me", "GET", null, a.email);
  await call("/api/experience/feed", "POST", { body: "Herkese merhaba", visibility: "family", clientId: crypto.randomUUID(), peopleIds: [] }, a.email);
  await call("/api/experience/conversations/dm/" + b.id, "POST", { body: "Gizli mesaj metni", clientId: crypto.randomUUID() }, a.email);
  await call("/api/invites", "POST", { email: "bekleyen@test.invalid", role: "member" });
  assert.equal((await call("/api/experience/ops/usage", "GET", null, a.email)).status, 403);
  const r = await call("/api/experience/ops/usage");
  assert.equal(r.status, 200);
  assert.equal(r.body.members.active, 3);
  assert.equal(r.body.members.contributing7, 1, "only the member who posted and wrote counts as contributing");
  assert.deepEqual(r.body.invites, { pending: 1, accepted: 2, expired: 0 });
  assert.equal(r.body.content.posts.total, 1);
  assert.equal(r.body.content.privateMessages.total, 1);
  const text = JSON.stringify(r.body);
  for (const secret of ["Gizli mesaj metni", "Herkese merhaba", "aktif@test.invalid", "bekleyen@test.invalid"])
    assert.ok(!text.includes(secret), "usage exposes " + secret);
  assert.equal(r.body.storage, null, "the Worker has no file storage figures");
});
