/* ui/avlu.js: Avlu gallery, photo story viewer, upload progress and copies.
   Loaded in order after the older scripts; see index.html. */
"use strict";

/* ---------- Avlu ---------- */
const uiTileRatio = (url) => Math.min(2.2, Math.max(0.62, uiRatios.get(url) || 1.3333));
function hmTile(p) {
  const known = uiMediaRatio(p.media),
    r = known ? Math.min(2.2, Math.max(0.62, known)) : uiTileRatio(p.url);
  return `<button class="photo-card hm-tile ds-ptile" data-hm="open" data-id="${esc(p.id)}" style="--r:${r.toFixed(4)}"><span class="ds-ptile-img"><img ${uiPic(p.url, p.media, { sizes: "(max-width: 700px) 50vw, 360px", fallback: 320 })} alt="${esc(p.title || "Aile fotoğrafı")}" loading="lazy" decoding="async" data-ar="${esc(p.url)}" style="${uiFocus(p.media)}"></span>${p.status === "pending" ? '<span class="ds-badge-soft is-pending">Onay bekliyor</span>' : ""}${p.albumId ? `<span class="ds-ptile-album" title="Albüm">${icon("layers")}</span>` : ""}<span class="ds-ptile-meta"><strong>${esc(p.title || "Adsız hatıra")}</strong><small>${esc(hmDate(p))}${p.place ? " · " + esc(p.place) : ""}</small>${p.description ? `<span class="ds-ptile-desc">${esc(p.description.slice(0, 180))}${p.description.length > 180 ? "…" : ""}</span>` : ""}</span></button>`;
}
function hmGalleryMarkup() {
  const q = query.toLocaleLowerCase("tr"),
    list = hm.items.filter((p) =>
      `${p.title} ${p.place} ${p.description} ${(p.peopleIds || []).map((id) => uiPerson(id)?.name).join(" ")}`.toLocaleLowerCase("tr").includes(q),
    ),
    years = [...new Set(list.map((p) => p.date?.slice(0, 4) || "Tarihsiz"))];
  if (!list.length)
    return q
      ? `<div class="ff-empty">${icon("search-x")}<h3>Eşleşen hatıra yok.</h3><p>Bir isim, yer ya da yıl dene.</p></div>`
      : `<div class="ff-empty">${icon("images")}<h3>Bu avluyu birlikte dolduracağız.</h3><p>Bir fotoğraf ve onun hikâyesiyle başlayabilirsin.</p>${knButton(icon("image-plus") + " Fotoğraf ekle", "photo", "", "btn primary")}</div>`;
  return years
    .map((y) => {
      const items = list.filter((p) => (p.date?.slice(0, 4) || "Tarihsiz") === y);
      return `<section class="hm-year-section ds-year"><header class="ds-year-head"><h2>${esc(y)}</h2><span>${items.length} fotoğraf</span></header><div class="gallery-grid ds-justified">${items.map(hmTile).join("")}</div></section>`;
    })
    .join("");
}
function gallery() {
  const count = hm.items.length;
  return `<section class="page-head ds-avlu-head"><div><span class="eyebrow">Ailemizin hafızası</span><h1>Avlu</h1><p>${hm.loaded ? `${count} fotoğraf · ` : ""}Bir fotoğraf, bir tarih, bir yer ve içindeki insanlar.</p></div><div class="row">${hmButton(icon("circle-help"), "guide", 'aria-label="Avlu kullanım kılavuzu" title="Nasıl kullanılır?"', "icon-btn")}${button("Fotoğraf ekle", "upload", "image-plus", "primary")}</div></section><div class="ds-avlu-tools"><label class="search">${icon("search")}<input id="hm-search" placeholder="İsim, yer veya hatıra ara" aria-label="Avlu içinde ara" value="${esc(query)}"></label><div class="kn-view-switch" role="group" aria-label="Avlu görünümü">${knButton(icon("layout-grid") + "<span>Mozaik</span>", "gallery-view", 'data-view="mosaic" aria-pressed="' + (kn.view === "mosaic") + '"', "btn")}${knButton(icon("rows-3") + "<span>Zaman çizelgesi</span>", "gallery-view", 'data-view="timeline" aria-pressed="' + (kn.view === "timeline") + '"', "btn")}</div></div>${hm.years.length ? `<nav class="hm-years ds-years" aria-label="Fotoğraf yılı">${hmButton("Tüm yıllar", "year", 'data-year=""', !hm.year ? "active" : "")}${hm.years.map((y) => hmButton(y, "year", `data-year="${y}"`, hm.year === y ? "active" : "")).join("")}</nav>` : ""}<div id="hm-gallery" class="kn-gallery-${kn.view}">${hm.loaded ? hmGalleryMarkup() : `<div class="ds-justified">${Array.from({ length: 6 }, (_, i) => `<span class="skeleton ds-ptile-skeleton" style="--r:${[1.5, 0.8, 1.33, 1, 1.6, 0.75][i]}"></span>`).join("")}</div>`}</div><div id="hm-gallery-more">${hm.more ? hmButton("Daha eski fotoğraflar", "gallery-more") : ""}</div>`;
}
document.addEventListener(
  "load",
  (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.ar) return;
    const tile = img.closest(".ds-ptile");
    if (tile && img.naturalWidth) tile.style.setProperty("--r", uiTileRatio(img.dataset.ar).toFixed(4));
  },
  true,
);

