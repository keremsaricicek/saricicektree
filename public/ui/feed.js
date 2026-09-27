/* ui/feed.js: Hayat: composer, reactions, live updates, page, post card, comments, click routing.
   Loaded in order after the older scripts; see index.html. */
"use strict";

/* ---------- Hayat: composer ---------- */
function ffComposer() {
  const d = ff.draft,
    q = d.kind === "question",
    ph = q ? "Ailene bir soru sor…" : "Ailenle ne paylaşmak istersin?";
  return `<section class="ff-composer ds-composer ${d.body ? "is-active" : ""} ${q ? "is-question" : ""}" aria-label="Yeni paylaşım"><form id="ff-compose"><header class="ds-compose-head"><button type="button" class="icon-btn" data-ui="compose-close" aria-label="Kapat">${icon("x")}</button><strong>${q ? "Aileye soru" : "Yeni paylaşım"}</strong><button type="submit" class="btn primary small">Paylaş</button></header><div class="ds-compose-line">${avatar(state.user)}<label class="sr-only" for="ff-body">${ph}</label><textarea id="ff-body" name="body" placeholder="${ph}" maxlength="6000" rows="1">${esc(d.body || "")}</textarea><button type="button" class="icon-btn ds-compose-photo" data-feed="photo" aria-label="Fotoğraf ekle">${icon("image-plus")}</button></div><div id="ff-extra">${ffComposerExtra()}</div><div id="ff-image"></div><div id="ff-tags">${ffTagDraft()}</div><input id="ff-file" type="file" accept="image/jpeg,image/png,image/webp" hidden><div class="ff-composer-bottom"><div class="ff-compose-tools">${ffAction(icon("images") + "<span>Fotoğraf</span>", "photo", "", "ff-tool")}${ffAction(icon("circle-help") + "<span>Soru</span>", "kind", 'data-kind="question" aria-pressed="' + q + '"', "ff-tool " + (q ? "active" : ""))}${knButton(icon("at-sign") + "<span>Kişi etiketle</span>", "mention", 'aria-label="Birini @ ile etiketle"', "ff-tool")}</div><div class="ds-compose-send"><span class="ds-audience">${icon("users-round")}Bütün aile</span><button type="submit" class="btn primary">Paylaş</button></div></div><div class="kn-compose-status"><small id="kn-draft-status" role="status"></small>${d.body ? knButton("Taslağı temizle", "clear-draft", "", "text-btn") : ""}</div><div class="form-error" role="alert"></div></form></section>`;
}
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

