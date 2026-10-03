// Videos for Hayat and Avlu (Node server).
// Upload: resumable, in chunks written straight to a temporary file (never whole in memory).
// Checks: the container is read from the file (MP4/MOV or WebM), size and length are limited.
// Processing: with ffmpeg, a playback copy (H.264/AAC MP4, at most 1280 px wide, "faststart") and a
// poster frame are made in the background, retried with growing delays; without ffmpeg an MP4 is
// played as uploaded and the poster comes from the browser. Playback is streamed with Range support.
//   VIDEO_MAX_MB (default 200), VIDEO_MAX_SECONDS (default 180), FFMPEG_PATH (default "ffmpeg")
import { execFile } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { assert } from "./domain.mjs";
import { log } from "./log.mjs";
import { recordError } from "./ops.mjs";
import { decodeUpload, inspectImage } from "./media-check.mjs";

const run = promisify(execFile);
export const CHUNK = 4 * 1024 * 1024;
const now = () => new Date().toISOString();

export function videoLimits(env = process.env) {
  return { bytes: Number(env.VIDEO_MAX_MB || 200) * 1024 * 1024, seconds: Number(env.VIDEO_MAX_SECONDS || 180) };
}

/** Container type from the first bytes: MP4/MOV ("ftyp" box) or WebM (EBML with the "webm" doc type). */
export function sniffVideo(head) {
  const b = Buffer.from(head);
  if (b.length >= 12 && b.toString("latin1", 4, 8) === "ftyp") {
    const brand = b.toString("latin1", 8, 12);
    if (/^M4[ABP]/.test(brand)) return null; // audio-only MP4 (voice memos, music)
    return brand.startsWith("qt") ? "video/quicktime" : "video/mp4";
  }
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 && b.includes("webm", 0, "latin1")) return "video/webm";
  return null;
}

/** Duration (and size when ffmpeg is present). Without ffmpeg only MP4/MOV headers are read. */
export async function probeVideo(path, ffmpeg) {
  if (ffmpeg) {
    const out = await run(ffmpeg, ["-hide_banner", "-i", path], { timeout: 30_000 }).catch((e) => ({ stderr: String(e.stderr || "") }));
    const text = String(out.stderr || "");
    const d = text.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/),
      size = text.match(/Video: [^\n]*?(\d{2,5})x(\d{2,5})/);
    if (!d) return null;
    return {
      seconds: Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]),
      width: size ? Number(size[1]) : null,
      height: size ? Number(size[2]) : null,
      video: /Stream #[^\n]*Video:/.test(text),
    };
  }
  return mp4Duration(path);
}

/** Reads moov/mvhd from an MP4/MOV file (the box may be at the end of the file). */
async function mp4Duration(path) {
  const fh = await open(path);
  try {
    const { size } = await fh.stat();
    const header = Buffer.alloc(16);
    let pos = 0;
    while (pos + 8 <= size) {
      await fh.read(header, 0, 16, pos);
      let len = header.readUInt32BE(0);
      const type = header.toString("latin1", 4, 8);
      if (len === 1) len = Number(header.readBigUInt64BE(8));
      if (len < 8) return null;
      if (type === "moov") {
        const moov = Buffer.alloc(Math.min(len, 4 * 1024 * 1024));
        await fh.read(moov, 0, moov.length, pos);
        const i = moov.indexOf("mvhd", 0, "latin1");
        if (i < 0) return null;
        const version = moov[i + 4];
        const timescale = version === 1 ? moov.readUInt32BE(i + 24) : moov.readUInt32BE(i + 16);
        const duration = version === 1 ? Number(moov.readBigUInt64BE(i + 28)) : moov.readUInt32BE(i + 20);
        return timescale ? { seconds: duration / timescale, width: null, height: null, video: true } : null;
      }
      pos += len;
    }
    return null;
  } finally {
    await fh.close();
  }
}

export async function findFfmpeg(env = process.env) {
  const candidate = env.FFMPEG_PATH || "ffmpeg";
  try {
    await run(candidate, ["-version"], { timeout: 10_000 });
    return candidate;
  } catch {
    return null;
  }
}

/**
 * @param {{ all: Function, one: Function, run: Function }} db
 * @param {{ dataDir: string, ffmpeg: string|null, env?: Record<string,string|undefined> }} options
 */
