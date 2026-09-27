import test from "node:test";
import assert from "node:assert/strict";

import { fixture } from "./support/worker-fixture.mjs";
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5L8AAAAASUVORK5CYII=";
test("floating chat API isolates files and replies, persists receipts, typing and deduplicated group sends", async () => {
  const { call, member } = fixture();
  const a = await member("a@test.invalid"),
    b = await member("b@test.invalid"),
    c = await member("c@test.invalid");
  const base = "/api/experience/conversations/dm/" + b.id;
  const upload = await call("/api/experience/attachments", "POST", { kind: "dm", targetId: b.id, mime: "image/png", data: png }, a.email);
  assert.equal(upload.status, 201);
  const file = upload.body.id;
  assert.equal((await call("/api/experience/media/" + file, "GET", null, c.email)).status, 404);
  assert.equal((await call("/api/experience/media/" + file, "GET", null, b.email)).status, 200);
  let r = await call(base, "POST", { body: "hello", attachmentId: file, clientId: crypto.randomUUID() }, a.email);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const sent = (await call(base, "GET", null, a.email)).body.items[0];
  assert.equal(sent.attachment.id, file);
  await call("/api/chat/read", "POST", { userId: a.id, through: sent.id }, b.email);
  assert.ok((await call(base, "GET", null, a.email)).body.items[0].readAt);
  assert.equal(
    (await call("/api/experience/conversations/dm/" + c.id, "POST", { body: "leak", attachmentId: file, clientId: crypto.randomUUID() }, a.email)).status,
    400,
  );
  await call("/api/experience/typing/dm/" + a.id, "POST", {}, b.email);
  assert.equal((await call(base, "GET", null, a.email)).body.typing.length, 1);
  assert.equal((await call(base, "POST", { body: "reply", replyId: sent.id, clientId: crypto.randomUUID() }, a.email)).status, 201);
  assert.equal((await call(base, "GET", null, a.email)).body.items[1].reply.id, sent.id);
  const g = (await call("/api/archive/groups", "POST", { name: "Friends", members: [a.id, b.id] })).body.id;
  const gp = "/api/experience/conversations/group/" + g,
    body = { body: "group hello", clientId: crypto.randomUUID() };
  assert.equal((await call(gp, "POST", body, a.email)).status, 201);
  assert.equal((await call(gp, "POST", body, a.email)).status, 200);
  assert.equal((await call(gp, "GET", null, a.email)).body.items.length, 1);
  assert.equal((await call(gp, "GET", null, c.email)).status, 404);
  await call("/api/archive/groups/" + g, "DELETE", { userId: a.id });
  assert.equal((await call(gp, "GET", null, a.email)).status, 404);
  await call("/api/chat/block", "POST", { userId: a.id }, b.email);
  assert.equal((await call(base, "POST", { body: "blocked", clientId: crypto.randomUUID() }, a.email)).status, 403);
  assert.equal((await call("/api/account", "DELETE", { confirm: "HESABIMI SİL" }, a.email)).status, 200);
  assert.equal((await call("/api/experience/media/" + file, "GET", null, b.email)).status, 404);
});
test("selected and group audiences apply to raw photos, archive comments and search with revocation", async () => {
  const { call, member } = fixture();
  const a = await member("a@test.invalid"),
    b = await member("b@test.invalid");
  const id = (await call("/api/photos", "POST", { title: "Gizli hatıra", data: png })).body.id;
  let r = await call("/api/experience/audience/photo/" + id, "PUT", { mode: "selected", userIds: [a.id] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await call("/api/bootstrap", "GET", null, b.email)).body.photos.length, 0);
  assert.equal((await call("/media/" + id, "GET", null, b.email)).status, 404);
  assert.equal((await call("/media/" + id, "GET", null, a.email)).status, 200);
  assert.equal((await call("/api/search?q=Gizli", "GET", null, b.email)).body.items.length, 0);
  assert.equal((await call("/api/search?q=Gizli", "GET", null, a.email)).body.items.length, 1);
  const entry = (await call("/api/archive/entries", "POST", { kind: "memory", title: "Gizli hikaye", body: "secret", data: {}, visibility: "family" })).body.id;
  const g = (await call("/api/archive/groups", "POST", { name: "Selected", members: [a.id] })).body.id;
  await call("/api/experience/audience/archive/" + entry, "PUT", { mode: "group", groupId: g });
  assert.equal((await call("/api/archive/entries/" + entry, "GET", null, a.email)).status, 200);
  assert.equal((await call("/api/archive/entries/" + entry, "GET", null, b.email)).status, 404);
  assert.equal((await call("/api/archive/entries/" + entry + "/comments", "GET", null, b.email)).status, 404);
  const search = await call("/api/search?q=Gizli", "GET", null, b.email);
  assert.equal(search.status, 200, JSON.stringify(search.body));
  assert.equal(search.body.items.length, 0);
  await call("/api/archive/groups/" + g, "DELETE", { userId: a.id });
  assert.equal((await call("/api/archive/entries/" + entry, "GET", null, a.email)).status, 404);
});
test("profile field privacy and account binding require authority", async () => {
  const { call, member } = fixture();
  const a = await member("a@test.invalid"),
    b = await member("b@test.invalid");
  const id = (await call("/api/people", "POST", { name: "Profile person" })).body.id,
    path = "/api/experience/profile/" + id;
  assert.equal((await call(path, "PUT", { fields: {} }, a.email)).status, 403);
  const fields = {
    intro: { value: "Private bio", visibility: "private" },
    profession: { value: "Designer", visibility: "family" },
    interests: { value: "Music", visibility: "selected", users: [b.id] },
  };
  assert.equal((await call(path, "PUT", { userId: a.id, fields })).status, 200);
  assert.equal((await call(path, "GET", null, b.email)).body.fields.intro, undefined);
  assert.equal((await call(path, "GET", null, b.email)).body.fields.interests.value, "Music");
  assert.equal((await call(path, "GET", null, a.email)).body.fields.intro.value, "Private bio");
  assert.equal((await call(path, "PUT", { fields }, a.email)).status, 200);
  assert.equal((await call("/api/experience/me", "GET", null, a.email)).body.personId, id);
  await call("/api/archive/guardians", "PUT", { personId: id, userId: a.id });
  assert.equal((await call(path, "GET", null, b.email)).status, 404);
});
test("private-at-upload photos never enter another members bootstrap", async () => {
  const { call, member } = fixture();
  const a = await member("a@test.invalid");
  const r = await call("/api/photos", "POST", { title: "Private upload", data: png, visibility: "private" });
  assert.equal(r.status, 201);
  assert.equal((await call("/media/" + r.body.id, "GET", null, a.email)).status, 404);
  assert.equal((await call("/api/bootstrap", "GET", null, a.email)).body.photos.length, 0);
});
test("sharing a private archive entry cannot bypass moderation", async () => {
  const { call, member } = fixture();
  const a = await member("a@test.invalid"),
    b = await member("b@test.invalid");
  const id = (
    await call(
      "/api/archive/entries",
      "POST",
      { kind: "memory", title: "Member memory", body: "private then shared", visibility: "private", data: {} },
      a.email,
    )
  ).body.id;
  assert.equal((await call("/api/experience/audience/archive/" + id, "PUT", { mode: "selected", userIds: [b.id] }, a.email)).status, 200);
  assert.equal((await call("/api/archive/entries/" + id, "GET", null, b.email)).status, 404);
  assert.equal((await call("/api/archive/entries/" + id, "GET", null, a.email)).body.status, "pending");
});