/* ---------- Hayat: reactions ---------- */
const UI_EMOJI = ["🌿", "😂", "🥹", "🙏", "👏"];
const UI_EMOJI_LABEL = { "🌿": "Sevgiyle", "😂": "Güldüm", "🥹": "Duygulandım", "🙏": "Minnettarım", "👏": "Tebrikler" };
function uiReactionRow(p) {
  const r = Object.entries(p.reactions || {}).filter(([e, n]) => UI_EMOJI.includes(e) && n > 0);
  if (!r.length) return "";
  return `<div class="ds-reactions" role="group" aria-label="Tepkiler">${r
    .sort((a, b) => UI_EMOJI.indexOf(a[0]) - UI_EMOJI.indexOf(b[0]))
    .map(
      ([e, n]) =>
        `<button type="button" class="ds-reaction ${p.myReaction === e ? "is-on" : ""}" data-ui="react" data-id="${p.id}" data-emoji="${e}" aria-pressed="${p.myReaction === e}" aria-label="${UI_EMOJI_LABEL[e]}: ${n}"><span aria-hidden="true">${e}</span>${n}</button>`,
    )
    .join("")}</div>`;
}
function uiReactMenu(btn) {
  $(".ds-react-menu")?.remove();
  if (btn.getAttribute("aria-expanded") === "true") return btn.setAttribute("aria-expanded", "false");
  const p = ffFind(Number(btn.dataset.id));
  btn.setAttribute("aria-expanded", "true");
  btn.insertAdjacentHTML(
    "afterend",
    `<div class="ds-react-menu" role="menu" aria-label="Tepki seç">${UI_EMOJI.map((e) => `<button type="button" role="menuitemradio" aria-checked="${p?.myReaction === e}" data-ui="react" data-id="${btn.dataset.id}" data-emoji="${e}" title="${UI_EMOJI_LABEL[e]}" aria-label="${UI_EMOJI_LABEL[e]}">${e}</button>`).join("")}</div>`,
  );
  $(".ds-react-menu button")?.focus();
}
document.addEventListener("click", (e) => {
  if (!e.target.closest(".ds-react-menu, .ds-react")) {
    $(".ds-react-menu")?.remove();
    $$('.ds-react[aria-expanded="true"]').forEach((b) => b.setAttribute("aria-expanded", "false"));
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $(".ds-react-menu")) {
    const b = $('.ds-react[aria-expanded="true"]');
    $(".ds-react-menu").remove();
    b?.setAttribute("aria-expanded", "false");
    b?.focus();
    return;
  }
  // Arrow keys move between the five reactions.
  const menu = e.target.closest?.(".ds-react-menu");
  if (menu && ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
    e.preventDefault();
    const items = $$("button", menu),
      i = items.indexOf(e.target),
      n = items.length,
      next = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) + n) % n;
    items[next].focus();
  }
});
async function uiReact(id, emoji) {
  const p = ffFind(id);
  if (!p) return;
  const same = p.myReaction === emoji;
  await ffApi("/" + id + "/reaction", same ? "DELETE" : "PUT", same ? {} : { emoji });
  await ffUpdateCard(id);
  $(`[data-feed-card="${id}"] .ds-react`)?.focus();
}
async function uiCommentLike(post, cid, on) {
  await ffApi("/comments/" + cid + "/like", on ? "DELETE" : "PUT", {});
  if (ui.expanded.has(post)) await uiLoadThread(post);
  await ffUpdateCard(post);
}

/* ---------- Hayat: live updates ----------
   One event stream per tab (shared with Mesajlar) carries a feed cursor; only posts that
   changed and are on screen are fetched again. Typing, open threads and scroll stay put. */
