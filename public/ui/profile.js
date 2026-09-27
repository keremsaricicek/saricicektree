/* ui/profile.js: Profile header and hayat şeridi.
   Loaded in order after the older scripts; see index.html. */
"use strict";

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
  if (cover)
    cover.innerHTML = info.canEdit
      ? `<button type="button" class="ds-cover-add" data-ex="profile-edit" data-id="${esc(id)}">${icon("image-plus")}Kapak ekle</button>`
      : "";
  hydrate();
}
const uiBaseMountProfile = ffMountProfile;
ffMountProfile = async function () {
  await uiBaseMountProfile();
  await uiProfileHero();
  await uiLifeStrip();
};

/* ---------- Profile: hayat şeridi ----------
   Built only from records that already carry a date: birth and death, marriages with a
   recorded date, children's births, the person's events and dated photos they appear in.
   A date is shown only as precisely as it was entered (year, month or day). */
function uiLifeDate(d, precision) {
  if (!d) return null;
  d = String(d);
  const p = precision || (d.length <= 4 ? "year" : d.length <= 7 ? "month" : "day");
  if (!/^\d{4}/.test(d)) return null;
  if (p === "year") return { key: d.slice(0, 4), text: d.slice(0, 4) };
  if (p === "month") return { key: d.slice(0, 7), text: dateText(d.slice(0, 7) + "-15", { month: "long", year: "numeric" }) };
  return { key: d.slice(0, 10), text: dateText(d.slice(0, 10)) };
}
async function uiLifeStrip() {
  const pane = $("[data-ff-pane=story]"),
    id = personId,
    p = uiPerson(id);
  if (!pane || !p) return;
  const items = [],
    add = (date, precision, title, detail, icon_, attrs = "") => {
      const d = uiLifeDate(date, precision);
      if (d) items.push({ ...d, title, detail, icon: icon_, attrs });
    },
    name = (pid) => uiPerson(pid)?.name || "";
  add(p.birthDate, null, "Doğdu", p.birthPlace || "", "baby");
  for (const r of state.relations) {
    if (r.type === "spouse" && (r.personA === id || r.personB === id)) add(r.date, null, "Evlendi", name(r.personA === id ? r.personB : r.personA), "heart");
    if (r.type !== "spouse" && r.personA === id) {
      const c = uiPerson(r.personB);
      if (c)
        add(
          c.birthDate,
          null,
          (r.type === "adoptive" ? "Ailesine katıldı: " : "Çocuğu doğdu: ") + c.name.split(" ")[0],
          "",
          "sprout",
          `data-action="profile" data-id="${esc(c.id)}"`,
        );
    }
  }
  for (const e of state.events || [])
    if (e.personId === id && e.status === "approved" && !["birthday"].includes(e.type))
      add(e.date, null, e.title, e.place || "", "calendar-days", `data-action="event-detail" data-id="${esc(e.id)}"`);
  let photos = [];
  try {
    photos = (await hmApi("?person=" + encodeURIComponent(id))).items || [];
  } catch {
    photos = state.photos.filter((x) => (x.peopleIds || []).includes(id));
  }
  if (personId !== id) return;
  for (const x of photos.filter((x) => x.status !== "rejected").slice(0, 24))
    // Without a stored precision a 1 January date is treated as "year only".
    add(
      x.date,
      x.datePrecision || (String(x.date).endsWith("-01-01") ? "year" : null),
      x.title || "Fotoğraf",
      x.place || "",
      "image",
      `data-hm="open" data-id="${esc(x.id)}"`,
    );
  add(p.deathDate, null, "Aramızdan ayrıldı", "", "flower-2");
  items.sort((a, b) => a.key.localeCompare(b.key));
  $(".ds-life", pane)?.remove();
  const list = items.length
    ? `<ol class="ds-life-list" tabindex="0" aria-label="${esc(p.name)} hayat şeridi">${items
        .map((x) => {
          const tag = x.attrs ? "button" : "div";
          // x.attrs is built with esc() where the item is created; everything else is escaped here.
          return String(
            html`<li><${raw(tag)} class="ds-life-item"${raw(x.attrs ? ` type="button" ${x.attrs}` : "")}><time>${x.text}</time><span class="ds-life-dot">${raw(icon(x.icon))}</span><strong>${x.title}</strong>${x.detail ? html`<small>${x.detail}</small>` : ""}</${raw(tag)}></li>`,
          );
        })
        .join("")}</ol>`
    : `<p class="ds-life-empty">Tarihli bir kayıt eklendikçe bu şerit dolacak.</p>`;
  pane.insertAdjacentHTML(
    "afterbegin",
    `<section class="ds-life"><header><h2>Hayat şeridi</h2><span>${items.length ? items.length + " an" : ""}</span></header>${list}</section>`,
  );
  hydrate();
}
