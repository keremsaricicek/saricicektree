// Smaller copies of archive photos and a user-chosen crop focus.
// Copies are made on the Node server (media-jobs.mjs) or, where no image library is available,
// by the browser. Either way they are served through /media/:id?w=, so they follow exactly the
// original photo's access rules. No paid image service is used.
import { assert } from "./domain.mjs";
import { visiblePhoto } from "./archive.mjs";
import { decodeUpload, inspectImage, storedBytes } from "./media-check.mjs";

export const VARIANT_WIDTHS = [320, 640, 1080, 1600];
const MAX_VARIANT_BYTES = 1.5 * 1024 * 1024;

/** Widths worth making for an original of this width: only ones smaller than the source. */
export const expectedWidths = (originalWidth) => VARIANT_WIDTHS.filter((w) => w < originalWidth);

// Smallest stored copy that is at least `w` wide; null means "use the original".
export async function pickVariant(one, photoId, w) {
  const want = Math.round(Number(w));
  if (!Number.isFinite(want) || want < 1) return null;
  return (
    (await one(
      "SELECT filename,mime FROM photo_variants WHERE photoId=? AND width>=? ORDER BY width LIMIT 1",
      photoId,
      Math.min(want, VARIANT_WIDTHS.at(-1)),
    )) || null
  );
}

// Size, focus, available widths and optimisation state for the client.
export async function mediaInfo(one, all, photoId) {
  const m = await one("SELECT width,height,focusX,focusY,status FROM photo_media WHERE photoId=?", photoId);
  const v = await all("SELECT width FROM photo_variants WHERE photoId=? ORDER BY width", photoId);
  return {
    width: m?.width || null,
    height: m?.height || null,
    focusX: m?.focusX ?? 50,
    focusY: m?.focusY ?? 40,
    variants: v.map((x) => x.width),
    status: m?.status || "pending",
  };
}

/** Real size of the stored original, recorded in photo_media on first use. */
export async function originalSize({ one, run, storage }, photo) {
  const m = await one("SELECT width,height FROM photo_media WHERE photoId=?", photo.id);
  if (m?.width && m?.height) return { width: m.width, height: m.height };
  const bytes = await storedBytes(await storage.get(photo.filename));
  assert(bytes, 404, "Özgün fotoğraf dosyası bulunamadı.");
  const { width, height } = inspectImage(bytes);
  await run(
    "INSERT INTO photo_media(photoId,width,height,updatedAt) VALUES(?,?,?,?) ON CONFLICT(photoId) DO UPDATE SET width=excluded.width,height=excluded.height",
    photo.id,
    width,
    height,
    new Date().toISOString(),
  );
  return { width, height };
}

/** Stores one checked copy and returns its width. */
export async function storeVariant({ run, storage }, photo, original, width, bytes) {
  assert(VARIANT_WIDTHS.includes(width) && width < original.width, 400, "Küçük kopya ölçüsü geçersiz; kaynak büyütülmez.");
  assert(bytes.length <= MAX_VARIANT_BYTES, 413, "Küçük kopya 1,5 MB’ı aşmamalı.");
  const info = inspectImage(bytes, ["image/jpeg", "image/webp"]);
  // The copy must really be the width it claims and keep the original's proportions.
  // A photo with a rotation tag is shown turned, so its copy may have the swapped proportion.
  const heights = [Math.round((original.height * width) / original.width), Math.round((original.width * width) / original.height)];
  assert(Math.abs(info.width - width) <= 1 && heights.some((h) => Math.abs(info.height - h) <= 2), 400, "Küçük kopyanın gerçek ölçüsü beklenenle uyuşmuyor.");
  const filename = "variants/" + photo.id + "/" + width;
  await storage.put(filename, bytes, { httpMetadata: { contentType: info.mime } });
  await run(
    "INSERT INTO photo_variants(photoId,width,height,filename,mime,bytes,createdAt) VALUES(?,?,?,?,?,?,?) ON CONFLICT(photoId,width) DO UPDATE SET height=excluded.height,mime=excluded.mime,bytes=excluded.bytes,createdAt=excluded.createdAt",
    photo.id,
    width,
    info.height,
    filename,
    info.mime,
    bytes.length,
    new Date().toISOString(),
  );
  return width;
}

