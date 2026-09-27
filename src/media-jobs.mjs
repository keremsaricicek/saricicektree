// Node server: makes the smaller photo copies in the background, independent of any open page.
// Each photo's state lives in photo_media (pending → ready, or failed with a retry time), so work
// survives restarts and failed photos are retried with growing delays.
import sharp from "sharp";
import { log } from "./log.mjs";
import { recordError } from "./ops.mjs";
import { MAX_IMAGE_PIXELS, storedBytes } from "./media-check.mjs";
import { expectedWidths, originalSize, refreshStatus, storeVariant } from "./variants.mjs";

const MAX_ATTEMPTS = 6;
const backoffMs = (attempts) => Math.min(6 * 3600_000, 60_000 * 2 ** (attempts - 1));

/** Makes the missing copies for one photo. */
export async function optimisePhoto(ctx, photoId, encode = defaultEncode) {
  const photo = await ctx.one("SELECT id,filename FROM photos WHERE id=? AND deletedAt IS NULL", photoId);
  if (!photo) return "gone";
  const original = await originalSize(ctx, photo);
  const have = new Set((await ctx.all("SELECT width FROM photo_variants WHERE photoId=?", photoId)).map((x) => x.width));
  const todo = expectedWidths(original.width).filter((w) => !have.has(w));
  if (todo.length) {
    const bytes = await storedBytes(await ctx.storage.get(photo.filename));
    if (!bytes) throw Error("original file missing");
    for (const w of todo) await storeVariant(ctx, photo, original, w, await encode(bytes, w));
  }
  const missing = await refreshStatus(ctx, photoId);
  if (missing?.length) throw Error("copies still missing: " + missing.join(","));
  return "ready";
}

async function defaultEncode(bytes, width) {
  return new Uint8Array(await sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS }).rotate().resize({ width }).webp({ quality: 80 }).toBuffer());
}

/** One pass over due photos; returns counts. Photos without a status row are adopted first. */
export async function runMediaJobs(ctx, { now = Date.now(), limit = 10, encode } = {}) {
  const stamp = new Date(now).toISOString();
  await ctx.run(
    "INSERT OR IGNORE INTO photo_media(photoId,updatedAt,status) SELECT id,?,'pending' FROM photos WHERE deletedAt IS NULL AND id NOT IN (SELECT photoId FROM photo_media)",
    stamp,
  );
  const due = await ctx.all(
    `SELECT m.photoId, m.attempts FROM photo_media m JOIN photos p ON p.id=m.photoId AND p.deletedAt IS NULL
     WHERE (m.status='pending' OR (m.status='failed' AND m.attempts<?)) AND (m.nextAttemptAt IS NULL OR m.nextAttemptAt<=?)
     ORDER BY m.attempts, m.updatedAt LIMIT ?`,
    MAX_ATTEMPTS,
    stamp,
    limit,
  );
  const result = { ready: 0, failed: 0 };
  for (const row of due) {
    const started = Date.now();
    try {
      await optimisePhoto(ctx, row.photoId, encode);
      result.ready++;
      log("info", "photo.optimised", { photoId: row.photoId, ms: Date.now() - started });
    } catch (e) {
      const attempts = row.attempts + 1;
      await ctx.run(
        "UPDATE photo_media SET status='failed',attempts=?,nextAttemptAt=?,lastError=?,updatedAt=? WHERE photoId=?",
        attempts,
        new Date(now + backoffMs(attempts)).toISOString(),
        String(e.message || e).slice(0, 200),
        stamp,
        row.photoId,
      );
      result.failed++;
      log(attempts >= MAX_ATTEMPTS ? "error" : "warn", "photo.optimise_failed", { photoId: row.photoId, attempts, error: e });
      if (attempts >= MAX_ATTEMPTS) await recordError(ctx.run, "server", "photo.optimise_failed", String(e.message || e), "Avlu");
    }
  }
  return result;
}

/** Starts the background loop; kick() runs it soon after an upload. */
export function startMediaJobs(ctx, { intervalMs = 30_000 } = {}) {
  let busy = false,
    again = false,
    timer = null;
  const tick = async () => {
    if (busy) return void (again = true);
    busy = true;
    try {
      do {
        again = false;
        const r = await runMediaJobs(ctx);
        if (r.ready + r.failed === 10) again = true; // a full batch: keep going
      } while (again);
    } catch (e) {
      log("error", "photo.jobs_crashed", { error: e });
    } finally {
      busy = false;
    }
  };
  const interval = setInterval(tick, intervalMs);
  interval.unref?.();
  tick();
  return {
    kick() {
      clearTimeout(timer);
      timer = setTimeout(tick, 50);
    },
    stop() {
      clearInterval(interval);
      clearTimeout(timer);
    },
  };
}
