/* ui/dialogs.js: Dialog variants, menu, account sheet and appearance choice.
   Loaded in order after the older scripts; see index.html. */
"use strict";

/* ---------- Dialog variants ---------- */
const uiBaseModal = modal;
modal = function (title, content, wide = false) {
  uiBaseModal(title, content, wide);
  const t = String(title);
  dialog.classList.remove("is-post", "is-search", "is-viewer", "is-menu");
  if (/\bara$|Ara$/.test(t) || $(".kn-search-field, #server-search, #search-input", dialog)) dialog.classList.add("is-search");
  if ($(".hm-viewer", dialog)) {
    dialog.classList.add("is-viewer");
    uiGrowOpen();
  }
};

/* Card → viewer: the tapped tile's image grows into the viewer photo.
   Start and end are measured rectangles; without animation support or with reduced
   motion the viewer simply opens. */
const uiReduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
document.addEventListener(
  "click",
  (e) => {
    const tile = e.target.closest?.('[data-hm="open"][data-id]'),
      img = tile && $("img", tile);
    ui.growFrom =
      img && img.complete && img.naturalWidth
        ? { id: tile.dataset.id, src: img.currentSrc || img.src, rect: img.getBoundingClientRect(), at: Date.now(), fit: getComputedStyle(img).objectPosition }
        : null;
  },
  true,
);
function uiGrowOpen() {
  const from = ui.growFrom;
  ui.growFrom = null;
  const photo = $(".hm-view-photo .hm-marker-image > img", dialog);
  if (!from || !photo || Date.now() - from.at > 4000 || from.id !== hm.current?.id || uiReduceMotion()) return;
  const media = hm.current?.media || uiPhotoMedia(from.id);
  if (media?.width) {
    photo.setAttribute("width", media.width);
    photo.setAttribute("height", media.height);
  }
  dialog.classList.add("ds-grow");
  const run = () => {
    const to = photo.getBoundingClientRect();
    if (!to.width || !to.height || !dialog.open) return dialog.classList.remove("ds-grow");
    const ghost = document.createElement("img");
    ghost.src = from.src;
    ghost.alt = "";
    ghost.className = "ds-grow-ghost";
    ghost.style.cssText = `object-position:${from.fit};left:${from.rect.left}px;top:${from.rect.top}px;width:${from.rect.width}px;height:${from.rect.height}px;border-radius:14px`;
    dialog.append(ghost);
    // The viewer can still settle while its story loads, so each frame aims at the photo's current box.
    const start = performance.now(),
      ease = (t) => 1 - Math.pow(1 - t, 3),
      lerp = (a, b, t) => a + (b - a) * t;
    const step = (now) => {
      if (!dialog.open || !ghost.isConnected || !photo.isConnected) return done();
      const t = Math.min(1, (now - start) / 320),
        k = ease(t),
        to = photo.getBoundingClientRect();
      Object.assign(ghost.style, {
        left: lerp(from.rect.left, to.left, k) + "px",
        top: lerp(from.rect.top, to.top, k) + "px",
        width: lerp(from.rect.width, to.width, k) + "px",
        height: lerp(from.rect.height, to.height, k) + "px",
        borderRadius: lerp(14, 0, k) + "px",
      });
      if (t < 1) requestAnimationFrame(step);
      else done();
    };
    const done = () => {
      dialog.classList.remove("ds-grow");
      ghost.remove();
    };
    requestAnimationFrame(step);
  };
  // The size must be known before measuring: from stored dimensions or the loaded image.
  if (photo.complete && photo.naturalWidth) requestAnimationFrame(run);
  else if (media?.width) requestAnimationFrame(run);
  else {
    const t = setTimeout(() => dialog.classList.remove("ds-grow"), 700);
    photo.addEventListener("load", () => (clearTimeout(t), dialog.classList.contains("ds-grow") && requestAnimationFrame(run)), { once: true });
  }
}

/* Notifications: upcoming days read like the side column. */
knNoticeLabels.memories = "Bugün geçmişte";
const uiBaseNotifications = knNotifications;
knNotifications = async function () {
  await uiBaseNotifications();
  // "Bugün geçmişte" group, only when the person keeps it switched on.
  const prefs = await Promise.resolve(knPrefs()).catch(() => ({}));
  const body = $(".dialog-body", dialog);
  if (body && $("#dialog-title")?.textContent === "Bildirimler" && prefs.notifications?.memories !== false && !$(".ds-notice-memories", body)) {
    const items = uiOnThisDay();
    const years = (d) => Number(exDate().slice(0, 4)) - Number(d.slice(0, 4));
    const group = `<section class="kn-notice-group ds-notice-memories"><h3>${icon("history")} Bugün geçmişte</h3>${
      items
        .map((x) =>
          button(
            `${uiDayTile(x.date)}<span><strong>${esc(x.title)}</strong><small>${years(x.date)} yıl önce bugün · ${esc(x.date.slice(0, 4))}</small></span>`,
            x.action,
            null,
            "search-result ds-memory-row",
            `data-id="${esc(x.id)}"`,
          ),
        )
        .join("") || "<p>Bugüne denk gelen, günü kesin bilinen bir hatıra yok.</p>"
    }</section>`;
    const first = $(".kn-notice-group", body);
    first ? first.insertAdjacentHTML("beforebegin", group) : body.insertAdjacentHTML("beforeend", group);
    hydrate();
  }
  const days = new Map(upcoming().map((e) => [String(e.id), e]));
  for (const b of $$('.kn-notice-group .search-result[data-action="event-detail"]:not(.ds-memory-row)', dialog)) {
    const e = days.get(b.dataset.id);
    if (e)
      b.innerHTML = `${uiDayTile(e.date)}<span><strong>${esc(e.title)}</strong><small>${esc(types[e.type] || "")}${e.years ? " · " + e.years + ". yıl" : ""}</small></span>`;
  }
};

