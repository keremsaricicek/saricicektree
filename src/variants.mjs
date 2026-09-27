// Smaller copies of archive photos and a user-chosen crop focus.
// Copies are produced by the browser (no paid image service) and served through the
// same /media/:id route, so they inherit exactly the original photo's access rules.
import { assert } from "./domain.mjs";
import { visiblePhoto } from "./archive.mjs";

export const VARIANT_WIDTHS = [320, 640, 1080, 1600];
const MAX_VARIANT_BYTES = 1.5 * 1024 * 1024;

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

// Size, focus and available widths for the client (srcset, aspect ratio, object-position).
export async function mediaInfo(one, all, photoId) {
  const m = await one("SELECT width,height,focusX,focusY FROM photo_media WHERE photoId=?", photoId);
  const v = await all("SELECT width FROM photo_variants WHERE photoId=? ORDER BY width", photoId);
  return { width: m?.width || null, height: m?.height || null, focusX: m?.focusX ?? 50, focusY: m?.focusY ?? 40, variants: v.map((x) => x.width) };
}

function decodeImage(data) {
  let bytes;
  try {
    bytes = Uint8Array.from(atob(String(data).split(",").pop()), (c) => c.charCodeAt(0));
  } catch {
    assert(false, 400, "Görsel okunamadı.");
  }
  const h = new TextDecoder().decode(bytes.slice(0, 12));
  const mime = bytes[0] === 255 && bytes[1] === 216 ? "image/jpeg" : h.startsWith("RIFF") && h.slice(8, 12) === "WEBP" ? "image/webp" : null;
  assert(mime && bytes.length > 12 && bytes.length <= MAX_VARIANT_BYTES, 400, "Küçük kopya JPEG veya WebP olmalı ve 1,5 MB’ı aşmamalı.");
  return { bytes, mime };
}

export async function variantRoutes({ path, method, u, read, one, all, run, storage }) {
  const reply = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  const now = new Date().toISOString();
  if (path === "/api/experience/memories/variants/missing" && method === "GET") {
    assert(u.role !== "member", 403, "Bu işlem yöneticiye açık.");
    const rows = await all(
      "SELECT p.id FROM photos p WHERE p.deletedAt IS NULL AND NOT EXISTS(SELECT 1 FROM photo_variants v WHERE v.photoId=p.id) ORDER BY p.createdAt DESC LIMIT 60",
    );
    const items = [];
    for (const r of rows) if (await visiblePhoto(one, u, r.id)) items.push({ id: r.id, url: "/media/" + r.id });
    const total = (await one("SELECT COUNT(*) n FROM photos p WHERE p.deletedAt IS NULL AND NOT EXISTS(SELECT 1 FROM photo_variants v WHERE v.photoId=p.id)"))
      .n;
    return reply({ items, total });
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
      now,
    );
    return reply({ ok: true, focusX: x, focusY: y });
  }
  if (m[2] === "variants" && method === "PUT") {
    const b = await read(8 * 1024 * 1024),
      width = Math.round(Number(b.width)),
      height = Math.round(Number(b.height));
    assert(width > 0 && height > 0 && width <= 12000 && height <= 12000, 400, "Fotoğraf ölçüsü geçersiz.");
    const list = Array.isArray(b.variants) ? b.variants.slice(0, VARIANT_WIDTHS.length) : [];
    const stored = [];
    for (const v of list) {
      const w = Math.round(Number(v.width));
      assert(VARIANT_WIDTHS.includes(w) && w < width, 400, "Küçük kopya ölçüsü geçersiz; kaynak büyütülmez.");
      const { bytes, mime } = decodeImage(v.data),
        filename = "variants/" + p.id + "/" + w,
        h = Math.round((height * w) / width);
      await storage.put(filename, bytes, { httpMetadata: { contentType: mime } });
      await run(
        "INSERT INTO photo_variants(photoId,width,height,filename,mime,bytes,createdAt) VALUES(?,?,?,?,?,?,?) ON CONFLICT(photoId,width) DO UPDATE SET height=excluded.height,mime=excluded.mime,bytes=excluded.bytes,createdAt=excluded.createdAt",
        p.id,
        w,
        h,
        filename,
        mime,
        bytes.length,
        now,
      );
      stored.push(w);
    }
    await run(
      "INSERT INTO photo_media(photoId,width,height,updatedAt) VALUES(?,?,?,?) ON CONFLICT(photoId) DO UPDATE SET width=excluded.width,height=excluded.height,updatedAt=excluded.updatedAt",
      p.id,
      width,
      height,
      now,
    );
    return reply({ ok: true, variants: stored });
  }
  assert(false, 405, "İşlem desteklenmiyor.");
}
