// Video in Hayat and Avlu, against the real Node server with a real ffmpeg (ffmpeg-static, tests only):
// pieces that resume from where they stopped, size/length/type limits from the bytes, playback copy and cover,
// Range playback, access through the album photo it belongs to, cleanup, and the fallback without ffmpeg.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { sniffVideo } from "../src/video.mjs";

const work = mkdtempSync(join(tmpdir(), "sf-video-src-"));
const make = (name, args) => {
  execFileSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...args, join(work, name)]);
  return readFileSync(join(work, name));
};
const mp4 = make("a.mp4", [
  "-f",
  "lavfi",
  "-i",
  "testsrc=duration=3:size=320x240:rate=10",
  "-f",
  "lavfi",
  "-i",
  "sine=duration=3",
  "-c:v",
  "libx264",
  "-c:a",
  "aac",
  "-shortest",
]);
const webm = make("b.webm", ["-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=10", "-c:v", "libvpx", "-b:v", "200k"]);
const long = make("long.mp4", ["-f", "lavfi", "-i", "testsrc=duration=8:size=160x120:rate=5", "-c:v", "libx264"]);
const m4a = make("voice.m4a", ["-f", "lavfi", "-i", "sine=duration=2", "-c:a", "aac"]);
const poster = "data:image/jpeg;base64," + make("poster.jpg", ["-f", "lavfi", "-i", "testsrc=size=320x240", "-frames:v", "1"]).toString("base64");
test.after(() => rmSync(work, { recursive: true, force: true }));

test("container type is read from the bytes, not the name", () => {
  assert.equal(sniffVideo(mp4.subarray(0, 64)), "video/mp4");
  assert.equal(sniffVideo(webm.subarray(0, 64)), "video/webm");
  assert.equal(sniffVideo(m4a.subarray(0, 64)), null, "audio-only MP4 is not a video");
  assert.equal(sniffVideo(Buffer.from("<html><script>alert(1)</script></html>")), null);
});

