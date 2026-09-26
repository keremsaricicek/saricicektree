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
const uiFullDate = (iso) =>
  iso ? new Date(iso).toLocaleString("tr-TR", { dateStyle: "long", timeStyle: "short" }) : "";

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
  if (mobileChat && !$(".ds-badge", mobileChat))
    mobileChat.insertAdjacentHTML("beforeend", '<b class="ds-badge ds-chat-badge" hidden></b>');
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
  const check = () => {
    const typing = document.activeElement?.matches?.("input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, [contenteditable]");
    document.body.classList.toggle("ds-keyboard", !!typing && visualViewport.height < innerHeight * 0.78);
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
  if (p.images?.length) return p.images.map((x) => ({ url: x.url, id: x.id, title: x.title || "" }));
  return p.image ? [{ url: p.image, id: p.photoId || null, title: "" }] : [];
}
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

/* ---------- Hayat: composer ---------- */
ffComposer = function () {
  const d = ff.draft,
    q = d.kind === "question",
    ph = q ? "Ailene bir soru sor…" : "Ailenle ne paylaşmak istersin?";
  return `<section class="ff-composer ds-composer ${d.body ? "is-active" : ""} ${q ? "is-question" : ""}" aria-label="Yeni paylaşım"><form id="ff-compose"><header class="ds-compose-head"><button type="button" class="icon-btn" data-ui="compose-close" aria-label="Kapat">${icon("x")}</button><strong>${q ? "Aileye soru" : "Yeni paylaşım"}</strong><button type="submit" class="btn primary small">Paylaş</button></header><div class="ds-compose-line">${avatar(state.user)}<label class="sr-only" for="ff-body">${ph}</label><textarea id="ff-body" name="body" placeholder="${ph}" maxlength="6000" rows="1">${esc(d.body || "")}</textarea><button type="button" class="icon-btn ds-compose-photo" data-feed="photo" aria-label="Fotoğraf ekle">${icon("image-plus")}</button></div><div id="ff-extra">${ffComposerExtra()}</div><div id="ff-image"></div><div id="ff-tags">${ffTagDraft()}</div><input id="ff-file" type="file" accept="image/jpeg,image/png,image/webp" hidden><div class="ff-composer-bottom"><div class="ff-compose-tools">${ffAction(icon("images") + "<span>Fotoğraf</span>", "photo", "", "ff-tool")}${ffAction(icon("circle-help") + "<span>Soru</span>", "kind", 'data-kind="question" aria-pressed="' + q + '"', "ff-tool " + (q ? "active" : ""))}${knButton(icon("at-sign") + "<span>Kişi etiketle</span>", "mention", 'aria-label="Birini @ ile etiketle"', "ff-tool")}</div><div class="ds-compose-send"><span class="ds-audience">${icon("users-round")}Bütün aile</span><button type="submit" class="btn primary">Paylaş</button></div></div><div class="kn-compose-status"><small id="kn-draft-status" role="status"></small>${d.body ? knButton("Taslağı temizle", "clear-draft", "", "text-btn") : ""}</div><div class="form-error" role="alert"></div></form></section>`;
};
function uiAutosize(ta, max = 320) {
  if (!ta) return;
  ta.style.height = "auto";
  ta.style.height = Math.min(max, ta.scrollHeight + 2) + "px";
}
function uiComposerOpen(open) {
  const c = $(".ds-composer");
  if (!c) return;
  c.classList.toggle("is-open", open && uiPhone());
  document.documentElement.classList.toggle("ds-lock", open && uiPhone());
  if (!open) {
    $("#ff-body")?.blur();
    document.body.classList.remove("ds-keyboard");
  }
}
document.addEventListener("focusin", (e) => {
  if (e.target.id === "ff-body") {
    e.target.closest(".ds-composer")?.classList.add("is-active");
    if (uiPhone()) uiComposerOpen(true);
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "ff-body") uiAutosize(e.target, uiPhone() ? 9999 : 320);
  if (e.target.matches(".ds-comment-form textarea")) {
    ui.drafts.set(Number(e.target.form.dataset.post), e.target.value);
    e.target.form.classList.toggle("has-text", !!e.target.value.trim());
    uiAutosize(e.target, 140);
  }
});

/* ---------- Hayat: page ---------- */
function uiSkeletonPosts(n = 2) {
  return Array.from(
    { length: n },
    () =>
      `<article class="ds-post ds-post-skeleton" aria-hidden="true"><header class="ds-post-head"><span class="skeleton" style="width:44px;height:44px;border-radius:50%"></span><div style="flex:1"><span class="skeleton" style="display:block;width:40%;height:13px"></span><span class="skeleton" style="display:block;width:24%;height:11px;margin-top:8px"></span></div></header><div class="ds-post-text"><span class="skeleton" style="display:block;height:13px"></span><span class="skeleton" style="display:block;width:72%;height:13px;margin-top:9px"></span></div><div class="skeleton" style="height:260px;border-radius:0"></div></article>`,
  ).join("");
}
function uiAgenda() {
  return upcoming()
    .filter((e) => e.date >= exDate())
    .slice(0, 6);
}
function uiDayTile(date) {
  return `<time class="ds-daytile" datetime="${esc(date)}"><strong>${Number(date.slice(8))}</strong><small>${dateText(date, { month: "short" })}</small></time>`;
}
home = function () {
  const first = uiName(state.user.name).name.split(" ")[0],
    agenda = uiAgenda();
  return `<h1 class="sr-only">Hayat · aile paylaşımları</h1><div class="ff-layout kn-social ds-feed-layout"><div class="ff-main"><header class="ds-hello"><span class="eyebrow">${dateText(exDate(), { weekday: "long", day: "numeric", month: "long" })}</span><p class="ds-hello-title">${uiGreeting()}, ${esc(first)}.</p></header>${agenda.length ? `<nav class="ds-agenda-strip" aria-label="Yaklaşan aile günleri">${agenda.map((e) => `<button class="ds-agenda-chip" data-action="event-detail" data-id="${esc(e.id)}">${uiDayTile(e.date)}<span><strong>${esc(e.title)}</strong><small>${esc(types[e.type] || "")}</small></span></button>`).join("")}</nav>` : ""}${ffComposer()}<div class="rd-feed-bar ds-feed-bar"><nav class="ff-filters" aria-label="Paylaşım filtresi">${[
    ["all", "Tümü"],
    ["question", "Sorular"],
    ["saved", "Kaydettiklerim"],
  ]
    .map(([id, label]) => ffAction(label, "filter", `data-filter="${id}" aria-pressed="${ff.filter === id}"`, ff.filter === id ? "active" : ""))
    .join("")}</nav></div><button id="ff-new" class="ff-new ds-new-posts" data-feed="new" hidden>${icon("arrow-up")} Yeni paylaşımlar</button><div id="ff-posts" aria-live="polite">${ff.loaded ? ffListMarkup() : uiSkeletonPosts()}</div><div id="ff-more">${ff.more ? ffAction("Daha eski paylaşımlar", "more", "", "btn") : ""}</div></div>${ffSide()}</div>`;
};

ffSide = function () {
  const next = uiAgenda().slice(0, 4),
    gather = state.events
      .filter((e) => e.type === "gathering" && e.status === "approved" && e.date >= exDate())
      .sort((a, b) => a.date.localeCompare(b.date))[0],
    today = exDate().slice(5),
    memory =
      state.photos
        .filter((p) => p.date?.slice(5) === today && p.date < exDate() && p.url)
        .map((p) => ({ title: p.title, id: p.id, action: "photo", date: p.date, url: p.url }))[0] ||
      archiveItems
        .filter((e) => !e.locked && e.data?.date?.slice(5) === today && e.data.date < exDate())
        .map((e) => ({ title: e.title, id: e.id, action: "ar-open", date: e.data.date }))[0],
    levels = generationMap(),
    gens = levels.size ? Math.max(...levels.values()) + 1 : 0,
    countries = new Set(state.people.map((p) => p.country).filter(Boolean)).size;
  return `<aside class="ff-aside ds-aside" aria-label="Aile gündemi"><section class="ds-side-card ds-family-card"><span class="eyebrow">${esc(state.settings?.familyTitle || "Sarıçiçek")} ailesi</span><div class="ds-stats"><button data-action="nav" data-page="people"><strong>${state.people.length}</strong><small>kişi</small></button><button data-action="nav" data-page="tree"><strong>${gens}</strong><small>nesil</small></button><button data-action="nav" data-page="places"><strong>${countries}</strong><small>ülke</small></button></div></section><section class="ds-side-card"><header class="ds-side-head"><h2>Yaklaşan günler</h2>${button("Takvim", "nav", null, "text-btn", 'data-page="calendar"')}</header>${next.map((e) => `<button class="ds-side-row" data-action="event-detail" data-id="${esc(e.id)}">${uiDayTile(e.date)}<span><strong>${esc(e.title)}</strong><small>${esc(types[e.type] || "")}${e.years ? " · " + e.years + ". yıl" : ""}</small></span>${uiIcon(typeIcon[e.type] || "calendar-days", "ds-side-icon")}</button>`).join("") || '<p class="ds-side-empty">Yaklaşan bir tarih yok.</p>'}</section>${gather ? `<section class="ds-side-card ds-gather"><span class="eyebrow">Sıradaki buluşma</span><h3>${esc(gather.title)}</h3><p>${icon("calendar-days")}${dateText(gather.date)}${gather.place ? " · " + esc(gather.place) : ""}</p>${button("Katılımını bildir", "event-detail", "arrow-up-right", "soft small", 'data-id="' + esc(gather.id) + '"')}</section>` : ""}<section class="ds-side-card ds-memory-card">${memory?.url ? `<img src="${esc(memory.url)}" alt="" loading="lazy">` : `<img src="assets/heritage.webp" alt="" loading="lazy">`}<div><span class="eyebrow">${memory ? "Bugün geçmişte" : "Aynı kökten"}</span><h3>${memory ? esc(memory.title) : "Her ismin bir hikâyesi var."}</h3>${memory ? button(dateText(memory.date) + " · Anıyı aç", memory.action, "arrow-up-right", "text-btn", 'data-id="' + esc(memory.id) + '"') : button("Soy ağacını keşfet", "nav", "arrow-up-right", "text-btn", 'data-page="tree"')}</div></section></aside>`;
};