/* ---------- Menu and account ---------- */
const uiSectionNotes = {
  home: "Aile akışı",
  gallery: "Fotoğraf arşivi",
  tree: "Köklerimiz",
  people: "Kişi rehberi",
  calendar: "Önemli günler",
  history: "Aile hikâyeleri",
  places: "Dünya haritası",
  chat: "Özel konuşmalar",
  documents: "Belgeler",
  archive: "Sesler, tarifler, anılar",
  connections: "Akrabalık yolları",
  groups: "Küçük aile grupları",
};
function uiRow(label, sub, ico, attrs, cls = "") {
  return `<button type="button" class="ds-row ${cls}" ${attrs}><span class="ds-row-icon">${icon(ico)}</span><span class="ds-row-text"><strong>${label}</strong>${sub ? `<small>${sub}</small>` : ""}</span>${icon("chevron-right")}</button>`;
}
function uiMenu() {
  modal(
    "Konak",
    `<button type="button" class="ds-me" data-action="account">${avatar(state.user)}<span><strong>${esc(state.user.name)}</strong><small>${esc(roleName[state.user.role] || "")} · Hesabım</small></span>${icon("chevron-right")}</button><nav class="ds-menu-grid" aria-label="Tüm bölümler">${navItems
      .map(
        ([id, i, l]) =>
          `<button type="button" class="ds-menu-tile ${route === id ? "is-current" : ""}" data-action="nav" data-page="${id}">${icon(i)}<strong>${esc(l)}</strong><small>${uiSectionNotes[id] || ""}</small></button>`,
      )
      .join(
        "",
      )}</nav>${isStaff() ? `<div class="ds-list">${uiRow("Yönetim paneli", "Onaylar, üyeler, kayıtlar", "shield-check", 'data-action="nav" data-page="admin"')}${isOwner() ? uiRow("Aile ayarları", "Aile kimliği, yedekler", "settings-2", 'data-action="nav" data-page="settings"') : ""}</div>` : ""}`,
  );
}
/* Appearance: light, dark or follow the device. */
function uiThemeRow() {
  const cur = window.sfTheme?.get() || "system";
  return `<div class="ds-row ds-theme-row"><span class="ds-row-icon">${icon("sun-moon")}</span><span class="ds-row-text"><strong id="ds-theme-label">Görünüm</strong><small>Gece için koyu renkler</small></span><span class="ds-segmented" role="group" aria-labelledby="ds-theme-label">${[
    ["light", "Açık"],
    ["dark", "Koyu"],
    ["system", "Sistem"],
  ]
    .map(
      ([v, l]) => `<button type="button" class="tab ${cur === v ? "active" : ""}" data-ui="theme" data-theme="${v}" aria-pressed="${cur === v}">${l}</button>`,
    )
    .join("")}</span></div>`;
}
function uiAccount() {
  modal(
    "Hesabım",
    `<div class="ds-account-head">${avatar(state.user, "large")}<div><h3>${esc(state.user.name)}</h3><p>${esc(state.user.email || "")}</p><span class="pill">${esc(roleName[state.user.role] || "")}</span></div></div><div class="ds-list"><button type="button" class="ds-row" data-ui="easy" aria-pressed="${kn.easy}"><span class="ds-row-icon">${icon("type")}</span><span class="ds-row-text"><strong>Kolay görünüm</strong><small>Daha büyük yazı ve düğmeler</small></span><span class="ds-switch" aria-hidden="true"></span></button>${uiThemeRow()}${uiRow("Bildirim tercihleri", "Bildirim merkezinde neler görünsün", "bell", 'data-konak="notice-prefs"')}${uiRow("Telefon bildirimleri", "Bu cihazda mesaj bildirimleri", "smartphone", 'data-action="push-settings"')}${uiRow("İki aşamalı doğrulama", "Hesabını koru", "shield-check", 'data-action="ar-security"')}</div><div class="ds-list">${uiRow("Resimli kullanım kılavuzu", "Adım adım anlatım", "book-open", 'data-hm="guide-full"')}${uiRow("Konağa ilk adımlar", "Profil, ağaç, fotoğraf, selam", "sparkles", 'data-konak="onboarding"')}</div><div class="ds-list">${uiRow("Verilerimi indir", "Paylaşımların, yorumların ve mesajların tek dosyada", "download", 'data-action="export-my-data"')}${uiRow("Oturumu kapat", "", "log-out", 'data-action="logout"')}${!isOwner() ? uiRow("Hesabımı sil", "", "trash-2", 'data-action="delete-account"', "is-danger") : ""}</div><nav class="legal-links" aria-label="Bilgi sayfaları"><a href="gizlilik.html" target="_blank" rel="noopener">Gizlilik</a><a href="destek.html" target="_blank" rel="noopener">Destek</a><a href="hesap-silme.html" target="_blank" rel="noopener">Hesap silme</a></nav>${demoMode ? `<div class="ds-demo-roles"><span class="eyebrow">Önizlemede yetki dene</span><div class="ds-segmented">${["owner", "moderator", "member"].map((r) => `<button type="button" class="tab ${state.user.role === r ? "active" : ""}" data-action="demo-role" data-role="${r}">${roleName[r]}</button>`).join("")}</div></div>` : ""}`,
  );
}
const uiBaseHandle = handle;
handle = async function (action, el) {
  if (action === "zoom-in" || action === "zoom-out" || action === "zoom-fit") {
    const r = await uiBaseHandle(action, el);
    ui.drawMinimap?.();
    return r;
  }
  if (action === "menu") return uiMenu();
  if (action === "account") return uiAccount();
  return uiBaseHandle(action, el);
};
