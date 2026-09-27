/* ui/core.js: Shared state, relative time, top bar and small helpers used everywhere.
   Loaded in order after the older scripts; see index.html. */
/* Sarıçiçek Konağı · interface layer.
   Loaded last: it refines the shell, the Hayat feed, the photo viewer and the
   family tree on top of the existing modules without changing their data flow. */
"use strict";

const ui = {
  lastY: 0,
  unread: 0,
  expanded: new Set(), // post ids whose conversation is open inline
  threads: new Map(), // post id -> {items, after, hasMore, reply, loading}
};
const uiPhone = () => matchMedia("(max-width:700px)").matches;
const uiReduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Relative time ---------- */
function uiWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso),
    s = (Date.now() - d.getTime()) / 1000;
  if (!Number.isFinite(s)) return "";
  if (s < 60) return "Az önce";
  if (s < 3600) return Math.floor(s / 60) + " dk";
  if (s < 86400) return Math.floor(s / 3600) + " sa";
  if (s < 7 * 86400) return Math.floor(s / 86400) + " g";
  return d.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
}
const uiFullDate = (iso) => (iso ? new Date(iso).toLocaleString("tr-TR", { dateStyle: "long", timeStyle: "short" }) : "");

/* ---------- Shell ---------- */
function uiGreeting() {
  const h = new Date().getHours();
  return h < 5 ? "İyi geceler" : h < 11 ? "Günaydın" : h < 17 ? "İyi günler" : h < 22 ? "İyi akşamlar" : "İyi geceler";
}

function uiShell() {
  const brand = $(".social-topbar .brand span");
  if (brand) brand.innerHTML = "<strong>Sarıçiçek</strong><em>Konağı</em>";
  const brandLink = $(".social-topbar .brand");
  brandLink?.setAttribute("aria-label", "Sarıçiçek Konağı · Hayat");
  for (const n of $$(".desktop-links .nav")) n.title = n.getAttribute("aria-label") || "";
  const actions = $(".social-topbar .top-actions");
  if (actions) {
    const bell = $("[data-konak=notifications]", actions),
      search = $("[data-action=search]", actions),
      chat = $('[data-page="chat"]', actions);
    if (bell && search && search.nextElementSibling !== bell) search.after(bell);
    if (chat && !$(".ds-badge", chat)) chat.insertAdjacentHTML("beforeend", '<b class="ds-badge ds-chat-badge" hidden></b>');
    $("[data-action=menu]", actions)?.setAttribute("title", "Tüm bölümler");
    search?.setAttribute("title", "Ara");
    bell?.setAttribute("title", "Bildirimler");
    chat?.setAttribute("title", "Mesajlar");
  }
  const mobileChat = $('.mobile-nav [data-page="chat"]');
  if (mobileChat && !$(".ds-badge", mobileChat)) mobileChat.insertAdjacentHTML("beforeend", '<b class="ds-badge ds-chat-badge" hidden></b>');
  uiBadges();
  const strip = $(".demo-strip");
  if (strip) strip.textContent = "Kişiler ve tarihler örnektir; değişiklikler yalnızca bu tarayıcıda kalır.";
  const footer = $(".footer");
  if (footer) footer.innerHTML = "<span>Sarıçiçek Konağı</span>Aynı kökten, geleceğe birlikte.";
}

function uiBadges() {
  for (const b of $$(".ds-chat-badge")) {
    b.hidden = !ui.unread;
    b.textContent = ui.unread > 99 ? "99+" : ui.unread;
  }
}

const uiBaseThreads = dmThreads;
dmThreads = async function () {
  await uiBaseThreads();
  ui.unread = dm.threads.reduce((s, x) => s + (x.kind === "dm" ? x.unread || 0 : 0), 0);
  uiBadges();
};

/* Scroll: hairline under the top bar; on phones the bar tucks away while reading. */
addEventListener(
  "scroll",
  () => {
    const y = scrollY;
    document.body.classList.toggle("ds-scrolled", y > 4);
    if (uiPhone()) {
      const down = y > ui.lastY + 6 && y > 140,
        up = y < ui.lastY - 6;
      if (down) document.body.classList.add("ds-hide-top");
      else if (up || y < 80) document.body.classList.remove("ds-hide-top");
    } else document.body.classList.remove("ds-hide-top");
    ui.lastY = y;
  },
  { passive: true },
);

/* On-screen keyboard: keep the bottom bar out of the way of text fields. */
if (window.visualViewport) {
  // Android (resizes-content) shrinks the whole page with the keyboard and iOS only the
  // visual viewport, so compare with the tallest height seen at this width.
  let full = { w: innerWidth, h: visualViewport.height };
  const check = () => {
    if (innerWidth !== full.w) full = { w: innerWidth, h: visualViewport.height };
    full.h = Math.max(full.h, visualViewport.height, document.activeElement === document.body ? innerHeight : 0);
    const typing = document.activeElement?.matches?.("input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, [contenteditable]");
    document.body.classList.toggle("ds-keyboard", !!typing && visualViewport.height < full.h * 0.78);
  };
  visualViewport.addEventListener("resize", check);
  addEventListener("focusin", () => setTimeout(check, 250));
  addEventListener("focusout", () => setTimeout(check, 250));
}

/* ---------- Hayat: shared helpers ---------- */
const uiAudience = {
  family: ["users-round", "Aileye açık"],
  private: ["lock-keyhole", "Yalnızca sen"],
  selected: ["user-round-check", "Seçili kişiler"],
  group: ["users", "Grup üyeleri"],
};
const uiRatios = new Map();
ui.drafts = new Map();
function uiName(n) {
  const [name, ...rest] = String(n || "").split(" · ");
  return { name, note: rest.join(" · ") };
}
function uiNameHtml(n) {
  const x = uiName(n);
  return `${esc(x.name)}${x.note ? `<span class="ds-name-note">${esc(x.note)}</span>` : ""}`;
}
function uiImages(p) {
  if (p.images?.length) return p.images.map((x) => ({ url: x.url, id: x.id, title: x.title || "", media: x.media || uiPhotoMedia(x.id) }));
  return p.image ? [{ url: p.image, id: p.photoId || null, title: "", media: uiPhotoMedia(p.photoId) }] : [];
}