/* ---------- Hayat: post card ---------- */
function uiMedia(p) {
  const imgs = uiImages(p);
  if (!imgs.length) return "";
  const memory = p.kind === "memory" && p.date,
    stamp = memory ? `<span class="ds-stamp"><b>${esc(p.date.slice(0, 4))}</b>${p.place ? `<small>${esc(p.place)}</small>` : ""}</span>` : "",
    alt = (x) => esc(x.title || p.body?.slice(0, 100) || "Aile fotoğrafı");
  if (imgs.length === 1) {
    const x = imgs[0],
      r = uiRatios.get(x.url);
    return `<div class="ds-media ds-media-1 ${r ? "" : "ds-loading"}" style="--ar:${r ? Math.min(1.91, Math.max(0.8, r)).toFixed(4) : "1.3333"}"><button type="button" data-ui="view" data-post="${p.id}" data-index="0" aria-label="Fotoğrafı tam ekran aç"><img class="ds-media-fill" src="${esc(x.url)}" alt="" aria-hidden="true" loading="lazy"><img class="ds-media-img" src="${esc(x.url)}" alt="${alt(x)}" loading="lazy" data-ar="${esc(x.url)}"></button>${stamp}</div>`;
  }
  const shown = imgs.slice(0, 4),
    rest = imgs.length - shown.length;
  return `<div class="ds-media ds-media-n ds-count-${shown.length}">${shown
    .map(
      (x, i) =>
        `<button type="button" class="ds-tile" data-ui="view" data-post="${p.id}" data-index="${i}" aria-label="Fotoğraf ${i + 1} / ${imgs.length}"><img src="${esc(x.url)}" alt="${alt(x)}" loading="lazy">${i === shown.length - 1 && rest > 0 ? `<span class="ds-more-count">+${rest}</span>` : ""}</button>`,
    )
    .join("")}${stamp}</div>`;
}
function uiWith(p) {
  const tags = (p.peopleIds || []).map(uiPerson).filter(Boolean);
  if (!tags.length) return "";
  const shown = tags.slice(0, 3);
  return `<div class="ds-with"><span class="ds-stack">${shown.map((x) => avatar(x)).join("")}</span><span>${shown.map((x) => ffAction(esc(x.name), "person", `data-person="${esc(x.id)}"`, "ds-with-name")).join('<span class="ds-sep">, </span>')}${tags.length > 3 ? ` <span class="ds-sep">ve ${tags.length - 3} kişi daha</span>` : ""}</span></div>`;
}
function uiBody(p, hasMedia) {
  if (!p.body) return "";
  const long = p.body.length > 420,
    short = p.body.length < 120 && !hasMedia && p.kind !== "question";
  const text = long ? `${esc(p.body.slice(0, 380).replace(/\s+\S*$/, ""))}… <button type="button" class="ds-readmore" data-ui="readmore" data-id="${p.id}">devamını oku</button>` : esc(p.body);
  return `<div class="ds-post-text ${short ? "is-short" : ""}" data-full="${long ? esc(p.body) : ""}"><p>${text}</p></div>`;
}
ffCard = function (p) {
  const person = uiPerson(p.authorPersonId),
    aud = uiAudience[p.visibility] || uiAudience.family,
    event = state.events.find((e) => e.id === p.eventId),
    media = uiMedia(p),
    q = p.kind === "question",
    kindRow =
      p.kind === "memory"
        ? `<div class="ds-kind is-memory">${icon("hourglass")}<span>Bir aile anısı</span>${p.date ? `<span>${dateText(p.date)}</span>` : ""}${p.place ? `<span>${esc(p.place)}</span>` : ""}</div>`
        : q
          ? `<div class="ds-kind is-question">${icon("message-circle-question")}<span>Aileye bir soru</span></div>`
          : p.kind === "event"
            ? `<div class="ds-kind is-event">${icon("calendar-heart")}<span>Birlikte buluşuyoruz</span></div>`
            : "";
  return `<article class="ff-post ds-post ${q ? "is-question" : ""} ${p.kind === "memory" ? "is-memory" : ""}" data-feed-card="${p.id}">${p.pinned ? `<div class="ds-pin">${icon("pin")}Sabitlenen duyuru</div>` : ""}<header class="ds-post-head">${ffAction(avatar(p.author), "person", `data-person="${esc(person?.id || "")}" data-user="${esc(p.createdBy)}" aria-label="${esc(uiName(p.author).name)} profilini aç" tabindex="-1"`, "ds-author-avatar")}<div class="ds-post-who">${ffAction(uiNameHtml(p.author), "person", `data-person="${esc(person?.id || "")}" data-user="${esc(p.createdBy)}"`, "ds-author")}<div class="ds-post-sub"><time datetime="${esc(p.createdAt || "")}" title="${esc(uiFullDate(p.createdAt))}">${uiWhen(p.createdAt)}</time><span aria-hidden="true">·</span><span class="ds-aud" title="${aud[1]}">${icon(aud[0])}<span class="sr-only">${aud[1]}</span></span></div></div>${ffAction(icon("ellipsis"), "options", `data-id="${p.id}" aria-label="Paylaşım seçenekleri"`, "icon-btn ds-post-menu")}</header>${kindRow}${uiBody(p, !!media)}${media}${event ? `<button class="ds-event" data-action="event-detail" data-id="${esc(event.id)}">${uiDayTile(event.date)}<span><strong>${esc(event.title)}</strong><small>${esc(event.place || dateText(event.date))}</small></span>${icon("chevron-right")}</button>` : ""}${uiWith(p)}<footer class="ds-actions">${ffAction(icon("heart") + `<span>${p.likes || ""}</span>`, "like", `data-id="${p.id}" aria-pressed="${!!p.liked}" aria-label="${p.liked ? "Beğeniyi geri al" : "Beğen"}"`, "ds-act ds-like" + (p.liked ? " is-on" : ""))}<button type="button" class="ds-act" data-ui="thread-focus" data-id="${p.id}" aria-label="${q ? "Cevapla" : "Yorum yaz"}">${icon("message-circle")}<span>${p.comments || ""}</span></button><span class="ds-act-gap"></span>${ffAction(icon("bookmark"), "save", `data-id="${p.id}" aria-pressed="${!!p.saved}" aria-label="${p.saved ? "Kaydedilenlerden çıkar" : "Kaydet"}"`, "ds-act ds-save" + (p.saved ? " is-on" : ""))}</footer>${uiThread(p)}</article>`;
};