export function createVideos(db, { dataDir, ffmpeg, env = process.env }) {
  const limits = videoLimits(env);
  const tmpDir = join(dataDir, "uploads-tmp"),
    dirOf = (id) => join(dataDir, "uploads", "videos", id);
  let busy = false,
    timer = null;

  async function session(u, id) {
    const s = await db.one("SELECT * FROM upload_sessions WHERE id=? AND userId=?", id, u.id);
    assert(s && s.expiresAt > now(), 404, "Yükleme bulunamadı ya da süresi doldu; videoyu yeniden seç.");
    return s;
  }

  const UNATTACHED = "NOT EXISTS(SELECT 1 FROM photos WHERE photos.videoId=videos.id)";
  async function dropUpload(id) {
    await rm(join(tmpDir, id), { force: true });
    await db.run("DELETE FROM upload_sessions WHERE id=?", id);
  }
  async function dropVideo(id) {
    await rm(dirOf(id), { recursive: true, force: true });
    await db.run("DELETE FROM videos WHERE id=?", id);
  }

  /** Whether this account may watch the video: its uploader, or a reader of the post/photo it belongs to. */
  async function canWatch(u, id, helpers) {
    const v = await db.one("SELECT * FROM videos WHERE id=?", id);
    if (!v) return null;
    if (v.createdBy === u.id) return v;
    const photo = await db.one("SELECT id FROM photos WHERE videoId=? AND deletedAt IS NULL", id);
    if (photo && (await helpers.visiblePhoto(db.one, u, photo.id))) return v;
    return null;
  }

  async function makePlaybackCopy(v) {
    const dir = dirOf(v.id),
      original = join(dir, "original");
    try {
      if (!ffmpeg) throw Error("ffmpeg yok");
      await run(
        ffmpeg,
        [
          "-y",
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          original,
          "-map",
          "0:v:0",
          "-map",
          "0:a:0?",
          "-vf",
          "scale='min(1280,iw)':-2",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "26",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-movflags",
          "+faststart",
          "-f",
          "mp4",
          join(dir, "playback.mp4.part"),
        ],
        { timeout: 15 * 60_000 },
      );
      await rename(join(dir, "playback.mp4.part"), join(dir, "playback.mp4"));
      if (!v.hasPoster) {
        await run(
          ffmpeg,
          [
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            String(Math.min(1, v.seconds / 2)),
            "-i",
            original,
            "-frames:v",
            "1",
            "-vf",
            "scale='min(1280,iw)':-2",
            "-q:v",
            "4",
            join(dir, "poster.jpg"),
          ],
          { timeout: 60_000 },
        );
      }
      await db.run("UPDATE videos SET status='ready',hasPlayback=1,hasPoster=1,lastError=NULL,nextAttemptAt=NULL,updatedAt=? WHERE id=?", now(), v.id);
      log("info", "video.ready", { id: v.id, seconds: v.seconds });
    } catch (e) {
      const attempts = v.attempts + 1,
        message = String(e.stderr || e.message || e).slice(0, 200);
      // Without a playback copy an MP4 is still played as uploaded, so the post is never stuck.
      const fallback = attempts >= 3 || !ffmpeg;
      if (fallback) {
        const playable = v.originalMime === "video/mp4";
        await db.run(
          "UPDATE videos SET status=?,attempts=?,lastError=?,nextAttemptAt=NULL,updatedAt=? WHERE id=?",
          playable ? "ready" : "failed",
          attempts,
          message,
          now(),
          v.id,
        );
        if (ffmpeg) await recordError(db.run, "server", "video.process_failed", message, "video");
      } else
        await db.run(
          "UPDATE videos SET attempts=?,lastError=?,nextAttemptAt=?,updatedAt=? WHERE id=?",
          attempts,
          message,
          new Date(Date.now() + 60_000 * 2 ** attempts).toISOString(),
          now(),
          v.id,
        );
      log(fallback ? "warn" : "info", "video.process_retry", { id: v.id, attempts, message });
    }
  }

  async function processDue() {
    if (busy) return;
    busy = true;
    try {
      const due = await db.all(
        "SELECT * FROM videos WHERE status='processing' AND (nextAttemptAt IS NULL OR nextAttemptAt<=?) ORDER BY createdAt LIMIT 3",
        now(),
      );
      for (const v of due) await makePlaybackCopy(v);
      // Unfinished uploads past their expiry, and videos never added to a post or album within a day, are removed with their files.
      for (const s of await db.all("SELECT id FROM upload_sessions WHERE expiresAt<=?", now())) await dropUpload(s.id);
      const dayAgo = new Date(Date.now() - 86400_000).toISOString();
      for (const v of await db.all(`SELECT id FROM videos WHERE createdAt<=? AND ${UNATTACHED}`, dayAgo)) await dropVideo(v.id);
    } finally {
      busy = false;
    }
  }

  return {
    enabled: true,
    ffmpeg: !!ffmpeg,
    limits,
    processDue,
    start(intervalMs = 20_000) {
      timer = setInterval(() => processDue().catch((e) => log("error", "video.jobs_failed", { message: e.message })), intervalMs);
      timer.unref?.();
      return this;
    },
    stop: () => clearInterval(timer),
    /** On account deletion: unfinished uploads and videos not shared anywhere go; videos in family albums stay with them. */
    async forgetUser(userId) {
      for (const s of await db.all("SELECT id FROM upload_sessions WHERE userId=?", userId)) await dropUpload(s.id);
      for (const v of await db.all(`SELECT id FROM videos WHERE createdBy=? AND ${UNATTACHED}`, userId)) await dropVideo(v.id);
    },

    async createUpload(u, b) {
      const size = Math.round(Number(b.size)),
        mime = String(b.mime || "");
      assert(Number.isFinite(size) && size > 0, 400, "Video boyutu okunamadı.");
      assert(size <= limits.bytes, 413, `Video en fazla ${Math.round(limits.bytes / 1048576)} MB olabilir.`);
      assert(/^video\/(mp4|quicktime|webm)$/.test(mime), 400, "Bu video biçimi desteklenmiyor. MP4, MOV ya da WebM seç.");
      const id = crypto.randomUUID();
      await mkdir(tmpDir, { recursive: true });
      await (await open(join(tmpDir, id), "w")).close();
      await db.run("INSERT INTO upload_sessions VALUES(?,?,?,?,?,?,?)", id, u.id, size, 0, mime, now(), new Date(Date.now() + 86400_000).toISOString());
      return { id, chunkSize: CHUNK, received: 0, size };
    },
    async uploadState(u, id) {
      const s = await session(u, id);
      return { id, received: s.received, size: s.size };
    },
    /** Appends one chunk read from `stream`; the offset must match what has already arrived. */
    async writeChunk(u, id, offset, stream, declaredLength) {
      const s = await session(u, id);
      if (offset !== s.received) return { status: 409, body: { error: "Yükleme kaldığı yerden sürmeli.", received: s.received } };
      assert(declaredLength > 0 && declaredLength <= CHUNK && s.received + declaredLength <= s.size, 413, "Parça boyutu geçersiz.");
      const path = join(tmpDir, id);
      let written = 0;
      await new Promise((resolve, reject) => {
        const out = createWriteStream(path, { flags: "r+", start: offset });
        stream.on("data", (c) => {
          written += c.length;
          if (written > declaredLength) stream.destroy(Error("Parça beklenenden büyük."));
        });
        stream.on("error", reject);
        out.on("error", reject);
        out.on("finish", () => resolve(undefined));
        stream.pipe(out);
      });
      assert(written === declaredLength, 400, "Parça eksik geldi; yeniden gönder.");
      await db.run("UPDATE upload_sessions SET received=? WHERE id=?", offset + written, id);
      return { status: 200, body: { received: offset + written, size: s.size } };
    },
    /** Checks the whole file, stores it and queues the playback copy. Returns the video's state. */
    async complete(u, id, b) {
      const s = await session(u, id);
      assert(s.received === s.size, 400, "Video tam yüklenmedi; kalan kısım gönderilmeli.");
      const path = join(tmpDir, id);
      const head = Buffer.alloc(64);
      const fh = await open(path);
      await fh.read(head, 0, 64, 0);
      await fh.close();
      const mime = sniffVideo(head);
      const fail = async (status, message) => {
        await rm(path, { force: true });
        await db.run("DELETE FROM upload_sessions WHERE id=?", id);
        assert(false, status, message);
      };
      if (!mime) await fail(400, "Dosya bir video değil ya da bozuk.");
      if (!ffmpeg && mime !== "video/mp4") await fail(400, "Bu sunucu yalnız MP4 videoyu oynatabilir; videoyu MP4 olarak kaydet.");
      const info = await probeVideo(path, ffmpeg).catch(() => null);
      if (!info || !(info.seconds > 0)) await fail(400, "Videonun süresi okunamadı; dosya bozuk olabilir.");
      if (!info.video) await fail(400, "Dosyada görüntü yok; bir video seç.");
      if (info.seconds > limits.seconds + 0.5) await fail(413, `Video en fazla ${Math.round(limits.seconds / 60)} dakika olabilir.`);
      let poster = null;
      if (b.poster) {
        poster = decodeUpload(b.poster, 2 * 1024 * 1024, "Kapak görseli");
        inspectImage(poster, ["image/jpeg", "image/webp", "image/png"]);
      }
      const videoId = crypto.randomUUID(),
        dir = dirOf(videoId);
      await mkdir(dir, { recursive: true });
      await rename(path, join(dir, "original"));
      if (poster) await writeFile(join(dir, "poster.jpg"), poster);
      await db.run("DELETE FROM upload_sessions WHERE id=?", id);
      await db.run(
        "INSERT INTO videos(id,createdBy,status,originalMime,bytes,seconds,width,height,hasPlayback,hasPoster,attempts,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,0,?,0,?,?)",
        videoId,
        u.id,
        ffmpeg ? "processing" : "ready",
        mime,
        s.size,
        Math.max(1, Math.round(info.seconds)),
        info.width,
        info.height,
        poster ? 1 : 0,
        now(),
        now(),
      );
      if (ffmpeg) setImmediate(() => processDue().catch((e) => log("error", "video.jobs_failed", { message: e.message })));
      return this.info(u, videoId, null);
    },
    /** State for the page; `helpers.visiblePhoto` decides access for non-owners. */
    async info(u, id, helpers) {
      const v = helpers ? await canWatch(u, id, helpers) : await db.one("SELECT * FROM videos WHERE id=? AND createdBy=?", id, u.id);
      assert(v, 404, "Video bulunamadı.");
      return {
        id: v.id,
        status: v.status,
        seconds: v.seconds,
        width: v.width,
        height: v.height,
        play: "/api/experience/videos/" + v.id + "/play",
        poster: v.hasPoster ? "/api/experience/videos/" + v.id + "/poster" : null,
      };
    },
    /** The file to stream for "play" or "poster", after the access check. */
    async file(u, id, kind, helpers) {
      const v = await canWatch(u, id, helpers);
      assert(v, 404, "Video bulunamadı.");
      const dir = dirOf(v.id);
      if (kind === "poster") {
        assert(v.hasPoster, 404, "Kapak görseli yok.");
        return { path: join(dir, "poster.jpg"), mime: "image/jpeg" };
      }
      assert(v.status === "ready", 409, "Video hazırlanıyor.");
      return v.hasPlayback ? { path: join(dir, "playback.mp4"), mime: "video/mp4" } : { path: join(dir, "original"), mime: v.originalMime };
    },
    /** Ties an uploaded, unattached video of this member to a post or photo. */
    async claim(u, id) {
      const v = await db.one("SELECT * FROM videos WHERE id=? AND createdBy=?", id, u.id);
      assert(v, 400, "Video bulunamadı.");
      assert(v.status !== "failed", 400, "Bu video işlenemedi; başka bir dosya dene.");
      assert(!(await db.one("SELECT id FROM photos WHERE videoId=?", id)), 409, "Bu video zaten paylaşıldı.");
      return v;
    },
  };
}

/** Streams a file with HTTP Range support (seeking in the player). */
export async function streamFile(req, res, { path, mime }) {
  const { size } = await stat(path);
  const range = String(req.headers.range || "").match(/^bytes=(\d*)-(\d*)$/);
  const headers = { "Content-Type": mime, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]),
      end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
    if (req.method === "HEAD") return res.end();
    return createReadStream(path, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, "Content-Length": size });
  if (req.method === "HEAD") return res.end();
  createReadStream(path).pipe(res);
}
