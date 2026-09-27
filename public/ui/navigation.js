/* ui/navigation.js: Render hook, back gesture and window history.
   Loaded in order after the older scripts; see index.html. */
"use strict";

/* ---------- Render hook ---------- */
const uiBaseRender = render;
render = function () {
  uiBaseRender();
  if (!state) return;
  document.body.dataset.page = route;
  uiShell();
  uiAfterRender();
};
async function uiPhotoPerfCard() {
  if (demoMode || !isStaff() || !["admin", "settings"].includes(route) || $("#ds-photo-perf")) return;
  const host = route === "settings" ? $(".admin-grid") : $(".footer");
  if (!host) return;
  const card = `<section class="card" id="ds-photo-perf"><h2>Fotoğraf hızı</h2><p class="muted" id="ds-perf-text">Küçük kopyası olmayan fotoğraflar sayılıyor…</p><div class="row" style="margin-top:14px">${'<button type="button" class="btn soft" data-ui="backfill" hidden>Küçük kopyaları hazırla</button><button type="button" class="btn soft" data-ui="copies-retry" hidden>Hatalıları yeniden dene</button>'}</div></section>`;
  if (route === "settings") host.insertAdjacentHTML("beforeend", card);
  else host.insertAdjacentHTML("beforebegin", card);
  try {
    const r = await hmApi("/variants/missing");
    if (!$("#ds-perf-text")) return;
    if (r.optimizer === "server") {
      // The server works through the list on its own; failed photos can be sent back to it.
      $("#ds-perf-text").textContent = !r.total
        ? "Bütün fotoğrafların küçük kopyaları hazır."
        : `${r.total} fotoğrafın küçük kopyaları sunucuda sırada${r.failed ? `; ${r.failed} fotoğrafta hata oluştu` : ""}. Sayfayı açık tutman gerekmez; orijinaller değişmez.`;
      $('[data-ui="copies-retry"]').hidden = !r.failed;
      return;
    }
    $("#ds-perf-text").textContent = r.total
      ? `${r.total} fotoğrafın telefon için küçük kopyası eksik. Hazırlama bu tarayıcıda yapılır; orijinaller değişmez.`
      : "Bütün fotoğrafların küçük kopyaları hazır.";
    $('[data-ui="backfill"]').hidden = !r.total;
  } catch (e) {
    if ($("#ds-perf-text")) $("#ds-perf-text").textContent = e.message;
  }
}
function uiAfterRender() {
  uiPhotoPerfCard();
  if (["home", "profile"].includes(route)) {
    dmStream();
    if (ui.feedCursor == null) uiFeedChanges();
  }
  if (route === "tree") {
    if (uiPhone() && !ui.treeZoomed) {
      ui.treeZoomed = true;
      zoom = 0.64;
      const c = $(".tree-canvas");
      if (c) c.style.transform = `scale(${zoom})`;
      if ($("#zoom-label")) $("#zoom-label").textContent = Math.round(zoom * 100) + "%";
    }
    requestAnimationFrame(() => uiTreeCentre());
    uiTreePinch();
    uiTreeMinimap();
    if (!ui.portraitsRoute) uiTreePortraits();
    ui.portraitsRoute = true;
    if (ui.mePerson === undefined) {
      ui.mePerson = null;
      exApi("/me")
        .then((me) => {
          ui.mePerson = me.personId || null;
          if (ui.mePerson && route === "tree") render();
        })
        .catch(() => {});
    }
  } else {
    ui.treeCentred = false;
    ui.portraitsRoute = false;
  }
}

if (state) render();

/* ---------- Back gesture closes the open window first ----------
   Each window (story, photo, sheet, lightbox) adds one history step, so the phone's back gesture
   (and Android's back button, see mobile/bridge.mjs) closes the top window instead of leaving the
   page. Closing a window with its own button never calls history.back(): that raced with a page
   change made at the same moment. The step is marked spent instead, and a later back gesture that
   lands on a spent step of the same page moves on once more, so no back press is wasted. */
const uiHist = { state: history.state, href: location.href };
const uiRemember = () => Object.assign(uiHist, { state: history.state, href: location.href });
const uiShowModal = HTMLDialogElement.prototype.showModal;
HTMLDialogElement.prototype.showModal = function () {
  uiShowModal.call(this);
  if (this.dataset.histDepth) return;
  const depth = (history.state?.dsOverlay || 0) + 1;
  history.pushState({ ...(history.state || {}), dsOverlay: depth, dsSpent: false }, "");
  uiRemember();
  this.dataset.histDepth = depth;
};
addEventListener("popstate", () => {
  const left = uiHist,
    depth = history.state?.dsOverlay || 0;
  let closed = false;
  for (const d of $$("dialog[open]"))
    if (Number(d.dataset.histDepth) > depth) {
      d.dataset.histClosing = "1";
      d.close();
      closed = true;
    }
  const wasted = !closed && left.state?.dsSpent && left.href === location.href;
  uiRemember();
  if (wasted) history.back(); // the step we left was a window already closed by its button
});
addEventListener("hashchange", uiRemember);
// Closed by its own button while its step is still current: mark that step spent. This runs
// inside dialog.close() itself, because the "close" event arrives later (after a quick back press).
function uiSpendStep(d) {
  if (!d.dataset.histDepth) return;
  const depth = Number(d.dataset.histDepth),
    byBack = d.dataset.histClosing;
  delete d.dataset.histDepth;
  delete d.dataset.histClosing;
  if (!byBack && history.state?.dsOverlay === depth) {
    history.replaceState({ ...history.state, dsOverlay: depth - 1, dsSpent: true }, "");
    uiRemember();
  }
}
const uiDialogClose = HTMLDialogElement.prototype.close;
HTMLDialogElement.prototype.close = function (...args) {
  if (this.open) uiSpendStep(this);
  return uiDialogClose.apply(this, args);
};
// Closes the browser performs itself (Escape) only announce themselves through the event.
document.addEventListener("close", (e) => e.target instanceof HTMLDialogElement && uiSpendStep(e.target), true);