/* Photo story: the image opens full screen; the album strip becomes the gallery. */
const uiBasePhotoDetail = photoDetail;
photoDetail = async function (id) {
  await uiBasePhotoDetail(id);
  const photo = $(".hm-view-photo .hm-marker-image > img", dialog);
  if (photo && !photo.dataset.zoom) {
    photo.dataset.zoom = "1";
    photo.setAttribute("title", "Tam ekran aç");
  }
  $(".hm-view-photo", dialog)?.classList.add("ds-stage");
  const cur = hm.current;
  if (!cur || cur.id !== id) return;
  const media = cur.media || uiPhotoMedia(id);
  if (photo && media?.variants?.length) {
    const tmp = document.createElement("div");
    tmp.innerHTML = `<img ${uiPic(cur.url, media, { sizes: "(max-width: 900px) 100vw, 62vw", fallback: 1080 })}>`;
    for (const a of ["srcset", "sizes", "width", "height"]) if (tmp.firstChild.hasAttribute(a)) photo.setAttribute(a, tmp.firstChild.getAttribute(a));
    photo.src = tmp.firstChild.getAttribute("src");
  }
  for (const b of $$("#hm-album-strip button[data-id]", dialog)) {
    const m = uiPhotoMedia(b.dataset.id),
      img = $("img", b);
    if (img && m?.variants?.length) img.src = img.src.split("?")[0] + "?w=" + m.variants[0];
  }
  if (cur.canEdit && !$('[data-ui="focus"]', dialog))
    $(".hm-view-actions", dialog)?.insertAdjacentHTML(
      "beforeend",
      `<button type="button" class="btn" data-ui="focus" data-id="${esc(id)}">${icon("scan-face")} Kırpma odağı</button>`,
    );
  if (cur.canEdit && !demoMode && !uiServerCopies() && media?.status !== "ready" && !ui.variantBusy?.has(id)) {
    (ui.variantBusy ||= new Set()).add(id);
    uiStoreVariants(id, cur.url)
      .then((m) => m && (cur.media = m))
      .catch((e) => uiReportError("photo.variants_failed", e)) // the photo still shows; copies stay listed
      .finally(() => ui.variantBusy.delete(id));
  }
  hydrate();
};
/* Crop focus: tap the part of the photo that must stay visible in tiles and covers. */
async function uiChooseFocus(id) {
  const stage = $(".hm-view-photo .hm-marker-image", dialog),
    img = $("img", stage);
  if (!img) return;
  stage.classList.add("ds-focus-mode");
  stage.insertAdjacentHTML("beforeend", `<span class="ds-focus-hint" role="status">Kırpılan görünümlerde kalması gereken yere (ör. yüzlere) dokun.</span>`);
  const pick = await new Promise((resolve) => {
    const h = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r = img.getBoundingClientRect();
      resolve({ x: Math.round((100 * (e.clientX - r.left)) / r.width), y: Math.round((100 * (e.clientY - r.top)) / r.height) });
    };
    img.addEventListener("click", h, { once: true, capture: true });
  });
  stage.classList.remove("ds-focus-mode");
  $(".ds-focus-hint", stage)?.remove();
  const x = Math.max(0, Math.min(100, pick.x)),
    y = Math.max(0, Math.min(100, pick.y));
  if (demoMode) {
    hmDemo[id] = { ...(hmDemo[id] || state.photos.find((p) => p.id === id)), media: { ...(uiPhotoMedia(id) || {}), focusX: x, focusY: y } };
    hmRemember();
  } else await hmApi("/" + id + "/focus", "PATCH", { x, y });
  for (const arr of [state.photos, hm.items]) {
    const ph = arr.find((p) => p.id === id);
    if (ph) ph.media = { ...(ph.media || {}), focusX: x, focusY: y };
  }
  if (hm.current?.id === id) hm.current.media = { ...(hm.current.media || {}), focusX: x, focusY: y };
  toast("Kırpma odağı kaydedildi.");
}
document.addEventListener("click", (e) => {
  const img = e.target.closest?.(".hm-view-photo .hm-marker-image > img");
  if (!img) return;
  const strip = $$("#hm-album-strip img", dialog),
    big = (x, id) => uiBigUrl(x.getAttribute("src").split("?")[0], uiPhotoMedia(id)),
    items = strip.length
      ? strip.map((x) => ({ url: big(x, x.closest("button")?.dataset.id), alt: x.alt }))
      : [{ url: uiBigUrl(img.getAttribute("src").split("?")[0], hm.current?.media), alt: img.alt }],
    start = Math.max(
      0,
      strip.findIndex((x) => x.closest("button")?.classList.contains("active")),
    );
  uiViewer(items, strip.length ? start : 0);
});