/** Marks the photo ready when every expected copy exists; returns the widths still missing. */
export async function refreshStatus({ one, all, run }, photoId) {
  const m = await one("SELECT width FROM photo_media WHERE photoId=?", photoId);
  if (!m?.width) return null;
  const have = new Set((await all("SELECT width FROM photo_variants WHERE photoId=?", photoId)).map((x) => x.width));
  const missing = expectedWidths(m.width).filter((w) => !have.has(w));
  if (!missing.length)
    await run("UPDATE photo_media SET status='ready',lastError=NULL,nextAttemptAt=NULL,updatedAt=? WHERE photoId=?", new Date().toISOString(), photoId);
  return missing;
}

/** Photos whose copies are incomplete, including partly processed ones. */
export async function incompletePhotos({ all }) {
  const rows = await all(
    `SELECT p.id, m.width, m.status, m.attempts, m.lastError, (SELECT group_concat(width) FROM photo_variants v WHERE v.photoId=p.id) have
     FROM photos p LEFT JOIN photo_media m ON m.photoId=p.id
     WHERE p.deletedAt IS NULL AND (m.photoId IS NULL OR m.status!='ready') ORDER BY p.createdAt DESC`,
  );
  return rows
    .map((r) => {
      const have = new Set(
        String(r.have || "")
          .split(",")
          .filter(Boolean)
          .map(Number),
      );
      const missing = r.width ? expectedWidths(r.width).filter((w) => !have.has(w)) : null;
      return { id: r.id, status: r.status || "pending", attempts: r.attempts || 0, lastError: r.lastError || null, missing };
    })
    .filter((r) => r.missing === null || r.missing.length || r.status === "failed");
}

export async function variantRoutes(ctx) {
  const { path, method, u, read, one, run } = ctx;
  const reply = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (path === "/api/experience/memories/variants/missing" && method === "GET") {
    assert(u.role !== "member", 403, "Bu işlem yöneticiye açık.");
    const rows = await incompletePhotos(ctx);
    const items = [];
    for (const r of rows.slice(0, 60)) if (await visiblePhoto(one, u, r.id)) items.push({ ...r, url: "/media/" + r.id });
    const failed = rows.filter((r) => r.status === "failed").length;
    return reply({ items, total: rows.length, failed, optimizer: ctx.mediaJobs ? "server" : "client" });
  }
  if (path === "/api/experience/memories/variants/retry" && method === "POST") {
    assert(u.role !== "member", 403, "Bu işlem yöneticiye açık.");
    const r = await run("UPDATE photo_media SET status='pending',attempts=0,nextAttemptAt=NULL WHERE status='failed'");
    ctx.mediaJobs?.kick();
    return reply({ ok: true, retried: r?.changes ?? r?.meta?.changes ?? 0 });
  }
  const m = path.match(/^\/api\/experience\/memories\/([\w-]+)\/(variants|focus)$/);
  if (!m) return null;
  const p = await visiblePhoto(one, u, m[1]);
  assert(p, 404, "Fotoğraf bulunamadı.");
  assert(p.createdBy === u.id || u.role !== "member", 403, "Bu fotoğrafı düzenleme yetkin yok.");
  if (m[2] === "focus" && method === "PATCH") {
    const b = await read(1000),
      x = Math.round(Number(b.x)),
      y = Math.round(Number(b.y));
    assert(x >= 0 && x <= 100 && y >= 0 && y <= 100, 400, "Odak noktası geçersiz.");
    await run(
      "INSERT INTO photo_media(photoId,focusX,focusY,updatedAt) VALUES(?,?,?,?) ON CONFLICT(photoId) DO UPDATE SET focusX=excluded.focusX,focusY=excluded.focusY,updatedAt=excluded.updatedAt",
      p.id,
      x,
      y,
      new Date().toISOString(),
    );
    return reply({ ok: true, focusX: x, focusY: y });
  }
  if (m[2] === "variants" && method === "PUT") {
    // Browser-made copies (Cloudflare runtime). The original's size comes from the stored file,
    // never from the request.
    const b = await read(8 * 1024 * 1024),
      original = await originalSize(ctx, p),
      stored = [];
    for (const v of (Array.isArray(b.variants) ? b.variants : []).slice(0, VARIANT_WIDTHS.length))
      stored.push(await storeVariant(ctx, p, original, Math.round(Number(v.width)), decodeUpload(v.data, MAX_VARIANT_BYTES, "Küçük kopya")));
    const missing = await refreshStatus(ctx, p.id);
    return reply({ ok: true, variants: stored, missing });
  }
  assert(false, 405, "İşlem desteklenmiyor.");
}