ui.feedCursor = null;
ui.pendingRefresh = new Set();
async function uiRefreshPost(id) {
  const el = $(`[data-feed-card="${id}"]`);
  if (!el) return;
  const active = document.activeElement;
  if ((el.contains(active) && active.matches("textarea, input")) || el.querySelector(".ds-react-menu")) return ui.pendingRefresh.add(id);
  let p;
  try {
    p = await ffApi("/" + id);
  } catch {
    return;
  }
  for (const arr of [ff.items, ff.pinned, ff.profileItems || []]) {
    const i = arr.findIndex((x) => x.id === id);
    if (i >= 0) arr[i] = p;
  }
  if (ui.expanded.has(id)) await uiLoadThread(id).catch(() => {});
  const cards = $$("[data-feed-card]"),
    top = (document.querySelector(".topbar")?.getBoundingClientRect().bottom || 0) + 8,
    anchor = cards.find((c) => c.getBoundingClientRect().bottom > top),
    key = anchor?.dataset.feedCard,
    before = anchor?.getBoundingClientRect().top;
  for (const c of $$(`[data-feed-card="${id}"]`)) {
    if (c.contains(document.activeElement)) continue;
    c.outerHTML = ffCard(p);
  }
  hydrate();
  const after = key && $(`[data-feed-card="${key}"]`)?.getBoundingClientRect().top;
  if (key && after !== undefined && before !== undefined && Math.abs(after - before) > 1) scrollBy(0, after - before);
}
document.addEventListener("focusout", () =>
  setTimeout(() => {
    for (const id of [...ui.pendingRefresh]) {
      const el = $(`[data-feed-card="${id}"]`);
      if (el && el.contains(document.activeElement)) continue;
      ui.pendingRefresh.delete(id);
      uiRefreshPost(id);
    }
  }, 400),
);
/* A post removed by its author disappears from every open feed; a draft being typed in it is lost with it. */
function uiRemovePost(id) {
  for (const arr of [ff.items, ff.pinned, ff.profileItems || []]) {
    const i = arr.findIndex((x) => x.id === id);
    if (i >= 0) arr.splice(i, 1);
  }
  ui.expanded?.delete(id);
  ui.pendingRefresh.delete(id);
  for (const c of $$(`[data-feed-card="${id}"]`)) c.remove();
}
async function uiFeedChanges() {
  if (ui.feedBusy || !state || !["home", "profile"].includes(route)) return;
  ui.feedBusy = true;
  try {
    const first = ui.feedCursor == null,
      r = await ffApi(first ? "/changes" : "/changes?after=" + ui.feedCursor);
    if (first) return void (ui.feedCursor = r.cursor);
    ui.feedCursor = r.cursor;
    const ids = r.reset ? [...new Set($$("[data-feed-card]").map((c) => Number(c.dataset.feedCard)))] : r.posts;
    for (const id of r.removed || []) uiRemovePost(id);
    for (const id of ids) await uiRefreshPost(id);
    if (r.fresh && route === "home" && $("#ff-new")) $("#ff-new").hidden = false;
  } catch (e) {
    reportBackgroundError("feed.live_failed", e); // the next stream event tries again
  } finally {
    ui.feedBusy = false;
  }
}
/* Shared stream: replaces the chat-only stream so Hayat and Mesajlar use one connection. */
ui.stream = null;
const uiWantsStream = () => state && (dm.windows.size || dm.inbox || route === "chat" || route === "home" || route === "profile");
dmStream = async function () {
  if (demoMode || window.FamilyNative?.available || ui.stream) return;
  const controller = new AbortController();
  ui.stream = controller;
  let chatRev = "";
  try {
    while (!controller.signal.aborted && uiWantsStream()) {
      try {
        const r = await fetch("/api/chat/stream", {
          credentials: "same-origin",
          headers: { "X-Family-Factor": sessionStorage.getItem("sf-factor") || "" },
          signal: controller.signal,
        });
        if (!r.ok) throw Error("Bağlantı yenileniyor.");
        const reader = r.body.getReader(),
          decoder = new TextDecoder();
        let buffer = "";
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let end;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const event = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (!event.startsWith("event: change") || document.hidden) continue;
            let rev = {};
            try {
              rev = JSON.parse(event.split("\ndata: ")[1] || "{}");
            } catch {
              /* malformed event: treated as "nothing changed" */
            }
            const chat = JSON.stringify([rev.lastId, rev.unread, rev.receipts, rev.groupId]);
            if (chat !== chatRev) {
              chatRev = chat;
              await Promise.all([...dm.windows.values()].map((w) => dmLoad(w)));
              await dmThreads().catch(() => {});
            }
            if (rev.feed !== undefined && rev.feed !== ui.feedCursor) await uiFeedChanges();
          }
        }
      } catch {
        if (controller.signal.aborted) break;
      }
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 2000);
        controller.signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
      });
    }
  } finally {
    if (ui.stream === controller) ui.stream = null;
  }
};
/* Where no stream is possible (preview, native shell) a quiet poll does the same job. */
setInterval(() => {
  if ((demoMode || window.FamilyNative?.available) && !document.hidden && !dialog.open) uiFeedChanges();
}, 12000);
addEventListener("online", () => uiFeedChanges());

