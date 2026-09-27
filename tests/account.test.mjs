// Account deletion removes a member's personal data everywhere. What the family shared together
// (public posts, comments, group messages) stays, shown as "Silinen üye".
import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./support/worker-fixture.mjs";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5L8AAAAASUVORK5CYII=";

test("deleting an account leaves no row that names the member and no personal rows", async () => {
  const { db, call, member } = fixture();
  const a = await member("leaving.member@test.invalid"),
    b = await member("staying@test.invalid");
  const feed = "/api/experience/feed";
  const post = async (body, visibility = "family") =>
    (await call(feed, "POST", { body, visibility, clientId: crypto.randomUUID(), peopleIds: [] }, a.email)).body.id;
  const shared = await post("Bayram sofrası çok güzeldi.");
  const privatePost = await post("Kendime not.", "private");
  const other = (await call(feed, "POST", { body: "Staying member post", visibility: "family", clientId: crypto.randomUUID(), peopleIds: [] }, b.email)).body
    .id;
  assert.ok(shared && privatePost && other);
  assert.equal((await call(feed + "/" + other + "/comments", "POST", { body: "Ne güzel!" }, a.email)).status, 201);
  const comment = db.prepare("SELECT id FROM feed_comments WHERE createdBy=?").get(a.id).id;
  const theirComment = (await call(feed + "/" + shared + "/comments", "POST", { body: "Evet!" }, b.email)).status;
  assert.equal(theirComment, 201);
  const bComment = db.prepare("SELECT id FROM feed_comments WHERE createdBy=?").get(b.id).id;
  for (const [path, body] of [
    [feed + "/" + other + "/like", {}],
    [feed + "/" + other + "/save", {}],
    [feed + "/" + other + "/reaction", { emoji: "🌿" }],
    ["/api/experience/feed/comments/" + bComment + "/like", {}],
    ["/api/experience/preferences", { easy: true }],
  ])
    assert.equal((await call(path, "PUT", body, a.email)).status, 200, path);
  const file = (await call("/api/experience/attachments", "POST", { kind: "dm", targetId: b.id, mime: "image/png", data: png }, a.email)).body.id;
  assert.equal(
    (await call("/api/experience/conversations/dm/" + b.id, "POST", { body: "Özel mesaj", attachmentId: file, clientId: crypto.randomUUID() }, a.email)).status,
    201,
  );
  const group = (await call("/api/archive/groups", "POST", { name: "Kuzenler", members: [a.id, b.id] })).body.id;
  assert.equal(
    (await call("/api/experience/conversations/group/" + group, "POST", { body: "Herkese selam", clientId: crypto.randomUUID() }, a.email)).status,
    201,
  );
  const person = (await call("/api/people", "POST", { name: "Bağlı Kişi" })).body.id;
  db.prepare("INSERT INTO profile_details VALUES(?,?,?)").run(person, a.id, "{}");

  assert.equal((await call("/api/account", "DELETE", { confirm: "HESABIMI SİL" }, a.email)).status, 200);

  // 1. Nothing anywhere still carries the e-mail address (also used as the display name here).
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  const naming = tables.map((t) => t.name).filter((name) => JSON.stringify(db.prepare(`SELECT * FROM "${name}"`).all()).includes("leaving.member"));
  assert.deepEqual(naming, [], "tables that still name the deleted member");
  // 2. Personal rows are gone.
  const personal = {
    user_preferences: "userId",
    feed_reactions: "userId",
    feed_saved: "userId",
    feed_emoji: "userId",
    feed_comment_likes: "userId",
    feed_notifications: "userId",
    group_members: "userId",
    push_subscriptions: "userId",
    profile_details: "userId",
    messages: "senderId",
    chat_attachments: "senderId",
  };
  const kept = Object.entries(personal).filter(([table, column]) => db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${column}=?`).get(a.id).n);
  assert.deepEqual(
    kept.map(([t]) => t),
    [],
    "tables that keep personal rows",
  );
  assert.equal(db.prepare("SELECT deletedAt FROM feed_posts WHERE id=?").get(privatePost).deletedAt === null, false, "private post removed");
  // 3. Shared family content stays, credited to "Silinen üye".
  const feedNow = (await call(feed, "GET", null, b.email)).body.items;
  assert.equal(feedNow.find((p) => p.id === shared)?.author, "Silinen üye");
  assert.ok(db.prepare("SELECT id FROM feed_comments WHERE id=? AND deletedAt IS NULL").get(comment));
  assert.equal((await call("/api/experience/conversations/group/" + group, "GET", null, b.email)).body.items.length, 1);
  // 4. The linked profile person stays in the tree, no longer tied to an account.
  assert.ok(db.prepare("SELECT id FROM people WHERE id=? AND deletedAt IS NULL").get(person));
});

test("personal data export holds the member's own data and nothing private of others", async () => {
  const { db, call, member } = fixture();
  const a = await member("exporter@test.invalid"),
    b = await member("neighbour@test.invalid");
  db.prepare("UPDATE users SET name=? WHERE id=?").run("Komşu Ayşe", b.id); // the fixture names members by e-mail
  const feed = "/api/experience/feed";
  const mine = (await call(feed, "POST", { body: "Benim paylaşımım", visibility: "family", clientId: crypto.randomUUID(), peopleIds: [] }, a.email)).body.id;
  await call(feed, "POST", { body: "Komşunun gizli notu", visibility: "private", clientId: crypto.randomUUID(), peopleIds: [] }, b.email);
  const theirs = (await call(feed, "POST", { body: "Komşunun aile paylaşımı", visibility: "family", clientId: crypto.randomUUID(), peopleIds: [] }, b.email))
    .body.id;
  await call(feed + "/" + theirs + "/comments", "POST", { body: "Benim yorumum" }, a.email);
  await call(feed + "/" + theirs + "/like", "PUT", {}, a.email);
  await call("/api/experience/conversations/dm/" + b.id, "POST", { body: "Merhaba komşu", clientId: crypto.randomUUID() }, a.email);
  await call("/api/experience/conversations/dm/" + a.id, "POST", { body: "Merhaba, hoş geldin", clientId: crypto.randomUUID() }, b.email);
  const group = (await call("/api/archive/groups", "POST", { name: "Kuzenler", members: [a.id, b.id] })).body.id;
  await call("/api/experience/conversations/group/" + group, "POST", { body: "Komşunun grup mesajı", clientId: crypto.randomUUID() }, b.email);
  await call("/api/experience/conversations/group/" + group, "POST", { body: "Benim grup mesajım", clientId: crypto.randomUUID() }, a.email);

  const r = await call("/api/account/export", "GET", null, a.email);
  assert.equal(r.status, 200);
  const text = JSON.stringify(r.body);
  assert.equal(r.body.account.email, a.email);
  assert.deepEqual(
    r.body.posts.map((p) => p.id),
    [mine],
  );
  assert.deepEqual(
    r.body.comments.map((c) => c.body),
    ["Benim yorumum"],
  );
  assert.deepEqual(r.body.likedPosts, [theirs]);
  assert.deepEqual(
    r.body.messages.map((m) => [m.direction, m.with, m.body]),
    [
      ["gönderilen", "Komşu Ayşe", "Merhaba komşu"],
      ["gelen", "Komşu Ayşe", "Merhaba, hoş geldin"],
    ],
  );
  assert.deepEqual(
    r.body.groupMessages.map((m) => m.body),
    ["Benim grup mesajım"],
  );
  for (const secret of ["neighbour@test.invalid", "Komşunun gizli notu", "Komşunun grup mesajı", "Komşunun aile paylaşımı", "password", "authId"])
    assert.ok(!text.includes(secret), "export contains " + secret);
});