/* ---------- Hayat: conversation under each post ---------- */
function uiCommentPeople(c) {
  const ids = Array.isArray(c.peopleIds) ? c.peopleIds : JSON.parse(c.peopleIds || "[]");
  const list = ids.map(uiPerson).filter(Boolean);
  return list.length ? `<div class="ds-comment-tags">${list.map((x) => `<button data-action="profile" data-id="${esc(x.id)}">${avatar(x)}${esc(x.name)}</button>`).join("")}</div>` : "";
}
function uiComment(c, postId, replyTo) {
  const mine = c.createdBy === state.user.id;
  return `<article class="ds-comment ${replyTo !== undefined ? "is-reply" : ""}" data-comment="${c.id}">${avatar(c.author)}<div class="ds-comment-main"><div class="ds-bubble"><strong>${uiNameHtml(c.author)}</strong><p>${replyTo ? `<span class="ds-reply-to">@${esc(uiName(replyTo).name)}</span> ` : ""}${esc(c.body)}</p></div>${uiCommentPeople(c)}<div class="ds-comment-meta"><time datetime="${esc(c.createdAt || "")}" title="${esc(uiFullDate(c.createdAt))}">${uiWhen(c.createdAt)}</time><button type="button" data-ui="reply" data-post="${postId}" data-id="${c.id}">Cevap ver</button>${mine || isStaff() ? `<button type="button" data-ui="comment-delete" data-post="${postId}" data-id="${c.id}">Kaldır</button>` : ""}</div></div></article>`;
}
function uiThreadList(items, postId) {
  const byId = new Map(items.map((c) => [c.id, c])),
    rootOf = (c) => {
      let x = c,
        guard = 0;
      while (x.parentId && byId.has(x.parentId) && guard++ < 20) x = byId.get(x.parentId);
      return x.id;
    },
    groups = new Map();
  for (const c of items) {
    const r = rootOf(c);
    if (!groups.has(r)) groups.set(r, []);
    if (r !== c.id) groups.get(r).push(c);
  }
  return [...groups.keys()]
    .map((r) => {
      const root = byId.get(r);
      return uiComment(root, postId) + groups.get(r).map((c) => uiComment(c, postId, c.parentId !== r ? byId.get(c.parentId)?.author : "")).join("");
    })
    .join("");
}
function uiThread(p) {
  const t = ui.threads.get(p.id),
    open = ui.expanded.has(p.id) && t?.items,
    total = p.comments || 0,
    q = p.kind === "question",
    noun = q ? "cevap" : "yorum",
    nounOf = q ? "cevabın" : "yorumun",
    nounPl = q ? "cevapları" : "yorumları";
  let head = "",
    body = "";
  if (open) {
    body = uiThreadList(t.items, p.id);
    head = `<div class="ds-thread-bar"><span>${total} ${noun}</span><button type="button" data-ui="thread-close" data-id="${p.id}">Daha az göster</button></div>`;
    if (t.hasMore) body += `<button type="button" class="ds-thread-more" data-ui="thread-more" data-id="${p.id}">Diğer ${nounPl} göster</button>`;
  } else {
    const preview = (p.commentPreview || []).slice(-2);
    if (total > preview.length) head = `<button type="button" class="ds-thread-all" data-ui="thread" data-id="${p.id}">${total} ${nounOf} tümünü gör</button>`;
    body = preview.map((c) => uiComment(c, p.id, c.parentId ? preview.find((x) => x.id === c.parentId)?.author : undefined)).join("");
  }
  const reply = t?.reply && t.items?.find((c) => c.id === t.reply),
    draft = ui.drafts.get(p.id) || "";
  return `<section class="ds-thread ${open ? "is-open" : ""}" data-thread="${p.id}" aria-label="${q ? "Cevaplar" : "Yorumlar"}">${head}<div class="ds-thread-list">${body}</div><form class="ds-comment-form ${draft.trim() ? "has-text" : ""}" data-post="${p.id}">${avatar(state.user)}<div class="ds-comment-input">${reply ? `<div class="ds-replying">${icon("corner-down-right")}<span><b>${esc(uiName(reply.author).name)}</b> kişisine cevap</span><button type="button" data-ui="reply-cancel" data-post="${p.id}" aria-label="Cevabı iptal et">${icon("x")}</button></div>` : ""}<textarea name="body" rows="1" maxlength="4000" placeholder="${q ? "Cevabını yaz…" : "Yorum yaz…"}" aria-label="${q ? "Cevabını yaz" : "Yorumunu yaz"}">${esc(draft)}</textarea><button type="submit" class="ds-send" aria-label="Gönder">${icon("arrow-up")}</button></div><small class="ds-comment-error" role="alert"></small></form></section>`;
}
async function uiLoadThread(id, more = false) {
  const t = ui.threads.get(id) || { items: [], reply: null };
  ui.threads.set(id, t);
  if (t.loading) return;
  t.loading = true;
  try {
    const r = await ffApi("/" + id + "/comments" + (more && t.after ? "?after=" + t.after : ""));
    const known = new Set(more ? t.items.map((c) => c.id) : []);
    t.items = more ? [...t.items, ...r.items.filter((c) => !known.has(c.id))] : r.items;
    t.after = r.after ?? t.items.at(-1)?.id;
    t.hasMore = !!r.hasMore;
  } finally {
    t.loading = false;
  }
}
function uiRedrawCard(id) {
  const p = ffFind(id);
  if (!p) return;
  for (const el of $$(`[data-feed-card="${id}"]`)) el.outerHTML = ffCard(p);
  hydrate();
}
function uiFocusComment(id) {
  const ta = $(`[data-feed-card="${id}"] .ds-comment-form textarea`);
  if (!ta) return;
  ta.focus({ preventScroll: true });
  const len = ta.value.length;
  ta.setSelectionRange(len, len);
  ta.closest(".ds-comment-form").scrollIntoView({ block: "nearest", behavior: uiReduced() ? "auto" : "smooth" });
}
async function uiOpenThread(id, focus = false) {
  ui.expanded.add(id);
  const box = $(`[data-thread="${id}"]`);
  box?.classList.add("is-loading");
  await uiLoadThread(id);
  uiRedrawCard(id);
  if (focus) uiFocusComment(id);
}
async function uiSendComment(form) {
  const id = Number(form.dataset.post),
    ta = form.elements.body,
    body = ta.value.trim(),
    err = $(".ds-comment-error", form);
  if (!body || form.classList.contains("is-sending")) return;
  const t = ui.threads.get(id) || { items: [], reply: null };
  ui.threads.set(id, t);
  form.classList.add("is-sending");
  err.textContent = "";
  try {
    await ffApi("/" + id + "/comments", "POST", { body, parentId: t.reply || null, peopleIds: form.dsPeople || [] });
    ui.drafts.delete(id);
    t.reply = null;
    ui.expanded.add(id);
    await uiLoadThread(id);
    await ffUpdateCard(id);
    uiFocusComment(id);
  } catch (e) {
    form.classList.remove("is-sending");
    err.textContent = e.message + " Yazdığın korunuyor.";
  }
}
document.addEventListener("submit", (e) => {
  const f = e.target.closest(".ds-comment-form");
  if (!f) return;
  e.preventDefault();
  uiSendComment(f);
});
document.addEventListener("keydown", (e) => {
  const ta = e.target.closest?.(".ds-comment-form textarea");
  if (!ta || e.key !== "Enter" || e.shiftKey || e.isComposing || uiPhone()) return;
  if (ta.parentElement.querySelector(".kn-mentions:not([hidden])")) return;
  e.preventDefault();
  uiSendComment(ta.form);
});
document.addEventListener("focusin", (e) => {
  if (e.target.matches(".ds-comment-form textarea")) {
    const f = e.target.form;
    knMention(
      e.target,
      () => f.dsPeople || [],
      (ids) => (f.dsPeople = ids),
    );
  }
});

/* The old modal conversation is replaced by the inline one wherever the post is on screen. */
const uiBaseFeedHandle = ffHandle;
ffHandle = async function (action, el) {
  const id = Number(el.dataset.id);
  if (action === "comments") {
    const card = [...$$(`[data-feed-card="${id}"]`)].find((c) => !c.closest("dialog"));
    if (card && !dialog.open) return uiOpenThread(id, true);
    await uiBaseFeedHandle("notice-open", el);
    return uiOpenThread(id, true);
  }
  if (action === "like") {
    const b = el.closest(".ds-like");
    if (b) {
      b.classList.toggle("is-on");
      b.classList.add("is-popping");
      navigator.vibrate?.(8);
    }
  }
  const r = await uiBaseFeedHandle(action, el);
  if (action === "notice-open") {
    dialog.classList.add("is-post");
    uiOpenThread(id).catch(() => {});
  }
  return r;
};