/* Preview data: reactions, comment likes and change cursor behave like the server. */
const uiDemoFeedApi = ffApi;
ffApi = async function (suffix = "", method = "GET", body) {
  if (!demoMode) return uiDemoFeedApi(suffix, method, body);
  await uiDemoFeedApi();
  const D = ffDemo;
  D.activity ||= 0;
  const touch = () => ((D.activity += 1), ffDemoSave());
  const likeInfo = (c) => ({ ...c, likes: (c.likedBy || []).length, liked: (c.likedBy || []).includes(state.user.id) });
  if (suffix.startsWith("/changes")) {
    const raw = new URLSearchParams(suffix.split("?")[1]).get("after");
    return { cursor: D.activity, posts: raw !== null && Number(raw) < D.activity ? D.posts.map((p) => p.id) : [], fresh: false };
  }
  let m = suffix.match(/^\/(\d+)\/reaction$/);
  if (m) {
    const p = D.posts.find((x) => x.id === Number(m[1]));
    p.reactionsBy ||= {};
    if (method === "PUT") p.reactionsBy[state.user.id] = body.emoji;
    else delete p.reactionsBy[state.user.id];
    touch();
    return { ok: true };
  }
  m = suffix.match(/^\/comments\/(\d+)\/like$/);
  if (m) {
    const c = D.comments.find((x) => x.id === Number(m[1]));
    c.likedBy = (c.likedBy || []).filter((u) => u !== state.user.id);
    if (method === "PUT") c.likedBy.push(state.user.id);
    touch();
    return { ok: true };
  }
  const r = await uiDemoFeedApi(suffix, method, body);
  if (method !== "GET") touch();
  const decorate = (p) => {
    if (!p || typeof p !== "object" || p.id === undefined) return p;
    const src = D.posts.find((x) => x.id === p.id),
      by = src?.reactionsBy || {},
      counts = {};
    for (const e of Object.values(by)) counts[e] = (counts[e] || 0) + 1;
    return { ...p, reactions: counts, myReaction: by[state.user.id] || null, commentPreview: (p.commentPreview || []).map(likeInfo) };
  };
  if (Array.isArray(r?.items) && /\/comments/.test(suffix)) return { ...r, items: r.items.map(likeInfo) };
  if (Array.isArray(r?.items)) return { ...r, items: r.items.map(decorate), pinned: (r.pinned || []).map(decorate) };
  return decorate(r);
};

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
function home() {
  const first = uiName(state.user.name).name.split(" ")[0],
    agenda = uiAgenda();
  return `<h1 class="sr-only">Hayat · aile paylaşımları</h1><div class="ff-layout kn-social ds-feed-layout"><div class="ff-main"><header class="ds-hello"><span class="eyebrow">${dateText(exDate(), { weekday: "long", day: "numeric", month: "long" })}</span><p class="ds-hello-title">${uiGreeting()}, ${esc(first)}.</p></header>${agenda.length ? `<nav class="ds-agenda-strip" aria-label="Yaklaşan aile günleri">${agenda.map((e) => `<button class="ds-agenda-chip" data-action="event-detail" data-id="${esc(e.id)}">${uiDayTile(e.date)}<span><strong>${esc(e.title)}</strong><small>${esc(types[e.type] || "")}</small></span></button>`).join("")}</nav>` : ""}${ffComposer()}<div class="rd-feed-bar ds-feed-bar"><nav class="ff-filters" aria-label="Paylaşım filtresi">${[
    ["all", "Tümü"],
    ["question", "Sorular"],
    ["saved", "Kaydettiklerim"],
  ]
    .map(([id, label]) => ffAction(label, "filter", `data-filter="${id}" aria-pressed="${ff.filter === id}"`, ff.filter === id ? "active" : ""))
    .join(
      "",
    )}</nav></div><button id="ff-new" class="ff-new ds-new-posts" data-feed="new" hidden>${icon("arrow-up")} Yeni paylaşımlar</button><div id="ff-posts" aria-live="polite">${ff.loaded ? ffListMarkup() : uiSkeletonPosts()}</div><div id="ff-more">${ff.more ? ffAction("Daha eski paylaşımlar", "more", "", "btn") : ""}</div></div>${ffSide()}</div>`;
}

/* "Bugün geçmişte": records whose exact day matches today in an earlier year.
   Photos dated only by year or month never count; a year-only photo is stored as
   1 January, so without a stored precision that date is treated as uncertain too. */
