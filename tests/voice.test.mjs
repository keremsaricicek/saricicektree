// Voice comments in Hayat: real audio only (checked from the bytes), 1 s – 3 min, at most 3 MB,
// played back under the post's visibility, and never exposing the stored file name.
import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./support/worker-fixture.mjs";

/** A real, playable 16-bit mono WAV of `seconds` of silence. */
function wav(seconds = 1, rate = 8000) {
  const data = Buffer.alloc(seconds * rate * 2),
    h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return "data:audio/wav;base64," + Buffer.concat([h, data]).toString("base64");
}

test("voice comments: stored checked, listed without the file name, played back only for readers", async () => {
  const { db, call, member } = fixture();
  const a = await member("ses@test.invalid"),
    b = await member("dinleyen@test.invalid"),
    c = await member("disarida@test.invalid");
  await call("/api/me", "GET", null, a.email);
  const post = (
    await call(
      "/api/experience/feed",
      "POST",
      { body: "Seçili", visibility: "selected", userIds: [b.id], clientId: crypto.randomUUID(), peopleIds: [] },
      a.email,
    )
  ).body.id;
  const comments = "/api/experience/feed/" + post + "/comments";

  // Voice only (no text) is a valid comment.
  const sent = await call(comments, "POST", { body: "", audio: { data: wav(2), mime: "audio/wav", seconds: 2 } }, b.email);
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  const [item] = (await call(comments, "GET", null, a.email)).body.items;
  assert.equal(item.body, "");
  assert.deepEqual(item.audio, { url: "/api/experience/feed/comments/" + item.id + "/audio", seconds: 2 });
  assert.ok(!("audioFile" in item) && !JSON.stringify(item).includes("feed-audio/"), "the storage key never reaches the page");

  const played = await call(item.audio.url, "GET", null, a.email);
  assert.equal(played.status, 200);
  assert.ok(new Uint8Array(played.body).length > 16000);
  assert.equal((await call(item.audio.url, "GET", null, c.email)).status, 404, "someone who cannot see the post cannot play it");

  // Refused: not audio, too short, too long, too big.
  const fake = "data:audio/wav;base64," + Buffer.from("<script>alert(1)</script>".repeat(20)).toString("base64");
  for (const [audio, status] of [
    [{ data: fake, mime: "audio/wav", seconds: 2 }, 400],
    [{ data: wav(1), mime: "audio/wav", seconds: 0 }, 400],
    [{ data: wav(1), mime: "audio/wav", seconds: 181 }, 400],
    [{ data: "data:audio/wav;base64," + Buffer.alloc(3.2 * 1024 * 1024).toString("base64"), mime: "audio/wav", seconds: 5 }, 413],
  ])
    assert.equal((await call(comments, "POST", { body: "", audio }, b.email)).status, status, JSON.stringify(audio).slice(0, 60));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM feed_comments WHERE audioFile IS NOT NULL").get().n, 1, "refused recordings leave nothing behind");

  // A removed comment's recording is no longer served.
  await call("/api/experience/feed/comments/" + item.id, "DELETE", {}, b.email);
  assert.equal((await call(item.audio.url, "GET", null, a.email)).status, 404);
});