/* ---------- Hayat: click routing ---------- */
async function uiAction(action, el) {
  const id = Number(el.dataset.id || el.dataset.post);
  switch (action) {
    case "view":
      return uiLightbox(Number(el.dataset.post), Number(el.dataset.index || 0));
    case "thread":
      return uiOpenThread(id);
    case "thread-focus":
      if (!ui.expanded.has(id) && (ffFind(id)?.comments || 0) > Math.min(2, ffFind(id)?.commentPreview?.length || 0)) return uiOpenThread(id, true);
      return uiFocusComment(id);
    case "thread-close":
      ui.expanded.delete(id);
      uiRedrawCard(id);
      $(`[data-feed-card="${id}"]`)?.scrollIntoView({ block: "nearest" });
      return;
    case "thread-more":
      await uiLoadThread(id, true);
      return uiRedrawCard(id);
    case "reply": {
      const post = Number(el.dataset.post);
      if (!ui.expanded.has(post)) await uiOpenThread(post);
      ui.threads.get(post).reply = Number(el.dataset.id);
      uiRedrawCard(post);
      return uiFocusComment(post);
    }
    case "reply-cancel": {
      const t = ui.threads.get(Number(el.dataset.post));
      if (t) t.reply = null;
      uiRedrawCard(Number(el.dataset.post));
      return;
    }
    case "comment-delete": {
      const post = Number(el.dataset.post);
      return confirmAction("Yorumu kaldır", "Bu yorum artık görünmeyecek.", async () => {
        await ffApi("/comments/" + el.dataset.id, "DELETE", {});
        if (ui.expanded.has(post)) await uiLoadThread(post);
        await ffUpdateCard(post);
      });
    }
    case "readmore": {
      const box = el.closest(".ds-post-text");
      box.querySelector("p").textContent = box.dataset.full;
      box.classList.add("is-expanded");
      return;
    }
    case "compose-close":
      return uiComposerOpen(false);
    case "easy": {
      await knAction("easy", document.createElement("button"));
      el.setAttribute("aria-pressed", String(kn.easy));
      return;
    }
  }
}
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-ui]");
  if (!el) return;
  e.preventDefault();
  Promise.resolve(uiAction(el.dataset.ui, el)).catch((err) => toast(err.message));
});

/* ---------- Full-screen photo viewer ---------- */
function uiViewer(items, start = 0, meta = {}) {
  if (!items.length) return;
  const back = document.activeElement,
    lb = document.createElement("dialog");
  lb.className = "ds-lightbox";
  lb.setAttribute("aria-label", "Fotoğraf görüntüleyici");
  lb.innerHTML = `<div class="ds-lb-bg"></div><div class="ds-lb-top"><span class="ds-lb-count" aria-live="polite"></span><div class="ds-lb-tools"><button type="button" class="ds-lb-btn ds-lb-story" hidden>${icon("book-open-text")}<span>Hikâyesi</span></button><button type="button" class="ds-lb-btn ds-lb-zoom" aria-label="Yakınlaştır">${icon("zoom-in")}</button><button type="button" class="ds-lb-btn ds-lb-close" aria-label="Kapat">${icon("x")}</button></div></div><div class="ds-lb-stage"><div class="ds-lb-track">${items.map((x, i) => `<figure class="ds-lb-slide"><img src="${esc(x.url)}" alt="${esc(x.alt || "")}" draggable="false" ${Math.abs(i - start) > 1 ? 'loading="lazy"' : ""}></figure>`).join("")}</div>${items.length > 1 ? `<button type="button" class="ds-lb-nav is-prev" aria-label="Önceki fotoğraf">${icon("chevron-left")}</button><button type="button" class="ds-lb-nav is-next" aria-label="Sonraki fotoğraf">${icon("chevron-right")}</button>` : ""}</div><div class="ds-lb-foot">${meta.caption ? `<div class="ds-lb-caption">${meta.caption}</div>` : ""}${items.length > 1 ? `<div class="ds-lb-dots">${items.map(() => "<i></i>").join("")}</div>` : ""}</div>`;
  document.body.append(lb);
  hydrate();
  const stage = $(".ds-lb-stage", lb),
    track = $(".ds-lb-track", lb),
    slides = $$(".ds-lb-slide img", lb);
  let index = start,
    scale = 1,
    tx = 0,
    ty = 0;
  const pointers = new Map();
  let gesture = null;

  const apply = (animate) => {
    const img = slides[index];
    img.style.transition = animate ? "transform 260ms cubic-bezier(.2,.8,.2,1)" : "none";
    img.style.transform = `translate3d(${tx}px,${ty}px,0) scale(${scale})`;
    lb.classList.toggle("is-zoomed", scale > 1.01);
  };
  const clampPan = () => {
    const img = slides[index],
      r = stage.getBoundingClientRect(),
      w = img.clientWidth * scale,
      h = img.clientHeight * scale,
      mx = Math.max(0, (w - r.width) / 2),
      my = Math.max(0, (h - r.height) / 2);
    tx = Math.max(-mx, Math.min(mx, tx));
    ty = Math.max(-my, Math.min(my, ty));
  };
  const resetZoom = (animate = true) => {
    scale = 1;
    tx = ty = 0;
    apply(animate);
  };
  const go = (n, animate = true) => {
    if (scale > 1) resetZoom(false);
    index = Math.max(0, Math.min(items.length - 1, n));
    track.style.transition = animate ? "transform 320ms cubic-bezier(.16,1,.3,1)" : "none";
    track.style.transform = `translate3d(${-index * 100}%,0,0)`;
    $(".ds-lb-count", lb).textContent = items.length > 1 ? `${index + 1} / ${items.length}` : "";
    $$(".ds-lb-dots i", lb).forEach((d, i) => d.classList.toggle("on", i === index));
    const story = $(".ds-lb-story", lb);
    story.hidden = !(items[index].id && meta.story);
    $(".ds-lb-nav.is-prev", lb)?.toggleAttribute("disabled", index === 0);
    $(".ds-lb-nav.is-next", lb)?.toggleAttribute("disabled", index === items.length - 1);
  };
  const zoomAt = (s, cx, cy) => {
    const r = slides[index].getBoundingClientRect(),
      ox = cx - (r.left + r.width / 2),
      oy = cy - (r.top + r.height / 2),
      k = s / scale;
    tx = tx - ox * (k - 1);
    ty = ty - oy * (k - 1);
    scale = s;
    if (scale <= 1.01) {
      scale = 1;
      tx = ty = 0;
    }
    clampPan();
    apply(true);
  };
  const close = () => {
    if (lb.classList.contains("is-closing")) return;
    lb.classList.add("is-closing");
    setTimeout(
      () => {
        lb.close();
        lb.remove();
        document.documentElement.classList.remove("ds-lock");
        back?.focus?.({ preventScroll: true });
      },
      uiReduced() ? 0 : 200,
    );
  };

  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { type: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y), scale, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    } else if (pointers.size === 1) gesture = { type: "pending", x: e.clientX, y: e.clientY, t: performance.now(), tx, ty };
  });
  stage.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture.type === "pinch" && pointers.size === 2) {
      const [a, b] = [...pointers.values()],
        s = Math.max(1, Math.min(4, (gesture.scale * Math.hypot(a.x - b.x, a.y - b.y)) / gesture.dist));
      zoomAt(s, (a.x + b.x) / 2, (a.y + b.y) / 2);
      slides[index].style.transition = "none";
      return;
    }
    const dx = e.clientX - gesture.x,
      dy = e.clientY - gesture.y;
    if (gesture.type === "pending") {
      if (Math.hypot(dx, dy) < 8) return;
      gesture.type = scale > 1 ? "pan" : Math.abs(dx) > Math.abs(dy) ? "swipe" : dy > 0 ? "dismiss" : "none";
    }
    if (gesture.type === "pan") {
      tx = gesture.tx + dx;
      ty = gesture.ty + dy;
      clampPan();
      apply(false);
    } else if (gesture.type === "swipe") {
      const edge = (index === 0 && dx > 0) || (index === items.length - 1 && dx < 0) ? 0.35 : 1;
      track.style.transition = "none";
      track.style.transform = `translate3d(calc(${-index * 100}% + ${dx * edge}px),0,0)`;
    } else if (gesture.type === "dismiss") {
      const img = slides[index];
      img.style.transition = "none";
      img.style.transform = `translate3d(${dx * 0.4}px,${dy}px,0) scale(${1 - Math.min(0.25, dy / 1600)})`;
      lb.style.setProperty("--lb-fade", String(Math.max(0.15, 1 - dy / 450)));
    }
  });
  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (!gesture) return;
    if (gesture.type === "pinch") {
      if (pointers.size < 2) gesture = pointers.size ? { type: "pending", ...[...pointers.values()][0], t: performance.now(), tx, ty } : null;
      return;
    }
    const dx = p.x - gesture.x,
      dy = p.y - gesture.y,
      v = Math.hypot(dx, dy) / Math.max(1, performance.now() - gesture.t);
    if (gesture.type === "swipe") {
      const w = stage.clientWidth;
      if ((dx < -w * 0.18 || (dx < -30 && v > 0.45)) && index < items.length - 1) go(index + 1);
      else if ((dx > w * 0.18 || (dx > 30 && v > 0.45)) && index > 0) go(index - 1);
      else go(index);
    } else if (gesture.type === "dismiss") {
      lb.style.removeProperty("--lb-fade");
      if (dy > 120 || (dy > 40 && v > 0.5)) close();
      else resetZoom(true);
    } else if (gesture.type === "pending" && e.pointerType !== "mouse") {
      const now = performance.now();
      if (ui.lastTap && now - ui.lastTap.t < 300 && Math.hypot(p.x - ui.lastTap.x, p.y - ui.lastTap.y) < 30) {
        zoomAt(scale > 1 ? 1 : 2.5, p.x, p.y);
        ui.lastTap = null;
      } else {
        ui.lastTap = { t: now, x: p.x, y: p.y };
        setTimeout(() => {
          if (ui.lastTap?.t === now && scale === 1) lb.classList.toggle("is-chrome-hidden");
        }, 310);
      }
    }
    gesture = null;
  };
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);
  stage.addEventListener("dblclick", (e) => {
    if (!e.target.closest("button")) zoomAt(scale > 1 ? 1 : 2.5, e.clientX, e.clientY);
  });
  stage.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey && scale === 1) return;
      e.preventDefault();
      if (e.ctrlKey) zoomAt(Math.max(1, Math.min(4, scale * (1 - e.deltaY * 0.01))), e.clientX, e.clientY);
      else {
        tx -= e.deltaX;
        ty -= e.deltaY;
        clampPan();
        apply(false);
      }
    },
    { passive: false },
  );
  lb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") go(index + 1);
    else if (e.key === "ArrowLeft") go(index - 1);
  });
  lb.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  lb.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.classList.contains("ds-lb-close")) close();
    else if (b.classList.contains("is-prev")) go(index - 1);
    else if (b.classList.contains("is-next")) go(index + 1);
    else if (b.classList.contains("ds-lb-zoom")) {
      const r = stage.getBoundingClientRect();
      zoomAt(scale > 1 ? 1 : 2.5, r.left + r.width / 2, r.top + r.height / 2);
    } else if (b.classList.contains("ds-lb-story")) {
      const id = items[index].id;
      close();
      setTimeout(() => photoDetail(id), 220);
    }
  });
  addEventListener("resize", () => lb.isConnected && go(index, false));
  lb.showModal();
  document.documentElement.classList.add("ds-lock");
  go(start, false);
  $(".ds-lb-close", lb).focus({ preventScroll: true });
}
function uiLightbox(postId, index = 0) {
  const p = ffFind(postId);
  if (!p) return;
  const imgs = uiImages(p);
  uiViewer(
    imgs.map((x) => ({ url: x.url, id: x.id, alt: x.title || p.body?.slice(0, 100) || "Aile fotoğrafı" })),
    index,
    {
      story: true,
      caption: `<div class="ds-lb-author">${avatar(p.author)}<div><strong>${uiNameHtml(p.author)}</strong><small>${uiWhen(p.createdAt)}${p.kind === "memory" && p.date ? " · " + dateText(p.date) : ""}${p.place ? " · " + esc(p.place) : ""}</small></div></div>${p.body ? `<p>${esc(p.body)}</p>` : ""}`,
    },
  );
}