function uiExactDay(date, precision) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(date || "")) return false;
  if (precision) return precision === "day";
  return !String(date).slice(5, 10).startsWith("01-01");
}
function uiOnThisDay() {
  const today = exDate(),
    md = today.slice(5),
    seen = new Set(),
    out = [];
  const photos = [...(hm.items || []), ...state.photos].filter((p) => p.id && !seen.has(p.id) && seen.add(p.id));
  for (const p of photos)
    if (p.url && p.status !== "rejected" && uiExactDay(p.date, p.datePrecision) && p.date.slice(5, 10) === md && p.date < today)
      out.push({ title: p.title || "Bir fotoğraf", id: p.id, action: "photo", date: p.date, url: p.url });
  for (const e of state.events)
    if (e.status === "approved" && !["birthday", "gathering"].includes(e.type) && uiExactDay(e.date) && e.date.slice(5, 10) === md && e.date < today)
      out.push({ title: e.title, id: e.id, action: "event-detail", date: e.date });
  for (const e of typeof archiveItems === "undefined" ? [] : archiveItems)
    if (!e.locked && uiExactDay(e.data?.date) && e.data.date.slice(5, 10) === md && e.data.date < today)
      out.push({ title: e.title, id: e.id, action: "ar-open", date: e.data.date });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
function ffSide() {
  const next = uiAgenda().slice(0, 4),
    gather = state.events
      .filter((e) => e.type === "gathering" && e.status === "approved" && e.date >= exDate())
      .sort((a, b) => a.date.localeCompare(b.date))[0],
    memory = uiOnThisDay()[0],
    levels = generationMap(),
    gens = levels.size ? Math.max(...levels.values()) + 1 : 0,
    countries = new Set(state.people.map((p) => p.country).filter(Boolean)).size;
  return `<aside class="ff-aside ds-aside" aria-label="Aile gündemi"><section class="ds-side-card ds-family-card"><span class="eyebrow">${esc(state.settings?.familyTitle || "Sarıçiçek")} ailesi</span><div class="ds-stats"><button data-action="nav" data-page="people"><strong>${state.people.length}</strong><small>kişi</small></button><button data-action="nav" data-page="tree"><strong>${gens}</strong><small>nesil</small></button><button data-action="nav" data-page="places"><strong>${countries}</strong><small>ülke</small></button></div></section><section class="ds-side-card"><header class="ds-side-head"><h2>Yaklaşan günler</h2>${button("Takvim", "nav", null, "text-btn", 'data-page="calendar"')}</header>${next.map((e) => `<button class="ds-side-row" data-action="event-detail" data-id="${esc(e.id)}">${uiDayTile(e.date)}<span><strong>${esc(e.title)}</strong><small>${esc(types[e.type] || "")}${e.years ? " · " + e.years + ". yıl" : ""}</small></span>${uiIcon(typeIcon[e.type] || "calendar-days", "ds-side-icon")}</button>`).join("") || '<p class="ds-side-empty">Yaklaşan bir tarih yok.</p>'}</section>${gather ? `<section class="ds-side-card ds-gather"><span class="eyebrow">Sıradaki buluşma</span><h3>${esc(gather.title)}</h3><p>${icon("calendar-days")}${dateText(gather.date)}${gather.place ? " · " + esc(gather.place) : ""}</p>${button("Katılımını bildir", "event-detail", "arrow-up-right", "soft small", 'data-id="' + esc(gather.id) + '"')}</section>` : ""}<section class="ds-side-card ds-memory-card">${memory?.url ? `<img src="${esc(memory.url)}" alt="" loading="lazy">` : `<img src="assets/heritage.webp" alt="" loading="lazy">`}<div><span class="eyebrow">${memory ? "Bugün geçmişte" : "Aynı kökten"}</span><h3>${memory ? esc(memory.title) : "Her ismin bir hikâyesi var."}</h3>${memory ? button(dateText(memory.date) + " · Anıyı aç", memory.action, "arrow-up-right", "text-btn", 'data-id="' + esc(memory.id) + '"') : button("Soy ağacını keşfet", "nav", "arrow-up-right", "text-btn", 'data-page="tree"')}</div></section></aside>`;
}

/* ---------- Hayat: post card ---------- */
function uiMedia(p) {
  const imgs = uiImages(p);
  if (!imgs.length) return "";
  const memory = p.kind === "memory" && p.date,
    stamp = memory ? `<span class="ds-stamp"><b>${esc(p.date.slice(0, 4))}</b>${p.place ? `<small>${esc(p.place)}</small>` : ""}</span>` : "",
    alt = (x) => esc(x.title || p.body?.slice(0, 100) || "Aile fotoğrafı");
  if (imgs.length === 1) {
    const x = imgs[0],
      r = uiRatios.get(x.url) || uiMediaRatio(x.media);
    return `<div class="ds-media ds-media-1 ${r ? "" : "ds-loading"}" style="--ar:${r ? Math.min(1.91, Math.max(0.8, r)).toFixed(4) : "1.3333"}"><button type="button" data-ui="view" data-post="${p.id}" data-index="0" aria-label="Fotoğrafı tam ekran aç"><img class="ds-media-fill" ${uiPic(x.url, x.media, { fixed: 320 })} alt="" aria-hidden="true" loading="lazy"><img class="ds-media-img" ${uiPic(x.url, x.media, { sizes: "(max-width: 700px) 100vw, 640px" })} alt="${alt(x)}" loading="lazy" decoding="async" data-ar="${esc(x.url)}"></button>${stamp}</div>`;
  }
  const shown = imgs.slice(0, 4),
    rest = imgs.length - shown.length;
  return `<div class="ds-media ds-media-n ds-count-${shown.length}">${shown
    .map(
      (x, i) =>
        `<button type="button" class="ds-tile" data-ui="view" data-post="${p.id}" data-index="${i}" aria-label="Fotoğraf ${i + 1} / ${imgs.length}"><img ${uiPic(x.url, x.media, { sizes: i === 0 && shown.length !== 2 ? "(max-width: 700px) 100vw, 640px" : "(max-width: 700px) 50vw, 320px" })} alt="${alt(x)}" loading="lazy" decoding="async" style="${uiFocus(x.media)}">${i === shown.length - 1 && rest > 0 ? `<span class="ds-more-count">+${rest}</span>` : ""}</button>`,
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
  const text = long
    ? `${esc(p.body.slice(0, 380).replace(/\s+\S*$/, ""))}… <button type="button" class="ds-readmore" data-ui="readmore" data-id="${p.id}">devamını oku</button>`
    : esc(p.body);
  return `<div class="ds-post-text ${short ? "is-short" : ""}" data-full="${long ? esc(p.body) : ""}"><p>${text}</p></div>`;
}
function ffCard(p) {
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
  return `<article class="ff-post ds-post ${q ? "is-question" : ""} ${p.kind === "memory" ? "is-memory" : ""}" data-feed-card="${p.id}">${p.pinned ? `<div class="ds-pin">${icon("pin")}Sabitlenen duyuru</div>` : ""}<header class="ds-post-head">${ffAction(avatar(p.author), "person", `data-person="${esc(person?.id || "")}" data-user="${esc(p.createdBy)}" aria-label="${esc(uiName(p.author).name)} profilini aç" tabindex="-1"`, "ds-author-avatar")}<div class="ds-post-who">${ffAction(uiNameHtml(p.author), "person", `data-person="${esc(person?.id || "")}" data-user="${esc(p.createdBy)}"`, "ds-author")}<div class="ds-post-sub"><time datetime="${esc(p.createdAt || "")}" title="${esc(uiFullDate(p.createdAt))}">${uiWhen(p.createdAt)}</time><span aria-hidden="true">·</span><span class="ds-aud" title="${aud[1]}">${icon(aud[0])}<span class="sr-only">${aud[1]}</span></span></div></div>${ffAction(icon("ellipsis"), "options", `data-id="${p.id}" aria-label="Paylaşım seçenekleri"`, "icon-btn ds-post-menu")}</header>${kindRow}${uiBody(p, !!media)}${media}${event ? `<button class="ds-event" data-action="event-detail" data-id="${esc(event.id)}">${uiDayTile(event.date)}<span><strong>${esc(event.title)}</strong><small>${esc(event.place || dateText(event.date))}</small></span>${icon("chevron-right")}</button>` : ""}${uiWith(p)}${uiReactionRow(p)}<footer class="ds-actions">${ffAction(icon("heart") + `<span>${p.likes || ""}</span>`, "like", `data-id="${p.id}" aria-pressed="${!!p.liked}" aria-label="${p.liked ? "Beğeniyi geri al" : "Beğen"}"`, "ds-act ds-like" + (p.liked ? " is-on" : ""))}<button type="button" class="ds-act" data-ui="thread-focus" data-id="${p.id}" aria-label="${q ? "Cevapla" : "Yorum yaz"}">${icon("message-circle")}<span>${p.comments || ""}</span></button><button type="button" class="ds-act ds-react ${p.myReaction ? "is-on" : ""}" data-ui="react-menu" data-id="${p.id}" aria-haspopup="true" aria-expanded="false" aria-label="${p.myReaction ? "Tepkin: " + p.myReaction + ". Değiştir" : "Tepki ver"}">${p.myReaction ? `<span class="ds-emoji" aria-hidden="true">${p.myReaction}</span>` : icon("smile-plus")}</button><span class="ds-act-gap"></span>${ffAction(icon("bookmark"), "save", `data-id="${p.id}" aria-pressed="${!!p.saved}" aria-label="${p.saved ? "Kaydedilenlerden çıkar" : "Kaydet"}"`, "ds-act ds-save" + (p.saved ? " is-on" : ""))}</footer>${uiThread(p)}</article>`;
}

/* ---------- Hayat: conversation under each post ---------- */
function uiCommentPeople(c) {
  const ids = Array.isArray(c.peopleIds) ? c.peopleIds : JSON.parse(c.peopleIds || "[]");
  const list = ids.map(uiPerson).filter(Boolean);
  return list.length
    ? `<div class="ds-comment-tags">${list.map((x) => `<button data-action="profile" data-id="${esc(x.id)}">${avatar(x)}${esc(x.name)}</button>`).join("")}</div>`
    : "";
}
function uiComment(c, postId, replyTo) {
  const mine = c.createdBy === state.user.id;
  return `<article class="ds-comment ${replyTo !== undefined ? "is-reply" : ""}" data-comment="${c.id}">${avatar(c.author)}<div class="ds-comment-main"><div class="ds-bubble">${c.likes ? `<span class="ds-comment-likes" aria-label="${c.likes} beğeni">${icon("heart")}${c.likes}</span>` : ""}<strong>${uiNameHtml(c.author)}</strong><p>${replyTo ? `<span class="ds-reply-to">@${esc(uiName(replyTo).name)}</span> ` : ""}${esc(c.body)}</p></div>${uiCommentPeople(c)}<div class="ds-comment-meta"><time datetime="${esc(c.createdAt || "")}" title="${esc(uiFullDate(c.createdAt))}">${uiWhen(c.createdAt)}</time><button type="button" data-ui="comment-like" data-post="${postId}" data-id="${c.id}" aria-pressed="${!!c.liked}" class="${c.liked ? "is-on" : ""}">${c.liked ? "Beğendin" : "Beğen"}</button><button type="button" data-ui="reply" data-post="${postId}" data-id="${c.id}">Cevap ver</button>${mine || isStaff() ? `<button type="button" data-ui="comment-delete" data-post="${postId}" data-id="${c.id}">Kaldır</button>` : ""}</div></div></article>`;
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
      return (
        uiComment(root, postId) +
        groups
          .get(r)
          .map((c) => uiComment(c, postId, c.parentId !== r ? byId.get(c.parentId)?.author : ""))
          .join("")
      );
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
    case "theme":
      window.sfTheme?.set(el.dataset.theme);
      for (const b of $$('[data-ui="theme"]')) {
        const on = b.dataset.theme === el.dataset.theme;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on);
      }
      return;
    case "dm-retry": {
      const w = dm.windows.get(el.dataset.key);
      if (w) return dmSend(w);
      return;
    }
    case "react-menu":
      return uiReactMenu(el);
    case "react":
      $(".ds-react-menu")?.remove();
      return uiReact(Number(el.dataset.id), el.dataset.emoji);
    case "comment-like":
      return uiCommentLike(Number(el.dataset.post), el.dataset.id, el.getAttribute("aria-pressed") === "true");
    case "focus":
      return uiChooseFocus(el.dataset.id);
    case "backfill": {
      el.disabled = true;
      const text = $("#ds-perf-text"),
        r = await uiBackfillVariants((t) => (text.textContent = t));
      text.textContent = `${r.done} fotoğraf hazırlandı${r.failed ? `, ${r.failed} fotoğraf açılamadı` : ""}.`;
      el.hidden = true;
      return;
    }
    case "copies-retry": {
      el.disabled = true;
      const r = await hmApi("/variants/retry", "POST", {});
      $("#ds-perf-text").textContent = `${r.retried} fotoğraf yeniden sıraya alındı.`;
      el.hidden = true;
      return;
    }
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