/* ---------- Upload: real progress, then server, then small copies ---------- */
function uiUploadStatus(stage, value, text) {
  const form = $("#hm-upload-form");
  if (!form) return;
  let box = $("#ds-upload-progress", form);
  if (!box) {
    form
      .querySelector(".kn-upload-footer, .form-actions")
      ?.insertAdjacentHTML(
        "beforebegin",
        `<div id="ds-upload-progress" class="ds-progress" role="status" aria-live="polite"><div class="ds-progress-track"><i></i></div><span></span></div>`,
      );
    box = $("#ds-upload-progress", form);
  }
  if (!box) return;
  box.hidden = stage === "idle";
  box.dataset.stage = stage;
  const bar = $("i", box);
  bar.style.width = value == null ? "" : Math.round(value * 100) + "%";
  box.classList.toggle("is-indeterminate", value == null);
  box.classList.toggle("is-warning", stage === "warning");
  $("span", box).textContent = text;
}
const uiMB = (n) => (n / 1048576).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + " MB";
function uiUploadWithProgress(path, body) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest(),
      payload = JSON.stringify(body);
    x.open("POST", path);
    x.withCredentials = true;
    x.setRequestHeader("Content-Type", "application/json");
    if (csrf) x.setRequestHeader("X-CSRF-Token", csrf);
    const factor = sessionStorage.getItem("sf-factor");
    if (factor) x.setRequestHeader("X-Family-Factor", factor);
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) uiUploadStatus("upload", e.loaded / e.total, `Yükleniyor · ${uiMB(e.loaded)} / ${uiMB(e.total)}`);
    };
    x.upload.onload = () => uiUploadStatus("server", null, "Yüklendi · sunucuda kaydediliyor…");
    x.onerror = () => reject(Error("Bağlantı kesildi. Girdiğin bilgiler korunuyor; bağlantı gelince yeniden dene."));
    x.ontimeout = x.onerror;
    x.onload = async () => {
      let r = {};
      try {
        r = JSON.parse(x.responseText || "{}");
      } catch {
        /* not JSON (e.g. a proxy error page): the status code below decides */
      }
      if (x.status === 428) {
        try {
          await archiveFactorPrompt();
          resolve(await uiUploadWithProgress(path, body));
        } catch (e) {
          reject(e);
        }
        return;
      }
      if (x.status < 200 || x.status >= 300) return reject(Error((r.error || "Yükleme tamamlanamadı.") + " Bilgilerin korunuyor; yeniden deneyebilirsin."));
      resolve(r);
    };
    uiUploadStatus("upload", 0, `Yükleniyor · 0 / ${uiMB(payload.length)}`);
    x.send(payload);
  });
}
const uiBaseHmApi = hmApi;
hmApi = async function (suffix = "", method = "GET", b) {
  const upload = suffix === "" && method === "POST" && Array.isArray(b?.photos);
  if (!upload) return uiBaseHmApi(suffix, method, b);
  let r;
  try {
    r = demoMode || window.FamilyNative?.available ? await uiBaseHmApi(suffix, method, b) : await uiUploadWithProgress("/api/experience/memories", b);
  } catch (e) {
    // The form shows the full reason; the bar only marks where the upload stopped.
    uiUploadStatus("error", null, "Yükleme durdu.");
    const retry = $("#kn-upload-submit");
    if (retry) retry.textContent = "Yeniden dene";
    throw e;
  }
  const ids = r.ids || (r.id ? [r.id] : []);
  if (demoMode || r.optimization === "server" || uiServerCopies()) {
    // The server makes the smaller copies in the background; the page can be closed.
    uiUploadStatus("done", 1, demoMode ? "Kaydedildi." : "Kaydedildi. Telefonlar için küçük kopyalar sunucuda hazırlanıyor.");
    return r;
  }
  let failed = 0;
  if (ids.length === b.photos.length)
    for (let i = 0; i < ids.length; i++) {
      uiUploadStatus("variants", i / ids.length, `Telefonlar için küçük kopyalar hazırlanıyor · ${i + 1} / ${ids.length}`);
      try {
        await uiStoreVariants(ids[i], b.photos[i].data);
      } catch (e) {
        failed++;
        uiReportError("photo.variants_failed", e);
      }
    }
  if (failed) {
    // The photo itself is saved; the copies are listed for completion in the admin panel.
    const note = "Fotoğraf kaydedildi; küçük kopyalar daha sonra tamamlanacak.";
    uiUploadStatus("warning", 1, note);
    r.copiesNote = note; // the caller's success message carries this note, so it is not lost
    toast(note);
  } else uiUploadStatus("done", 1, "Kaydedildi.");
  return r;
};
