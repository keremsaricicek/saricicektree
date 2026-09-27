/* ui/photos.js: Responsive photos: srcset, smaller copies made in the browser, error reporting.
   Loaded in order after the older scripts; see index.html. */
"use strict";

/* ---------- Responsive photos ----------
   The server keeps the original and up to four smaller copies (320–1600 px) made in the
   browser. srcset lets the phone pick the smallest copy that is sharp enough; width/height
   reserve the space before the image arrives; focus keeps faces in cropped tiles. */
const UI_VARIANT_WIDTHS = [320, 640, 1080, 1600];
function uiPhotoMedia(id) {
  return (id && state.photos.find((x) => x.id === id)?.media) || null;
}
function uiPic(url, media, { sizes = "100vw", fallback = 640, fixed } = {}) {
  const v = media?.variants || [],
    dims = media?.width ? ` width="${media.width}" height="${media.height}"` : "";
  if (!url || !v.length || /^(data|blob):/.test(url)) return `src="${esc(url)}"${dims}`;
  if (fixed) return `src="${esc(url)}?w=${v.find((w) => w >= fixed) || v.at(-1)}"${dims}`;
  const set = v.map((w) => `${url}?w=${w} ${w}w`);
  if (media.width) set.push(`${url} ${media.width}w`);
  return `src="${esc(url)}?w=${v.find((w) => w >= fallback) || v.at(-1)}" srcset="${esc(set.join(", "))}" sizes="${sizes}"${dims}`;
}
const uiFocus = (media) => (media ? `object-position:${media.focusX ?? 50}% ${media.focusY ?? 40}%` : "");
const uiMediaRatio = (media) => (media?.width && media?.height ? media.width / media.height : null);
const uiBigUrl = (url, media) => (media?.variants?.includes(1600) && !(media.width && media.width < 1800) ? url + "?w=1600" : url);

function uiLoadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(Error("Fotoğraf açılamadı."));
    im.src = src;
  });
}
/* Downscale in halving steps so small copies stay crisp; never enlarge. */
async function uiMakeVariants(src) {
  const im = await uiLoadImage(src),
    W = im.naturalWidth,
    H = im.naturalHeight,
    out = [];
  for (const w of UI_VARIANT_WIDTHS) {
    if (w >= W) continue;
    let cur = im,
      cw = W,
      ch = H;
    while (cw / 2 >= w) {
      const c = document.createElement("canvas");
      c.width = Math.round(cw / 2);
      c.height = Math.round(ch / 2);
      c.getContext("2d").drawImage(cur, 0, 0, c.width, c.height);
      cur = c;
      cw = c.width;
      ch = c.height;
    }
    const c = document.createElement("canvas");
    c.width = w;
    c.height = Math.round((H * w) / W);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cur, 0, 0, c.width, c.height);
    let data = c.toDataURL("image/webp", 0.8);
    if (!data.startsWith("data:image/webp")) data = c.toDataURL("image/jpeg", 0.82);
    out.push({ width: w, data });
  }
  return { width: W, height: H, variants: out };
}
async function uiStoreVariants(id, src) {
  if (demoMode || !id) return null;
  const v = await uiMakeVariants(src),
    r = await hmApi("/" + id + "/variants", "PUT", v),
    media = { ...(uiPhotoMedia(id) || { focusX: 50, focusY: 40 }), width: v.width, height: v.height, variants: r.variants || [] };
  const ph = state.photos.find((x) => x.id === id);
  if (ph) ph.media = media;
  return media;
}
async function uiBackfillVariants(report) {
  let done = 0,
    failed = 0;
  const seen = new Set();
  for (;;) {
    const r = await hmApi("/variants/missing");
    const batch = r.items.filter((x) => !seen.has(x.id));
    if (!batch.length) break;
    for (const x of batch) {
      seen.add(x.id);
      report(`${done + failed + 1}. fotoğraf hazırlanıyor… (${r.total} eksik)`);
      try {
        const blob = await (
            await fetch(x.url, { credentials: "same-origin", headers: { "X-Family-Factor": sessionStorage.getItem("sf-factor") || "" } })
          ).blob(),
          url = URL.createObjectURL(blob);
        try {
          await uiStoreVariants(x.id, url);
          done++;
        } finally {
          URL.revokeObjectURL(url);
        }
      } catch (e) {
        failed++;
        uiReportError("photo.variants_failed", e);
      }
    }
  }
  return { done, failed };
}
/* Reports a failure the person may not see to the admin panel. Sends only an event name, a short
   message and the page area; never message text, names or file contents. Never throws. */
function uiReportError(event, err) {
  try {
    if (demoMode || !state?.user) return;
    const message = String(err?.message || err || "").slice(0, 200);
    fetch("/api/experience/ops/client-error", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf || "" },
      body: JSON.stringify({ event, message, area: route }),
    }).catch(() => {}); // reporting must never add a second failure
  } catch {
    /* the reporter itself failed; nothing more to do */
  }
}
window.uiReportError = uiReportError;
// Unexpected script errors are reported too (at most five per page load, no stack or content).
let uiUncaught = 0;
const uiOnUncaught = (err) => uiUncaught++ < 5 && uiReportError("script.error", err);
addEventListener("error", (e) => e.error && uiOnUncaught(e.error));
addEventListener("unhandledrejection", (e) => uiOnUncaught(e.reason));
const uiServerCopies = () => window.sfConfig?.mediaOptimizer === "server";
const uiPerson = (id) => state.people.find((x) => x.id === id);
const uiIcon = (name, cls = "") => icon(name).replace("<i ", `<i class="${cls}" `);

/* Images report their real proportions so a single photo is never cropped. */
document.addEventListener(
  "load",
  (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.ar) return;
    const r = img.naturalWidth / img.naturalHeight;
    if (!r) return;
    uiRatios.set(img.dataset.ar, r);
    const box = img.closest(".ds-media-1");
    if (box) box.style.setProperty("--ar", Math.min(1.91, Math.max(0.8, r)).toFixed(4));
    img.closest(".ds-loading")?.classList.remove("ds-loading");
  },
  true,
);

/* A portrait that cannot be loaded falls back to the person's initials. */
document.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.initials) return;
    const box = img.parentElement;
    box.classList.remove("ds-node-photo");
    box.textContent = img.dataset.initials;
  },
  true,
);