/* ---------- Dialog variants ---------- */
const uiBaseModal = modal;
modal = function (title, content, wide = false) {
  uiBaseModal(title, content, wide);
  const t = String(title);
  dialog.classList.remove("is-post", "is-search", "is-viewer", "is-menu");
  if (/\bara$|Ara$/.test(t) || $(".kn-search-field, #server-search, #search-input", dialog)) dialog.classList.add("is-search");
  if ($(".hm-viewer", dialog)) dialog.classList.add("is-viewer");
};

/* Notifications: upcoming days read like the side column. */
const uiBaseNotifications = knNotifications;
knNotifications = async function () {
  await uiBaseNotifications();
  const days = new Map(upcoming().map((e) => [String(e.id), e]));
  for (const b of $$('.kn-notice-group .search-result[data-action="event-detail"]', dialog)) {
    const e = days.get(b.dataset.id);
    if (e) b.innerHTML = `${uiDayTile(e.date)}<span><strong>${esc(e.title)}</strong><small>${esc(types[e.type] || "")}${e.years ? " · " + e.years + ". yıl" : ""}</small></span>`;
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
      .map(([id, i, l]) => `<button type="button" class="ds-menu-tile ${route === id ? "is-current" : ""}" data-action="nav" data-page="${id}">${icon(i)}<strong>${esc(l)}</strong><small>${uiSectionNotes[id] || ""}</small></button>`)
      .join("")}</nav>${isStaff() ? `<div class="ds-list">${uiRow("Yönetim paneli", "Onaylar, üyeler, kayıtlar", "shield-check", 'data-action="nav" data-page="admin"')}${isOwner() ? uiRow("Aile ayarları", "Aile kimliği, yedekler", "settings-2", 'data-action="nav" data-page="settings"') : ""}</div>` : ""}`,
  );
}
function uiAccount() {
  modal(
    "Hesabım",
    `<div class="ds-account-head">${avatar(state.user, "large")}<div><h3>${esc(state.user.name)}</h3><p>${esc(state.user.email || "")}</p><span class="pill">${esc(roleName[state.user.role] || "")}</span></div></div><div class="ds-list"><button type="button" class="ds-row" data-ui="easy" aria-pressed="${kn.easy}"><span class="ds-row-icon">${icon("type")}</span><span class="ds-row-text"><strong>Kolay görünüm</strong><small>Daha büyük yazı ve düğmeler</small></span><span class="ds-switch" aria-hidden="true"></span></button>${uiRow("Bildirim tercihleri", "Bildirim merkezinde neler görünsün", "bell", 'data-konak="notice-prefs"')}${uiRow("Telefon bildirimleri", "Bu cihazda mesaj bildirimleri", "smartphone", 'data-action="push-settings"')}${uiRow("İki aşamalı doğrulama", "Hesabını koru", "shield-check", 'data-action="ar-security"')}</div><div class="ds-list">${uiRow("Resimli kullanım kılavuzu", "Adım adım anlatım", "book-open", 'data-hm="guide-full"')}${uiRow("Konağa ilk adımlar", "Profil, ağaç, fotoğraf, selam", "sparkles", 'data-konak="onboarding"')}</div><div class="ds-list">${uiRow("Oturumu kapat", "", "log-out", 'data-action="logout"')}${!isOwner() ? uiRow("Hesabımı sil", "", "trash-2", 'data-action="delete-account"', "is-danger") : ""}</div>${demoMode ? `<div class="ds-demo-roles"><span class="eyebrow">Önizlemede yetki dene</span><div class="ds-segmented">${["owner", "moderator", "member"].map((r) => `<button type="button" class="tab ${state.user.role === r ? "active" : ""}" data-action="demo-role" data-role="${r}">${roleName[r]}</button>`).join("")}</div></div>` : ""}`,
  );
}
const uiBaseHandle = handle;
handle = async function (action, el) {
  if (action === "menu") return uiMenu();
  if (action === "account") return uiAccount();
  return uiBaseHandle(action, el);
};

/* ---------- Soy Ağacı ---------- */
const UI_TREE = { w: 216, h: 84, couple: 28, unit: 40, row: 178, pad: 96, top: 64 };
function uiTreeLayout(list) {
  const ids = new Set(list.map((p) => p.id)),
    rel = state.relations.filter((r) => ids.has(r.personA) && ids.has(r.personB)),
    levels = generationMap(),
    ranks = new Map(list.map((p) => [p.id, levels.get(p.id) || 0]));
  for (let i = 0; i < 3; i++)
    for (const r of rel.filter((r) => r.type === "spouse")) {
      const l = Math.max(ranks.get(r.personA), ranks.get(r.personB));
      ranks.set(r.personA, l);
      ranks.set(r.personB, l);
    }
  const parentsOf = new Map(),
    spousesOf = new Map();
  for (const r of rel) {
    if (r.type === "spouse") {
      for (const [a, b] of [
        [r.personA, r.personB],
        [r.personB, r.personA],
      ]) {
        if (!spousesOf.has(a)) spousesOf.set(a, []);
        spousesOf.get(a).push(b);
      }
    } else {
      if (!parentsOf.has(r.personB)) parentsOf.set(r.personB, []);
      parentsOf.get(r.personB).push(r);
    }
  }
  const byId = new Map(list.map((p) => [p.id, p])),
    rows = new Map();
  for (const p of list) {
    const k = ranks.get(p.id);
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k).push(p);
  }
  const sorted = [...rows.entries()].sort((a, b) => a[0] - b[0]),
    pos = new Map(),
    center = (id) => pos.get(id).x + UI_TREE.w / 2;
  sorted.forEach(([, row], ri) => {
    const y = UI_TREE.top + ri * UI_TREE.row,
      used = new Set(),
      units = [];
    const birth = (p) => p.birthDate || "9999";
    for (const p of [...row].sort((a, b) => birth(a).localeCompare(birth(b)))) {
      if (used.has(p.id)) continue;
      const members = [p];
      used.add(p.id);
      for (const s of spousesOf.get(p.id) || [])
        if (!used.has(s) && ranks.get(s) === ranks.get(p.id) && byId.has(s)) {
          members.push(byId.get(s));
          used.add(s);
        }
      // Blood relative first, married-in partner beside them.
      members.sort((a, b) => (parentsOf.has(b.id) ? 1 : 0) - (parentsOf.has(a.id) ? 1 : 0));
      const anchors = members.flatMap((m) => (parentsOf.get(m.id) || []).map((r) => r.personA)).filter((id) => pos.has(id));
      units.push({
        members,
        want: anchors.length ? anchors.reduce((s, id) => s + center(id), 0) / anchors.length : null,
        birth: birth(members[0]),
      });
    }
    units.sort((a, b) => (a.want ?? 1e9) - (b.want ?? 1e9) || a.birth.localeCompare(b.birth));
    let cursor = UI_TREE.pad;
    for (const u of units) {
      const width = u.members.length * UI_TREE.w + (u.members.length - 1) * UI_TREE.couple;
      let x = u.want == null ? cursor : Math.max(cursor, u.want - width / 2);
      u.members.forEach((m, i) => pos.set(m.id, { x: x + i * (UI_TREE.w + UI_TREE.couple), y, rank: ranks.get(m.id), row: ri }));
      cursor = x + width + UI_TREE.unit;
    }
  });
  // Centre parents over their children where the row leaves room.
  for (let pass = 0; pass < 2; pass++)
    for (let ri = sorted.length - 2; ri >= 0; ri--) {
      const row = sorted[ri][1]
        .map((p) => p.id)
        .sort((a, b) => pos.get(a).x - pos.get(b).x);
      const groups = [];
      for (const id of row) {
        const last = groups.at(-1);
        if (last && (spousesOf.get(id) || []).includes(last.at(-1))) last.push(id);
        else groups.push([id]);
      }
      groups.forEach((g, gi) => {
        const kids = list.filter((c) => (parentsOf.get(c.id) || []).some((r) => g.includes(r.personA)));
        if (!kids.length) return;
        const kc = kids.reduce((s, c) => s + center(c.id), 0) / kids.length,
          gl = pos.get(g[0]).x,
          gw = pos.get(g.at(-1)).x + UI_TREE.w - gl,
          target = kc - gw / 2,
          prev = groups[gi - 1],
          next = groups[gi + 1],
          min = prev ? pos.get(prev.at(-1)).x + UI_TREE.w + UI_TREE.unit : UI_TREE.pad,
          max = next ? pos.get(next[0]).x - UI_TREE.unit - gw : Infinity,
          nx = Math.max(min, Math.min(max, target)),
          dx = nx - gl;
        if (Math.abs(dx) > 0.5) g.forEach((id) => (pos.get(id).x += dx));
      });
    }
  const minX = Math.min(...[...pos.values()].map((p) => p.x)),
    shift = UI_TREE.pad - minX;
  for (const p of pos.values()) p.x += shift;
  const width = Math.max(760, ...[...pos.values()].map((p) => p.x + UI_TREE.w + UI_TREE.pad)),
    height = UI_TREE.top + sorted.length * UI_TREE.row - (UI_TREE.row - UI_TREE.h) + 72;
  // Connectors
  const r = 14,
    paths = [],
    marks = [];
  for (const rr of rel.filter((x) => x.type === "spouse")) {
    const a = pos.get(rr.personA),
      b = pos.get(rr.personB);
    if (!a || !b || a.row !== b.row) continue;
    const [l, rgt] = a.x < b.x ? [a, b] : [b, a],
      y = l.y + UI_TREE.h / 2;
    paths.push(`<path class="ds-edge-spouse" d="M${l.x + UI_TREE.w} ${y}H${rgt.x}"/>`);
    marks.push(`<circle class="ds-edge-ring" cx="${(l.x + UI_TREE.w + rgt.x) / 2}" cy="${y}" r="5"/>`);
  }
  const families = new Map();
  for (const c of list) {
    const rs = (parentsOf.get(c.id) || []).filter((x) => pos.has(x.personA));
    if (!rs.length) continue;
    const key = rs
      .map((x) => x.personA)
      .sort()
      .join("|");
    if (!families.has(key)) families.set(key, { parents: rs.map((x) => x.personA), kids: [] });
    families.get(key).kids.push({ id: c.id, adoptive: rs.some((x) => x.type === "adoptive") });
  }
  for (const f of families.values()) {
    const ps = f.parents.map((id) => pos.get(id)).sort((a, b) => a.x - b.x);
    let ox, oy;
    const adjacent = ps.length === 2 && ps[0].row === ps[1].row && ps[1].x - (ps[0].x + UI_TREE.w) <= UI_TREE.couple + 1;
    if (adjacent) {
      ox = (ps[0].x + UI_TREE.w + ps[1].x) / 2;
      oy = ps[0].y + UI_TREE.h / 2;
    } else {
      ox = ps[0].x + UI_TREE.w / 2;
      oy = ps[0].y + UI_TREE.h;
    }
    for (const k of f.kids) {
      const c = pos.get(k.id),
        cx = c.x + UI_TREE.w / 2,
        cy = c.y,
        bus = cy - 36,
        dir = Math.sign(cx - ox),
        rad = Math.min(r, Math.abs(cx - ox) / 2);
      const d = Math.abs(cx - ox) < 1 ? `M${ox} ${oy}V${cy}` : `M${ox} ${oy}V${bus - rad}Q${ox} ${bus} ${ox + dir * rad} ${bus}H${cx - dir * rad}Q${cx} ${bus} ${cx} ${bus + rad}V${cy}`;
      paths.unshift(`<path class="ds-edge-parent ${k.adoptive ? "is-adoptive" : ""}" data-child="${esc(k.id)}" d="${d}"/>`);
    }
  }
  return { pos, rows: sorted, width, height, svg: paths.join("") + marks.join("") };
}
function uiTreeNode(p, c) {
  const [first, ...rest] = String(p.name).split(" "),
    memorial = !!p.deathDate,
    years = `${p.birthDate ? p.birthDate.slice(0, 4) : "?"}${memorial ? " – " + p.deathDate.slice(0, 4) : ""}`;
  return `<button class="tree-node ds-node ${memorial ? "is-memorial" : ""} ${p.id === treeFocus ? "selected" : ""} ${p.id === ui.mePerson ? "is-me" : ""}" style="left:${c.x}px;top:${c.y}px" data-konak="tree-person" data-id="${esc(p.id)}" aria-label="${esc(p.name)}, ${years}">${avatar(p)}<span class="ds-node-text"><strong>${esc(rest.length ? first : p.name)}</strong>${rest.length ? `<span class="ds-node-sur">${esc(rest.join(" "))}</span>` : ""}${p.nickname ? `<em>“${esc(p.nickname)}”</em>` : ""}<small>${memorial ? icon("flower-2") : ""}${years}</small></span>${p.id === ui.mePerson ? '<b class="ds-node-me">Sen</b>' : ""}</button>`;
}
tree = function () {
  let list = state.people;
  if (treeFocus) {
    const keep = new Set([treeFocus]);
    for (let i = 0; i < 2; i++) {
      const snap = new Set(keep);
      for (const r of state.relations)
        if (snap.has(r.personA) || snap.has(r.personB)) {
          keep.add(r.personA);
          keep.add(r.personB);
        }
    }
    list = list.filter((p) => keep.has(p.id));
  }
  const total = list.length;
  list = list.slice(0, 160);
  const L = list.length ? uiTreeLayout(list) : null,
    focusName = treeFocus ? state.people.find((p) => p.id === treeFocus)?.name : "";
  const head = `<section class="page-head ds-tree-head"><div><span class="eyebrow">Köklerimiz</span><h1>Soy Ağacı</h1><p>${state.people.length} kişi · ${L ? L.rows.length : 0} kuşak${treeFocus ? " · " + esc(focusName) + " ve yakınları" : ""}</p></div><div class="row">${isStaff() ? button("Kişi ekle", "add-person", "user-plus", "primary") + button("Bağ ekle", "add-relation", "link-2") : ""}${knButton(icon("circle-help"), "tree-help", 'aria-label="Soy ağacı kullanım bilgisi" title="Nasıl kullanılır?"', "icon-btn")}</div></section>`;
  if (!L) return head + empty("Köklerimizi birlikte çizelim.", "İlk aile üyesini ekleyerek başlayın.", isStaff() ? "add-person" : "");
  return `${head}<div class="ds-tree-bar"><button type="button" class="search ds-tree-find" data-action="search-tree">${icon("search")}<span>İsim veya lakapla birini bul</span></button>${treeFocus ? `<div class="ds-focus-chip">${avatar(state.people.find((p) => p.id === treeFocus) || focusName)}<span>${esc(focusName)} ve yakınları</span>${button("", "tree-reset", "x", "icon-btn", 'aria-label="Tüm ağacı göster"')}</div>` : ""}</div><section class="tree-board kn-tree-board ds-tree-board"><div class="tree-viewport" tabindex="0" aria-label="Soy ağacı. Kaydırarak gezin; bir kişiye dokunarak profilini açın."><div class="tree-canvas" style="width:${L.width}px;height:${L.height}px;transform:scale(${zoom})"><svg width="${L.width}" height="${L.height}" fill="none" aria-hidden="true">${L.svg}</svg>${L.rows.map(([level], i) => `<span class="ds-gen" style="top:${UI_TREE.top + i * UI_TREE.row - 30}px">${Number(level) + 1}. kuşak</span>`).join("")}${list.map((p) => uiTreeNode(p, L.pos.get(p.id))).join("")}</div></div><div class="tree-tools ds-tree-tools"><button data-action="zoom-in" aria-label="Yakınlaştır">${icon("plus")}</button><span id="zoom-label">${Math.round(zoom * 100)}%</span><button data-action="zoom-out" aria-label="Uzaklaştır">${icon("minus")}</button><button data-action="zoom-fit" aria-label="Ekrana sığdır">${icon("scan")}</button></div><div class="ds-tree-legend"><span><i class="is-parent"></i>Ebeveyn – çocuk</span><span><i class="is-spouse"></i>Eş</span><span><i class="is-adoptive"></i>Evlat edinme</span><span>${icon("flower-2")}Anısına</span></div></section><p class="ds-tree-note">${total > 160 ? "Bu görünümde ilk 160 kişi var. Aramayla bir aile dalına odaklanabilirsin." : "Bir kişiye dokun: profilini aç ya da yalnızca yakınlarını gör. Ağacı sürükleyerek gezebilirsin."}</p>${isStaff() ? `<div class="ds-tree-foot">${button("Yazdır / PDF", "print-tree", "printer", "text-btn")}</div>` : ""}`;
};
/* Opening a person from the tree: a rich card with the next steps. */
function uiTreeFit() {
  const vp = $(".ds-tree-board .tree-viewport"),
    canvas = $(".tree-canvas");
  if (!vp || !canvas) return;
  const room = innerHeight - (uiPhone() ? 56 + 68 + 40 : 64 + 40),
    want = parseFloat(canvas.style.height) * zoom + 8;
  vp.style.height = Math.round(Math.max(360, Math.min(want, room))) + "px";
}
function uiTreeCentre(force = false) {
  const vp = $(".tree-viewport"),
    canvas = $(".tree-canvas");
  if (!vp || !canvas) return;
  uiTreeFit();
  const target = treeFocus && $(`.ds-node[data-id="${CSS.escape(treeFocus)}"]`);
  if (target) {
    const x = parseFloat(target.style.left) * zoom,
      y = parseFloat(target.style.top) * zoom;
    vp.scrollTo({ left: Math.max(0, x - vp.clientWidth / 2 + (UI_TREE.w * zoom) / 2), top: Math.max(0, y - vp.clientHeight / 3), behavior: "instant" });
  } else if (force || !ui.treeCentred) {
    // Centre on the eldest generation so the roots are the first thing seen.
    const nodes = $$(".ds-node", canvas),
      top = Math.min(...nodes.map((n) => parseFloat(n.style.top))),
      roots = nodes.filter((n) => parseFloat(n.style.top) === top),
      l = Math.min(...roots.map((n) => parseFloat(n.style.left))),
      r = Math.max(...roots.map((n) => parseFloat(n.style.left) + UI_TREE.w));
    vp.scrollLeft = Math.max(0, ((l + r) / 2) * zoom - vp.clientWidth / 2);
  }
  ui.treeCentred = true;
}
function uiTreePinch() {
  const vp = $(".tree-viewport"),
    canvas = $(".tree-canvas");
  if (!vp || vp.dataset.pinch) return;
  vp.dataset.pinch = "1";
  let start = null;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  vp.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 2) {
        const r = vp.getBoundingClientRect(),
          mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left,
          my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
        start = { d: dist(e.touches), z: zoom, cx: (vp.scrollLeft + mx) / zoom, cy: (vp.scrollTop + my) / zoom, mx, my };
      }
    },
    { passive: true },
  );
  vp.addEventListener(
    "touchmove",
    (e) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault();
      zoom = Math.max(0.35, Math.min(2, (start.z * dist(e.touches)) / start.d));
      canvas.style.transform = `scale(${zoom})`;
      vp.scrollLeft = start.cx * zoom - start.mx;
      vp.scrollTop = start.cy * zoom - start.my;
      $("#zoom-label") && ($("#zoom-label").textContent = Math.round(zoom * 100) + "%");
    },
    { passive: false },
  );
  vp.addEventListener("touchend", (e) => {
    if (e.touches.length < 2) start = null;
  });
  vp.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = vp.getBoundingClientRect(),
        mx = e.clientX - r.left,
        my = e.clientY - r.top,
        cx = (vp.scrollLeft + mx) / zoom,
        cy = (vp.scrollTop + my) / zoom;
      zoom = Math.max(0.35, Math.min(2, zoom * (1 - e.deltaY * 0.01)));
      canvas.style.transform = `scale(${zoom})`;
      vp.scrollLeft = cx * zoom - mx;
      vp.scrollTop = cy * zoom - my;
      $("#zoom-label") && ($("#zoom-label").textContent = Math.round(zoom * 100) + "%");
    },
    { passive: false },
  );
}
document.addEventListener("click", (e) => {
  if (e.target.closest('[data-action="search-tree"]')) {
    e.preventDefault();
    searchDialog(true);
  }
});

/* ---------- Avlu ---------- */
const uiTileRatio = (url) => Math.min(2.2, Math.max(0.62, uiRatios.get(url) || 1.3333));
hmTile = function (p) {
  const r = uiTileRatio(p.url);
  return `<button class="photo-card hm-tile ds-ptile" data-hm="open" data-id="${esc(p.id)}" style="--r:${r.toFixed(4)}"><span class="ds-ptile-img"><img src="${esc(p.url)}" alt="${esc(p.title || "Aile fotoğrafı")}" loading="lazy" data-ar="${esc(p.url)}"></span>${p.status === "pending" ? '<span class="ds-badge-soft is-pending">Onay bekliyor</span>' : ""}${p.albumId ? `<span class="ds-ptile-album" title="Albüm">${icon("layers")}</span>` : ""}<span class="ds-ptile-meta"><strong>${esc(p.title || "Adsız hatıra")}</strong><small>${esc(hmDate(p))}${p.place ? " · " + esc(p.place) : ""}</small>${p.description ? `<span class="ds-ptile-desc">${esc(p.description.slice(0, 180))}${p.description.length > 180 ? "…" : ""}</span>` : ""}</span></button>`;
};
hmGalleryMarkup = function () {
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
};
gallery = function () {
  const count = hm.items.length;
  return `<section class="page-head ds-avlu-head"><div><span class="eyebrow">Ailemizin hafızası</span><h1>Avlu</h1><p>${hm.loaded ? `${count} fotoğraf · ` : ""}Bir fotoğraf, bir tarih, bir yer ve içindeki insanlar.</p></div><div class="row">${hmButton(icon("circle-help"), "guide", 'aria-label="Avlu kullanım kılavuzu" title="Nasıl kullanılır?"', "icon-btn")}${button("Fotoğraf ekle", "upload", "image-plus", "primary")}</div></section><div class="ds-avlu-tools"><label class="search">${icon("search")}<input id="hm-search" placeholder="İsim, yer veya hatıra ara" aria-label="Avlu içinde ara" value="${esc(query)}"></label><div class="kn-view-switch" role="group" aria-label="Avlu görünümü">${knButton(icon("layout-grid") + "<span>Mozaik</span>", "gallery-view", 'data-view="mosaic" aria-pressed="' + (kn.view === "mosaic") + '"', "btn")}${knButton(icon("rows-3") + "<span>Zaman çizelgesi</span>", "gallery-view", 'data-view="timeline" aria-pressed="' + (kn.view === "timeline") + '"', "btn")}</div></div>${hm.years.length ? `<nav class="hm-years ds-years" aria-label="Fotoğraf yılı">${hmButton("Tüm yıllar", "year", 'data-year=""', !hm.year ? "active" : "")}${hm.years.map((y) => hmButton(y, "year", `data-year="${y}"`, hm.year === y ? "active" : "")).join("")}</nav>` : ""}<div id="hm-gallery" class="kn-gallery-${kn.view}">${hm.loaded ? hmGalleryMarkup() : `<div class="ds-justified">${Array.from({ length: 6 }, (_, i) => `<span class="skeleton ds-ptile-skeleton" style="--r:${[1.5, 0.8, 1.33, 1, 1.6, 0.75][i]}"></span>`).join("")}</div>`}</div><div id="hm-gallery-more">${hm.more ? hmButton("Daha eski fotoğraflar", "gallery-more") : ""}</div>`;
};
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
};
document.addEventListener("click", (e) => {
  const img = e.target.closest?.(".hm-view-photo .hm-marker-image > img");
  if (!img) return;
  const strip = $$("#hm-album-strip img", dialog),
    items = strip.length ? strip.map((x) => ({ url: x.src, alt: x.alt })) : [{ url: img.src, alt: img.alt }],
    start = Math.max(0, strip.findIndex((x) => x.closest("button")?.classList.contains("active")));
  uiViewer(items, strip.length ? start : 0);
});

/* ---------- Profile ---------- */
async function uiProfileHero() {
  const id = personId,
    p = uiPerson(id),
    hero = $(".profile-hero");
  if (!p || !hero) return;
  const info = exProfileCache.get(id) || {},
    me = await exApi("/me").catch(() => ({}));
  if (route !== "profile" || personId !== id) return;
  const path = me.personId && me.personId !== id ? kinshipPath(state.people, state.relations, me.personId, id) : [],
    kin = me.personId === id ? "Bu senin profilin" : path.length ? kinshipLabel(path) : "",
    generation = (generationMap().get(id) || 0) + 1,
    portrait = info.fields?.portrait?.value,
    portraitUrl = portrait ? state.photos.find((x) => x.id === portrait)?.url || "/media/" + portrait : null;
  let age = "";
  if (p.birthDate) {
    const end = new Date(p.deathDate || Date.now()),
      b = new Date(p.birthDate);
    let n = end.getFullYear() - b.getFullYear();
    if (end.getMonth() < b.getMonth() || (end.getMonth() === b.getMonth() && end.getDate() < b.getDate())) n--;
    age = p.deathDate ? `${n} yaşında aramızdan ayrıldı` : `${n} yaşında`;
  }
  const chip = (ico, text) => (text ? `<span class="ds-chip">${icon(ico)}${esc(text)}</span>` : "");
  hero.classList.toggle("is-memorial", !!p.deathDate);
  hero.innerHTML = `<div class="ds-ph-avatar">${portraitUrl ? `<img class="hm-portrait" src="${esc(portraitUrl)}" alt="${esc(p.name)}">` : avatar(p, "large")}</div><div class="ds-ph-main">${p.deathDate ? `<span class="ds-ph-memorial">${icon("flower-2")}Sevgiyle anıyoruz</span>` : ""}<h1>${esc(p.name)}</h1>${p.nickname ? `<p class="ds-ph-nick">“${esc(p.nickname)}”</p>` : ""}${p.birthDate || p.deathDate ? `<p class="ds-ph-life">${p.birthDate ? dateText(p.birthDate, { year: "numeric" }) : "?"}${p.deathDate ? " – " + dateText(p.deathDate, { year: "numeric" }) : ""}${age ? `<span> · ${esc(age)}</span>` : ""}</p>` : ""}<div class="ds-ph-chips">${chip("git-fork", generation + ". kuşak")}${chip("map-pin", p.place ? p.place + (p.country ? ", " + p.country : "") : "")}${chip("baby", p.birthPlace ? "Doğum yeri: " + p.birthPlace : "")}</div>${kin ? `<p class="ds-ph-kin">${icon("route")}<span>${esc(kin)}</span></p>` : ""}</div><div class="ds-ph-actions">${button("Ağaçta göster", "focus-person", "git-fork", "", 'data-id="' + esc(id) + '"')}${info.userId && info.userId !== state.user.id ? exButton(icon("message-circle") + "Mesaj gönder", "profile-message", `data-id="${esc(info.userId)}"`, "btn primary") : ""}${isStaff() ? button("", "edit-person", "pencil", "icon-btn", 'data-id="' + esc(id) + '" aria-label="Kişi kaydını düzenle" title="Kişi kaydını düzenle"') : ""}${info.canEdit ? exButton(icon("image"), "profile-edit", `data-id="${esc(id)}" aria-label="Profil resmi, kapak ve ayrıntılar" title="Profil resmi, kapak ve ayrıntılar"`, "icon-btn") : ""}</div>`;
  const cover = $(".hm-cover-empty");
  if (cover) cover.innerHTML = info.canEdit ? `<button type="button" class="ds-cover-add" data-ex="profile-edit" data-id="${esc(id)}">${icon("image-plus")}Kapak ekle</button>` : "";
  hydrate();
}
const uiBaseMountProfile = ffMountProfile;
ffMountProfile = async function () {
  await uiBaseMountProfile();
  await uiProfileHero();
};

/* ---------- Messages ---------- */
function uiDmChrome(w) {
  const head = $(".dm-window-head", w.el);
  if (!head || head.dataset.ds) return;
  head.dataset.ds = "1";
  const set = (sel, ico, label) => {
    const b = $(sel, head);
    if (b) {
      b.innerHTML = icon(ico);
      b.setAttribute("aria-label", label);
      b.setAttribute("title", label);
      b.classList.add("ds-dm-btn");
    }
  };
  set('[data-ex="back"]', "chevron-left", "Konuşmalara dön");
  set('[data-ex="options"]', "ellipsis", "Konuşma seçenekleri");
  set('[data-ex="members"]', "users", "Üyeler");
  set('[data-ex="minimize"]', "minus", "Küçült");
  set('[data-ex="close"]', "x", "Kapat");
  const who = head.querySelector("div");
  if (who && !who.querySelector("small")) who.insertAdjacentHTML("beforeend", `<small>${w.kind === "group" ? "Grup sohbeti" : "Özel konuşma"}</small>`);
  hydrate();
}
function uiDmMessages(w) {
  const log = $(".dm-log", w.el);
  if (!log) return;
  for (const m of $$(".dm-message", log)) {
    if (m.dataset.ds) continue;
    m.dataset.ds = "1";
    const status = $("footer > span", m);
    if (status) {
      const seen = status.textContent.trim() === "Görüldü";
      status.className = "ds-dm-status" + (seen ? " is-seen" : "");
      status.innerHTML = icon(seen ? "check-check" : "check");
      status.setAttribute("title", seen ? "Görüldü" : "Gönderildi");
      status.insertAdjacentHTML("beforeend", `<span class="sr-only">${seen ? "Görüldü" : "Gönderildi"}</span>`);
    }
    const reply = $('[data-ex="reply"]', m),
      report = $('[data-ex="report"]', m);
    if (reply) reply.innerHTML = icon("reply");
    if (report) report.innerHTML = icon("flag");
  }
  hydrate();
}
const uiBaseDmOpen = dmOpen;
dmOpen = async function (kind, id) {
  await uiBaseDmOpen(kind, id);
  const w = dm.windows.get(kind + ":" + id);
  if (w) {
    uiDmChrome(w);
    uiDmMessages(w);
  }
  document.body.classList.toggle("ds-dm-open", uiPhone() && route === "chat" && !!dm.active);
};
const uiBaseDmLoad = dmLoad;
dmLoad = async function (w, before) {
  await uiBaseDmLoad(w, before);
  if (dm.windows.has(w.key)) uiDmMessages(w);
};
const uiBaseDmPosition = dmPosition;
dmPosition = function () {
  uiBaseDmPosition();
  document.body.classList.toggle("ds-dm-open", uiPhone() && route === "chat" && !!dm.active);
  document.body.classList.toggle("ds-inbox-open", !uiPhone() && !!dm.inbox);
};
const uiBaseDmLists = dmLists;
dmLists = function () {
  uiBaseDmLists();
  for (const b of $$("[data-dm-list] .chat-thread")) {
    const name = $("strong", b);
    if (name && !name.dataset.ds) {
      name.dataset.ds = "1";
      name.innerHTML = uiNameHtml(name.textContent);
    }
  }
};

/* ---------- Render hook ---------- */
const uiBaseRender = render;
render = function () {
  uiBaseRender();
  if (!state) return;
  document.body.dataset.page = route;
  uiShell();
  uiAfterRender();
};
function uiAfterRender() {
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
    if (ui.mePerson === undefined) {
      ui.mePerson = null;
      exApi("/me")
        .then((me) => {
          ui.mePerson = me.personId || null;
          if (ui.mePerson && route === "tree") render();
        })
        .catch(() => {});
    }
  } else ui.treeCentred = false;
}

if (state) render();