async function server(t, extra) {
  const data = mkdtempSync(join(tmpdir(), "sf-video-")),
    port = 35000 + Math.floor(Math.random() * 1000),
    origin = `http://localhost:${port}`;
  const env = {
    ...process.env,
    DATA_DIR: data,
    PORT: String(port),
    APP_ORIGIN: origin,
    MEDIA_JOBS: "off",
    ADMIN_EMAIL: "owner@video.test",
    ADMIN_PASSWORD: "owner-long-password",
    VIDEO_MAX_SECONDS: "5",
    ...extra,
  };
  execFileSync(process.execPath, ["src/admin.mjs"], { env, stdio: "pipe" });
  const proc = spawn(process.execPath, ["src/server.mjs"], { env, stdio: ["ignore", "pipe", "pipe"] });
  t.after(async () => {
    proc.kill();
    await once(proc, "exit");
    rmSync(data, { recursive: true, force: true });
  });
  for (;;) if (String((await once(proc.stdout, "data"))[0]).includes(origin)) break;
  const call = async (path, method = "GET", body, s = {}, headers = {}) => {
    const raw = body instanceof Uint8Array;
    const res = await fetch(origin + path, {
      method,
      headers: {
        origin,
        "content-type": raw ? "application/octet-stream" : "application/json",
        ...(s.cookie ? { cookie: s.cookie, "x-csrf-token": s.csrf } : {}),
        ...headers,
      },
      ...(body ? { body: raw ? body : JSON.stringify(body) } : {}),
    });
    const type = res.headers.get("content-type") || "";
    const out = type.includes("json") ? await res.json() : new Uint8Array(await res.arrayBuffer());
    return { status: res.status, body: out, headers: res.headers, cookie: res.headers.get("set-cookie")?.split(";")[0], csrf: out.csrf };
  };
  const owner = await call("/api/login", "POST", { email: "owner@video.test", password: "owner-long-password" });
  const member = async (email) => {
    const invite = await call("/api/invites", "POST", { email, role: "member" }, owner);
    const token = invite.body.url.split("=")[1];
    await call("/api/accept-invite", "POST", { token, name: email.split("@")[0], password: "member-long-password" });
    return call("/api/login", "POST", { email, password: "member-long-password" });
  };
  /** Uploads `bytes` in two pieces (the first one twice, as a lost answer would) and completes it. */
  const upload = async (s, bytes, mime) => {
    const up = await call("/api/experience/videos/uploads", "POST", { size: bytes.length, mime }, s);
    assert.equal(up.status, 201, JSON.stringify(up.body));
    const url = "/api/experience/videos/uploads/" + up.body.id,
      half = Math.floor(bytes.length / 2);
    assert.equal((await call(url + "?offset=0", "PUT", bytes.subarray(0, half), s)).status, 200);
    const again = await call(url + "?offset=0", "PUT", bytes.subarray(0, half), s);
    assert.equal(again.status, 409, "a piece sent twice is refused and the right offset returned");
    assert.equal(again.body.received, half);
    assert.equal((await call(url, "GET", null, s)).body.received, half);
    assert.equal((await call(url + "?offset=" + half, "PUT", bytes.subarray(half), s)).status, 200);
    return call(url + "/complete", "POST", { poster }, s);
  };
  const ready = async (id, s) => {
    for (let i = 0; i < 200; i++) {
      const v = (await call("/api/experience/videos/" + id, "GET", null, s)).body;
      if (v.status !== "processing") return v;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error("video did not finish processing");
  };
  return { data, call, owner, member, upload, ready };
}

test("upload, playback copy, Range playback, access through the album photo, limits and cleanup", async (t) => {
  const { data, call, owner, member, upload, ready } = await server(t, { FFMPEG_PATH: ffmpegPath });
  const config = (await call("/api/config")).body.video;
  assert.deepEqual(config, { maxMb: 200, maxSeconds: 5, playbackCopies: true });
  const a = await member("ayse@video.test"),
    b = await member("baran@video.test");
  const person = (await call("/api/people", "POST", { name: "Deniz Sarıçiçek" }, owner)).body.id;

  // Refused before anything is stored.
  assert.equal((await call("/api/experience/videos/uploads", "POST", { size: 201 * 1048576, mime: "video/mp4" }, a)).status, 413);
  assert.equal((await call("/api/experience/videos/uploads", "POST", { size: 100, mime: "image/gif" }, a)).status, 400);
  assert.equal((await call("/api/experience/videos/uploads", "POST", { size: 100, mime: "video/mp4" })).status, 401);

  // Refused after the bytes are checked: not a video, audio only, too long. Nothing is left behind.
  const fake = new TextEncoder().encode("<html>" + "x".repeat(4000) + "</html>");
  for (const [bytes, mime, status, pattern] of [
    [fake, "video/mp4", 400, /video değil/],
    [m4a, "video/mp4", 400, /video değil|görüntü yok/],
    [long, "video/mp4", 413, /en fazla/],
  ]) {
    const r = await upload(a, bytes, mime);
    assert.equal(r.status, status, JSON.stringify(r.body));
    assert.match(r.body.error, pattern);
  }
  assert.deepEqual(readdirSync(join(data, "uploads-tmp")), [], "refused uploads are removed");

  // MP4: processed into a playback copy with a cover.
  const done = await upload(a, mp4, "video/mp4");
  assert.equal(done.status, 201, JSON.stringify(done.body));
  assert.equal(done.body.status, "processing");
  assert.equal(done.body.seconds, 3);
  const v = await ready(done.body.id, a);
  assert.equal(v.status, "ready");
  assert.equal(v.width, 320);
  assert.ok(existsSync(join(data, "uploads", "videos", v.id, "playback.mp4")));

  // Before it is shared only its uploader can see it.
  assert.equal((await call("/api/experience/videos/" + v.id, "GET", null, b)).status, 404);
  assert.equal((await call(v.play, "GET", null, b)).status, 404);
  const played = await call(v.play, "GET", null, a, { range: "bytes=0-99" });
  assert.equal(played.status, 206);
  assert.equal(played.headers.get("content-type"), "video/mp4");
  assert.match(played.headers.get("content-range"), /^bytes 0-99\/\d+$/);
  assert.equal(played.body.length, 100);
  assert.equal((await call(v.play, "GET", null, a, { range: "bytes=99999999-" })).status, 416);

  // Shared to Hayat through Avlu (the same path as photos): family members can watch it.
  const memory = {
    clientId: crypto.randomUUID(),
    share: true,
    body: "Bayram videosu",
    visibility: "family",
    userIds: [],
    photos: [{ data: poster, videoId: v.id, title: "Bayram", date: "2024-04-10", place: "Antep", description: "Bayram sabahı", peopleIds: [person] }],
  };
  const saved = await call("/api/experience/memories", "POST", memory, a);
  assert.equal(saved.status, 201, JSON.stringify(saved.body));
  const feed = (await call("/api/experience/feed", "GET", null, b)).body.items;
  const image = feed.find((p) => p.body === "Bayram videosu").images[0];
  assert.deepEqual(
    { ...image.video, play: undefined },
    { id: v.id, status: "ready", seconds: 3, width: 320, height: 240, play: undefined, poster: "/api/experience/videos/" + v.id + "/poster" },
  );
  assert.equal((await call(image.video.play, "GET", null, b)).status, 200);
  const cover = await call(image.video.poster, "GET", null, b);
  assert.equal(cover.headers.get("content-type"), "image/jpeg");
  assert.equal((await call("/api/experience/memories/" + saved.body.id, "GET", null, b)).body.video.id, v.id);

  // A video belongs to one photo only, and only its uploader can attach it.
  const twice = await call("/api/experience/memories", "POST", { ...memory, clientId: crypto.randomUUID(), share: false }, a);
  assert.equal(twice.status, 409);
  const stolen = await call("/api/experience/memories", "POST", { ...memory, clientId: crypto.randomUUID(), share: false }, b);
  assert.equal(stolen.status, 400);

  // A private album video stays private.
  const w = await ready((await upload(a, webm, "video/webm")).body.id, a);
  assert.equal(w.status, "ready", "WebM is converted to a playable MP4");
  const privateMemory = { ...memory, clientId: crypto.randomUUID(), share: false, visibility: "private", photos: [{ ...memory.photos[0], videoId: w.id }] };
  assert.equal((await call("/api/experience/memories", "POST", privateMemory, a)).status, 201);
  assert.equal((await call(w.play, "GET", null, b)).status, 404);
  const copy = await call(w.play, "GET", null, a);
  assert.equal(copy.headers.get("content-type"), "video/mp4");

  // Leaving the family removes unshared uploads; shared videos stay with the family's album.
  const loose = (await upload(b, mp4, "video/mp4")).body.id;
  await ready(loose, b);
  assert.ok(existsSync(join(data, "uploads", "videos", loose)));
  assert.equal((await call("/api/account", "DELETE", { confirm: "HESABIMI SİL" }, b)).status, 200);
  assert.ok(!existsSync(join(data, "uploads", "videos", loose)), "an unshared video is removed with the account");
  assert.ok(existsSync(join(data, "uploads", "videos", v.id)));
});

test("without ffmpeg: MP4 plays as uploaded, other formats are refused clearly", async (t) => {
  const { call, member, upload } = await server(t, { FFMPEG_PATH: "/nonexistent/ffmpeg", PATH: "/nonexistent" });
  assert.equal((await call("/api/config")).body.video.playbackCopies, false);
  const a = await member("ayse@video.test");
  const done = await upload(a, mp4, "video/mp4");
  assert.equal(done.status, 201, JSON.stringify(done.body));
  assert.equal(done.body.status, "ready");
  assert.equal(done.body.seconds, 3);
  assert.equal((await call(done.body.play, "GET", null, a)).headers.get("content-type"), "video/mp4");
  const w = await upload(a, webm, "video/webm");
  assert.equal(w.status, 400);
  assert.match(w.body.error, /MP4/);
  const tooLong = await upload(a, long, "video/mp4");
  assert.equal(tooLong.status, 413, "length is read from the MP4 header even without ffmpeg");
});
