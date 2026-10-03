/* One archive photograph, two ways to share it. */
const hm = {
  items: [],
  years: [],
  year: "",
  loaded: false,
  loading: false,
  more: false,
  offset: 0,
  uploads: [],
  index: 0,
  wallMode: "all",
  wallBefore: null,
  wallMore: false,
};
const hmButton = (label, action, attrs = "", cls = "btn") => `<button type="button" class="${cls}" data-hm="${action}" ${attrs}>${label}</button>`;
const hmDate = (p) =>
  !p.date
    ? "Tarih bilinmiyor"
    : p.datePrecision === "year"
      ? p.date.slice(0, 4) + " · yaklaşık"
      : p.datePrecision === "month"
        ? dateText(p.date, { month: "long", year: "numeric" }) + " · yaklaşık"
        : dateText(p.date);
let hmDemo;
try {
  hmDemo = JSON.parse(localStorage.getItem("sf-memories-v1")) || {};
} catch {
  hmDemo = {};
}
function hmRemember() {
  try {
    localStorage.setItem("sf-memories-v1", JSON.stringify(hmDemo));
  } catch {
    toast("Önizleme depolama alanı doldu; son değişiklik bu oturumda kalacak.");
  }
}
async function hmApi(suffix = "", method = "GET", b) {
  if (!demoMode) return api("/api/experience/memories" + suffix, method, b);
  const [path, q] = suffix.split("?"),
    qs = new URLSearchParams(q || ""),
    all = [
      ...state.photos.map((p) => ({ ...p, ...hmDemo[p.id] })),
      ...Object.values(hmDemo).filter((p) => p.id && !state.photos.some((x) => x.id === p.id)),
    ].filter((p) => p.id && !p.deletedAt);
  if (path === "/duplicates") {
    const found = [];
    if (crypto.subtle)
      for (const p of all) {
        if (!p.data) continue;
        const bytes = Uint8Array.from(atob(p.data.split(",").pop()), (c) => c.charCodeAt(0)),
          digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
            .map((x) => x.toString(16).padStart(2, "0"))
            .join("");
        if (digest === b.digest) found.push(p);
      }
    return { items: found };
  }
  if (!path) {
    if (method === "GET") {
      const rows = all
        .filter(
          (p) =>
            (!qs.get("year") || p.date?.startsWith(qs.get("year"))) &&
            (!qs.get("person") || p.peopleIds?.includes(qs.get("person"))) &&
            (!qs.get("author") || p.createdBy === qs.get("author")) &&
            (!qs.get("album") || p.albumId === qs.get("album")),
        )
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      return { items: rows, years: [...new Set(all.map((p) => p.date?.slice(0, 4)).filter(Boolean))].sort().reverse(), hasMore: false, offset: rows.length };
    }
    const albumId = archiveDemoId(),
      ids = [];
    for (const v of b.photos) {
      const id = archiveDemoId(),
        date = v.datePrecision === "year" ? v.date + "-01-01" : v.datePrecision === "month" ? v.date + "-01" : v.date;
      hmDemo[id] = { ...v, id, albumId, date, url: v.data, createdBy: state.user.id, createdAt: new Date().toISOString(), status: "approved", canEdit: true };
      ids.push(id);
    }
    hmRemember();
    if (b.share) {
      await ffApi("", "POST", {
        body: b.body,
        photoId: ids[0],
        peopleIds: b.photos.flatMap((p) => p.peopleIds),
        images: ids.map((id) => ({ id, url: hmDemo[id].url })),
        image: hmDemo[ids[0]].url,
        visibility: b.visibility,
        kind: "post",
      });
    }
    return { id: ids[0], ids, albumId };
  }
  const parts = path.split("/").filter(Boolean),
    p = all.find((p) => p.id === parts[0]);
  if (!p) throw Error("Fotoğraf bulunamadı.");
  if (parts[1] === "related")
    return { items: all.filter((x) => x.id !== p.id && (x.place === p.place || x.peopleIds?.some((id) => p.peopleIds?.includes(id)))).slice(0, 8) };
  if (method === "GET") return { ...p, canEdit: true, suggestions: p.suggestions || [] };
  if (parts[1] === "suggestions") {
    if (method === "POST") p.suggestions = [...(p.suggestions || []), { id: archiveDemoId(), author: state.user.name, data: b, status: "pending" }];
    else {
      const s = p.suggestions.find((s) => s.id === b.id);
      if (s) {
        s.status = b.status;
        if (b.status === "approved") Object.assign(p, s.data);
      }
    }
  } else if (parts[1] === "audio") p.audio = method === "PUT" ? { url: b.data, transcript: b.transcript } : { ...p.audio, transcript: b.transcript };
  else Object.assign(p, b, { date: b.datePrecision === "year" ? b.date + "-01-01" : b.datePrecision === "month" ? b.date + "-01" : b.date });
  hmDemo[p.id] = p;
  hmRemember();
  return { ok: true };
}
function hmMerge(items) {
  for (const p of items) {
    const i = state.photos.findIndex((x) => x.id === p.id);
    if (i < 0) state.photos.push(p);
    else state.photos[i] = { ...state.photos[i], ...p };
  }
}
async function hmGalleryLoad(more = false) {
  if (hm.loading) return;
  hm.loading = true;
  const year = hm.year;
  try {
    const r = await hmApi("?year=" + year + "&offset=" + (more ? hm.offset : 0));
    if (year !== hm.year) return;
    hm.items = more ? [...hm.items, ...r.items.filter((p) => !hm.items.some((x) => x.id === p.id))] : r.items;
    hmMerge(r.items);
    hm.years = r.years;
    hm.more = r.hasMore;
    hm.offset = r.offset;
    hm.loaded = true;
    if (route === "gallery") render();
  } catch (e) {
    if ($("#hm-gallery")) $("#hm-gallery").innerHTML = `<div class="ff-empty">${esc(e.message)} ${hmButton("Tekrar dene", "gallery-retry")}</div>`;
  } finally {
    hm.loading = false;
    if (year !== hm.year && route === "gallery") hmGalleryLoad();
  }
}
function hmTags(ids = [], prefix = "peopleIds") {
  return `<div class="field full"><label>Bu fotoğrafta kimler var? *</label><input class="hm-tag-search" placeholder="Soy ağacında isim veya lakap ara" aria-label="Etiketlenecek kişiyi ara"><div class="tags-picker hm-tags">${state.people.map((p) => `<label data-name="${esc((p.name + " " + (p.nickname || "")).toLocaleLowerCase("tr"))}"><input type="checkbox" name="${prefix}" value="${esc(p.id)}" ${ids.includes(p.id) ? "checked" : ""}>${avatar(p)}<span>${esc(p.name)}${p.nickname ? "<small>" + esc(p.nickname) + "</small>" : ""}</span></label>`).join("")}</div></div>`;
}
function hmMetaForm(p = {}) {
  const precision = p.datePrecision || "day",
    date = (p.date || "").slice(0, precision === "year" ? 4 : precision === "month" ? 7 : 10);
  return `<div class="form-grid">${input("Hatıranın başlığı", "title", p.title, "text", 'maxlength="160"')}${select(
    "Tarih bilgisi *",
    "datePrecision",
    [
      ["day", "Kesin gün / ay / yıl"],
      ["month", "Yaklaşık: ay ve yıl"],
      ["year", "Yaklaşık: yalnızca yıl"],
    ],
    precision,
  )}${input("Çekildiği tarih *", "date", date, precision === "year" ? "number" : precision === "month" ? "month" : "date", precision === "year" ? 'required min="1800" max="' + new Date().getFullYear() + '"' : "required")}${input("Nerede çekildi? *", "place", p.place, "text", 'required maxlength="200" placeholder="Şehir, köy veya mekân"')}${hmTags(p.peopleIds)}${input("Soy ağacında olmayan kişiler", "outsiders", p.outsiders, "text", 'maxlength="1000" placeholder="İsimleri yaz; bilinmiyorsa açıkça belirt"')}${area("Hatırası ve önemi *", "description", p.description, 'required maxlength="5000" placeholder="Bu anı neden saklanmalı?"')}${input("Fotoğrafı kim çekti?", "photographer", p.photographer)}${input("Hangi albümden / kimden geldi?", "source", p.source)}</div>`;
}
function hmBindMeta(root) {
  const precision = $("[name=datePrecision]", root);
  if (precision)
    precision.onchange = () => {
      const input = $("[name=date]", root),
        value = input.value;
      input.type = precision.value === "year" ? "number" : precision.value === "month" ? "month" : "date";
      input.value = value.slice(0, precision.value === "year" ? 4 : precision.value === "month" ? 7 : 10);
      if (precision.value === "year") {
        input.min = "1800";
        input.max = new Date().getFullYear();
      } else {
        input.removeAttribute("min");
        input.removeAttribute("max");
      }
    };
  for (const search of $$(".hm-tag-search", root))
    search.oninput = () =>
      $$(".hm-tags label", search.parentElement).forEach((l) => (l.hidden = !l.dataset.name.includes(search.value.toLocaleLowerCase("tr"))));
}
function hmReadMeta(form) {
  const fd = new FormData(form);
  return {
    ...Object.fromEntries(fd),
    peopleIds: fd.getAll("peopleIds"),
    positions: (hm.uploads[hm.index]?.positions || []).filter((p) => fd.getAll("peopleIds").includes(p.personId)),
  };
}
function hmValid(p) {
  if (!p.date || !p.place?.trim() || !p.description?.trim() || (!p.peopleIds?.length && !p.outsiders?.trim()))
    throw Error("Tarih, yer, kişiler ve hatıra bilgilerini tamamla.");
}
function photoForm() {
  hmUpload(false);
}
function hmCapture() {
  const f = $("#hm-upload-form");
  if (f && hm.uploads[hm.index] && $("#hm-fields [name=description]")) Object.assign(hm.uploads[hm.index], hmReadMeta(f));
}
function hmShowUpload() {
  const p = hm.uploads[hm.index];
  $("#hm-thumbs").innerHTML = hm.uploads
    .map((x, i) =>
      hmButton(
        `<img src="${esc(x.data)}" alt="Fotoğraf ${i + 1}"><span>${i === 0 ? "Kapak" : i + 1}</span>`,
        "upload-index",
        `data-index="${i}"`,
        i === hm.index ? "active" : "",
      ),
    )
    .join("");
  if (!p) {
    $("#hm-fields").innerHTML = "Fotoğraf seç.";
    $("#hm-stage").innerHTML = "";
    return;
  }
  $("#hm-fields").innerHTML = hmMetaForm(p);
  hmBindMeta($("#hm-fields"));
  $("#hm-marker-tools").innerHTML =
    `<div class="row">${hmButton(icon("arrow-left"), "upload-left", 'aria-label="Fotoğrafı önceki sıraya taşı"', "icon-btn")}${hmButton(icon("arrow-right"), "upload-right", 'aria-label="Fotoğrafı sonraki sıraya taşı"', "icon-btn")}${hmButton("Kapak yap", "upload-cover", "", "text-btn")}${hmButton(icon("trash-2"), "upload-remove", 'aria-label="Fotoğrafı seçimden çıkar"', "icon-btn")}</div><label>Fotoğraf üzerinde işaretle<select id="hm-marker-person"><option value="">Kişi seç</option>${state.people.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select></label><small>Kişiyi seç, fotoğraftaki yerine dokun. İşarete dokunarak kaldır.</small>`;
  $("#hm-stage").innerHTML =
    `<div class="hm-marker-image"><img id="hm-photo-marker" src="${esc(p.data)}" alt="Kişileri işaretlemek için fotoğrafa dokun">${p.positions.map((pos, i) => hmButton(esc(state.people.find((x) => x.id === pos.personId)?.name || "?"), "marker-remove", `data-index="${i}" style="left:${pos.x}%;top:${pos.y}%"`, "hm-pin")).join("")}</div>`;
  $("#hm-photo-marker").onclick = (e) => {
    const id = $("#hm-marker-person").value;
    if (!id) {
      toast("Önce işaretlenecek kişiyi seç.");
      return;
    }
    hmCapture();
    const r = e.target.getBoundingClientRect();
    p.positions = p.positions.filter((x) => x.personId !== id);
    p.positions.push({ personId: id, x: Math.round((100 * (e.clientX - r.left)) / r.width), y: Math.round((100 * (e.clientY - r.top)) / r.height) });
    if (!p.peopleIds.includes(id)) p.peopleIds.push(id);
    hmShowUpload();
  };
  hydrate();
}
async function photoDetail(id) {
  try {
    const p = await hmApi("/" + id);
    hmMerge([p]);
    hm.current = p;
    modal(
      p.title,
      `<div class="hm-viewer"><div class="hm-view-photo">${p.video ? uiVideoPlayer(p.video, p.url, p.title) : `<div class="hm-marker-image"><img src="${esc(p.url)}" alt="${esc(p.title)}">${(p.positions || []).map((pos) => `<button class="hm-pin" style="left:${pos.x}%;top:${pos.y}%" data-action="profile" data-id="${esc(pos.personId)}">${esc(state.people.find((x) => x.id === pos.personId)?.name || "Kişi")}</button>`).join("")}</div>`}<div id="hm-album-strip"></div></div><aside class="hm-view-story"><span class="eyebrow">${esc(hmDate(p))}</span><h2>${esc(p.title)}</h2><p class="hm-location">${icon("map-pin")}${esc(p.place)}</p><p class="hm-story">${esc(p.description)}</p><div class="hm-person-tags">${(
        p.peopleIds || []
      )
        .map((id) => state.people.find((x) => x.id === id))
        .filter(Boolean)
        .map((x) => `<button data-action="profile" data-id="${esc(x.id)}">${avatar(x)}${esc(x.name)}</button>`)
        .join(
          "",
        )}${p.outsiders ? `<span>${esc(p.outsiders)}</span>` : ""}</div>${p.source || p.photographer ? `<div class="hm-source">${p.photographer ? "<p>Çeken: " + esc(p.photographer) + "</p>" : ""}${p.source ? "<p>Kaynak: " + esc(p.source) + "</p>" : ""}</div>` : ""}${p.audio ? `<section class="hm-audio"><h3>Bu anının sesi</h3><audio controls src="${esc(p.audio.url)}"></audio>${p.audio.transcript ? "<p>" + esc(p.audio.transcript) + "</p>" : ""}</section>` : ""}<div class="hm-view-actions">${hmButton(icon("send") + " Hayat’ta paylaş", "reshare", `data-id="${esc(id)}"`, "btn primary")}${hmButton(icon("pencil") + (p.canEdit ? " Bilgileri düzenle" : " Düzeltme öner"), "edit", `data-id="${esc(id)}"`)}${p.canEdit ? hmButton(icon("mic") + " Sesli hatıra", "voice", `data-id="${esc(id)}"`) : ""}${hmButton("Aynı anıya katkı ekle", "contribute", `data-id="${esc(id)}"`)}${button("İndir", "download-photo", "download", "", 'data-id="' + esc(id) + '"')}${p.canEdit ? exButton("Görünürlük", "audience", `data-kind="photo" data-id="${esc(id)}"`) : ""}</div>${p.suggestions?.length ? `<details><summary>Bilgi önerileri (${p.suggestions.length})</summary>${p.suggestions.map((s) => `<article class="hm-suggestion"><strong>${esc(s.author)}</strong><p>${esc(s.data.description)}</p><small>${esc(s.data.place)} · ${esc(hmDate(s.data))} · ${esc(s.status)}</small>${p.canEdit && s.status === "pending" ? hmButton("Kabul et", "review", `data-id="${esc(s.id)}" data-status="approved"`) + hmButton("Reddet", "review", `data-id="${esc(s.id)}" data-status="rejected"`) : ""}</article>`).join("")}</details>` : ""}</aside></div><div id="hm-related"></div>`,
      true,
    );
    if (p.albumId) {
      const r = await hmApi("?album=" + encodeURIComponent(p.albumId));
      hmMerge(r.items);
      if (hm.current?.id === id && $("#hm-album-strip"))
        $("#hm-album-strip").innerHTML = r.items
          .map((x) => hmButton(`<img src="${esc(x.url)}" alt="${esc(x.title)}">`, "open", `data-id="${esc(x.id)}"`, x.id === id ? "active" : ""))
          .join("");
    }
    const r = await hmApi("/" + id + "/related");
    hmMerge(r.items);
    if (hm.current?.id === id && $("#hm-related") && r.items.length)
      $("#hm-related").innerHTML = `<h3>Bu hikâyenin başka kareleri</h3><div class="hm-related">${r.items.map(hmTile).join("")}</div>`;
    hydrate();
  } catch (e) {
    toast(e.message);
  }
}
async function hmEdit(id) {
  const p = await hmApi("/" + id);
  modal(p.canEdit ? "Fotoğrafın bilgileri" : "Düzeltme öner", form(hmMetaForm(p), p.canEdit ? "Değişiklikleri kaydet" : "Öneriyi gönder"), true);
  hmBindMeta($("#modal-form"));
  submitWith(async (b, f) => {
    const v = { ...hmReadMeta(f), positions: p.positions || [] };
    v.positions = v.positions.filter((x) => v.peopleIds.includes(x.personId));
    hmValid(v);
    await hmApi("/" + id + (p.canEdit ? "" : "/suggestions"), p.canEdit ? "PATCH" : "POST", v);
    hm.loaded = false;
    await photoDetail(id);
    toast(p.canEdit ? "Fotoğraf bilgileri güncellendi." : "Önerin fotoğraf sahibinin onayına gönderildi.");
  });
}
async function hmReshare(id) {
  const p = await hmApi("/" + id);
  modal(
    "Hayat’ta paylaş",
    form(
      `<div class="hm-reshare"><img src="${esc(p.url)}" alt="${esc(p.title)}"><p>${esc(p.title)}</p></div>${area("Paylaşım yazın", "body", "", 'maxlength="6000"')}<p class="hm-summary">Fotoğraf Avlu’da kalır. Bu yazı ve yorumlar Hayat’ta görünür. Fotoğrafın mevcut erişim sınırları korunur.</p>`,
      "Hayat’ta paylaş",
    ),
  );
  submitWith(async (b) => {
    await ffApi("", "POST", {
      ...b,
      photoId: id,
      kind: "post",
      peopleIds: p.peopleIds,
      visibility: "family",
      clientId: archiveDemoId(),
      ...(demoMode ? { image: p.url } : {}),
    });
    ff.loaded = false;
    closeModal();
    route = "home";
    render();
  });
}
let hmRecorder = null,
  hmVoiceStream = null,
  hmRecognition = null,
  hmVoiceData = null,
  hmVoiceTimer = null,
  hmVoiceSession = 0,
  hmVoiceReady = Promise.resolve();
function hmStopVoice() {
  clearTimeout(hmVoiceTimer);
  if (hmRecorder?.state === "recording") hmRecorder.stop();
  hmVoiceStream?.getTracks().forEach((t) => t.stop());
  hmVoiceStream = null;
  hmRecognition?.stop();
  hmRecognition = null;
}
dialog.addEventListener("close", hmStopVoice);
async function hmVoice(id) {
  hmStopVoice();
  hmVoiceSession++;
  const p = await hmApi("/" + id);
  hmVoiceData = null;
  modal(
    "Sesli hatıra",
    `<form id="hm-voice-form"><p>Fotoğrafın hikâyesini kendi sesinle anlat. En fazla 3 dakika veya 10 MB.</p><div class="hm-voice-controls">${hmButton(icon("mic") + " Kaydı başlat", "voice-start")}${hmButton(icon("square") + " Durdur", "voice-stop")}</div><label class="hm-check"><input id="hm-transcribe" type="checkbox"> Tarayıcının konuşma hizmetiyle yazıya da çevir</label><small>İsteğe bağlıdır. Desteklenen tarayıcılarda ses, tarayıcının konuşma hizmetine iletilebilir. Kaydetmeden önce metni düzelt.</small><p id="hm-voice-status" role="status"></p><audio id="hm-voice-preview" controls ${p.audio ? 'src="' + esc(p.audio.url) + '"' : ""}></audio><label class="field">Ses dosyası seç<input id="hm-audio-file" type="file" accept="audio/webm,audio/mp4,audio/ogg,audio/mpeg,audio/wav"></label>${area("Yazılı anlatım", "transcript", p.audio?.transcript || "", 'maxlength="10000"')}<div class="form-error" role="alert"></div><button class="btn primary" type="submit">Sesli hatırayı kaydet</button></form>`,
  );
  $("#hm-audio-file").onchange = async (e) => {
    const f = e.target.files[0];
    if (f) {
      if (f.size > 10 * 1024 * 1024) {
        toast("En fazla 10 MB seç.");
        return;
      }
      hmVoiceData = { mime: f.type, data: await hmReadFile(f) };
      $("#hm-voice-preview").src = hmVoiceData.data;
    }
  };
  $("#hm-voice-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    hmStopVoice();
    await hmVoiceReady;
    await archiveFormTask(form, async (f) => {
      if (!hmVoiceData && !p.audio) throw Error("Önce ses kaydet veya dosya seç.");
      await hmApi("/" + id + "/audio", hmVoiceData ? "PUT" : "PATCH", { ...hmVoiceData, transcript: new FormData(f).get("transcript") });
      await photoDetail(id);
    });
  };
}
const hmReadFile = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(Error("Dosya okunamadı."));
    r.readAsDataURL(file);
  });
async function hmStartVoice() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    toast("Bu tarayıcı ses kaydedemiyor; ses dosyası seçebilirsin.");
    return;
  }
  if (hmRecorder?.state === "recording") return;
  hmVoiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((x) => MediaRecorder.isTypeSupported(x));
  hmRecorder = new MediaRecorder(hmVoiceStream, mime ? { mimeType: mime } : {});
  const recorder = hmRecorder,
    session = hmVoiceSession;
  let ready;
  hmVoiceReady = new Promise((resolve) => (ready = resolve));
  const chunks = [];
  let size = 0;
  hmRecorder.ondataavailable = (e) => {
    chunks.push(e.data);
    size += e.data.size;
    if (size > 9 * 1024 * 1024) hmStopVoice();
  };
  hmRecorder.onstop = async () => {
    try {
      const blob = new Blob(chunks, { type: recorder.mimeType }),
        data = await hmReadFile(blob);
      if (session !== hmVoiceSession) return;
      hmVoiceData = { mime: blob.type.split(";")[0], data };
      if ($("#hm-voice-preview")) {
        $("#hm-voice-preview").src = hmVoiceData.data;
        $("#hm-voice-status").textContent = "Kayıt hazır. Dinleyip kaydedebilirsin.";
      }
    } finally {
      ready();
    }
  };
  hmRecorder.start(1000);
  $("#hm-voice-status").textContent = "Ses kaydediliyor…";
  hmVoiceTimer = setTimeout(hmStopVoice, 180000);
  if ($("#hm-transcribe").checked) {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (Speech) {
      hmRecognition = new Speech();
      hmRecognition.lang = "tr-TR";
      hmRecognition.continuous = true;
      hmRecognition.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++)
          if (e.results[i].isFinal && $("[name=transcript]", dialog)) $("[name=transcript]", dialog).value += e.results[i][0].transcript + " ";
      };
      hmRecognition.onerror = () => {
        if ($("#hm-voice-status")) $("#hm-voice-status").textContent = "Ses kaydı sürüyor; otomatik metin kullanılamadı. Metni elle ekleyebilirsin.";
      };
      hmRecognition.start();
    } else toast("Otomatik yazıya çevirme bu tarayıcıda yok; ses kaydı devam ediyor.");
  }
}
// Existing feed retains its actions; media uses the shared archive viewer.
const hmOldFeedHandle = ffHandle;
ffHandle = async function (action, el) {
  if (action === "photo") return hmUpload(true);
  if (action === "image") {
    const p = ffFind(Number(el.dataset.id));
    if (p?.photoId) return photoDetail(p.photoId);
  }
  return hmOldFeedHandle(action, el);
};
const hmOldComments = ffComments;
ffComments = async function (id, more = false) {
  await hmOldComments(id, more);
  const f = $("#ff-comment-form");
  if (!f || more) return;
  f.insertAdjacentHTML("afterbegin", `<details class="hm-comment-tags"><summary>Kişi etiketle</summary>${hmTags([])}</details>`);
  hmBindMeta(f);
  f.onsubmit = async (e) => {
    e.preventDefault();
    await archiveFormTask(f, async () => {
      const fd = new FormData(f);
      await ffApi("/" + id + "/comments", "POST", { body: fd.get("body"), parentId: ff.reply, peopleIds: fd.getAll("peopleIds") });
      await ffUpdateCard(id);
      await ffComments(id);
    });
  };
};
const hmOldMount = ffMountProfile;
ffMountProfile = async function () {
  await hmOldMount();
  if (route !== "profile") return;
  const id = personId,
    p = state.people.find((p) => p.id === id),
    hero = $(".profile-hero");
  if (!p || !hero) return;
  const info = exProfileCache.get(id) || {},
    me = await exApi("/me");
  if (route !== "profile" || personId !== id) return;
  const path = me.personId ? kinshipPath(state.people, state.relations, me.personId, id) : [],
    kin =
      me.personId === id
        ? "Sen"
        : path.length
          ? kinshipLabel(path)
          : me.personId
            ? "Kayıtlı akrabalık bağı bulunamadı"
            : "Akrabalık için hesabını kendi aile kaydına bağla",
    generation = (generationMap().get(id) || 0) + 1;
  let age = "";
  if (p.birthDate) {
    const end = new Date(p.deathDate || new Date().toISOString()),
      birth = new Date(p.birthDate);
    let n = end.getFullYear() - birth.getFullYear();
    if (end.getMonth() < birth.getMonth() || (end.getMonth() === birth.getMonth() && end.getDate() < birth.getDate())) n--;
    age = n + (p.deathDate ? " yaşında aramızdan ayrıldı" : " yaşında");
  }
  const portrait = info.fields?.portrait?.value,
    portraitUrl = portrait ? state.photos.find((x) => x.id === portrait)?.url || "/media/" + portrait : null;
  hero.innerHTML = `${portraitUrl ? `<img class="hm-portrait" src="${esc(portraitUrl)}" alt="${esc(p.name)} profil resmi">` : avatar(p, "large")}<div class="hm-profile-copy"><h1>${esc(p.name)}</h1>${p.nickname ? `<span class="hm-nickname">“${esc(p.nickname)}”</span>` : ""}<p class="hm-generation">${generation}. nesil <span title="Kayıtlı soy ağacındaki en eski atadan hesaplanır">· kayıtlı ağaçta</span></p><p class="hm-profile-places">${icon("map-pin")}<span>Doğduğu yer: ${esc(p.birthPlace || "Eklenmedi")}</span><span>Yaşadığı yer: ${esc(p.place || "Eklenmedi")}</span>${age ? "<span>" + esc(age) + "</span>" : ""}</p><p class="hm-kinship">${icon("git-fork")}${esc(kin)}</p></div><div class="hm-profile-actions">${button("", "focus-person", "git-fork", "icon-btn", 'data-id="' + esc(id) + '" aria-label="Ağaçta göster" title="Ağaçta göster"')}${isStaff() ? button("", "edit-person", "pencil", "icon-btn", 'data-id="' + esc(id) + '" aria-label="Kişi kaydını düzenle" title="Kişi kaydını düzenle"') : ""}${info.canEdit ? exButton(icon("sliders-horizontal"), "profile-edit", `data-id="${esc(id)}" aria-label="Profil resmi, kapak ve ayrıntılar" title="Profil resmi, kapak ve ayrıntılar"`, "icon-btn") : ""}${info.userId && info.userId !== state.user.id ? exButton(icon("message-circle"), "profile-message", `data-id="${esc(info.userId)}" aria-label="Mesaj gönder" title="Mesaj gönder"`, "icon-btn") : ""}</div>`;
  for (const row of $$("#main>.row")) row.remove();
  $("#ex-kin")?.setAttribute("hidden", "");
  $("[data-tab=family]")?.remove();
  $("[data-ff-pane=family]")?.remove();
  const posts = $("[data-tab=posts]");
  if (posts) posts.textContent = "Duvarı";
  if (!$(".ex-profile-cover"))
    hero.insertAdjacentHTML("beforebegin", '<div class="hm-cover-empty"><span>' + icon("image") + " Kapak fotoğrafı eklenmemiş</span></div>");
  if (ff.profileTab === "family") ff.profileTab = "posts";
  ffProfileTab();
  hm.wallMode = "all";
  hm.wallItems = [];
  await hmWall(id);
  hydrate();
};
async function hmWall(id, more = false) {
  const token = (hm.wallToken = (hm.wallToken || 0) + 1),
    mode = hm.wallMode,
    info = exProfileCache.get(id) || {};
  try {
    if (!more) {
      hm.wallItems = [];
      hm.wallPhotos = [];
      hm.wallBefore = null;
      hm.wallMore = true;
      hm.wallPhotoPages = { tagged: { offset: 0, more: mode !== "own" }, owned: { offset: 0, more: !!info.userId && mode !== "tagged" } };
    }
    const pages = hm.wallPhotoPages;
    const [r, tagged, owned] = await Promise.all([
      hm.wallMore
        ? ffApi("?wall=" + encodeURIComponent(id) + "&wallMode=" + mode + (hm.wallBefore ? "&before=" + hm.wallBefore : ""))
        : Promise.resolve({ items: [], hasMore: false, before: hm.wallBefore }),
      pages.tagged.more ? hmApi("?person=" + encodeURIComponent(id) + "&offset=" + pages.tagged.offset) : Promise.resolve({ items: [] }),
      pages.owned.more ? hmApi("?author=" + encodeURIComponent(info.userId) + "&offset=" + pages.owned.offset) : Promise.resolve({ items: [] }),
    ]);
    if (route !== "profile" || personId !== id || hm.wallToken !== token) return;
    hm.wallBefore = r.before;
    hm.wallMore = r.hasMore;
    hm.wallItems = [...new Map([...hm.wallItems, ...r.items].map((p) => [p.id, p])).values()];
    ff.profileItems = hm.wallItems;
    for (const [k, result] of [
      ["tagged", tagged],
      ["owned", owned],
    ])
      pages[k] = { offset: result.offset || pages[k].offset, more: !!result.hasMore };
    hm.wallPhotos = [...new Map([...hm.wallPhotos, ...tagged.items, ...owned.items].map((p) => [p.id, p])).values()];
    hmMerge(hm.wallPhotos);
    const used = new Set(hm.wallItems.flatMap((p) => [p.photoId, ...(p.images || []).map((x) => x.id)]));
    const entries = [
      ...hm.wallItems.map((p) => ({ date: p.createdAt, html: ffCard(p) })),
      ...hm.wallItems.flatMap((p) =>
        (p.wallComments || []).map((c) => ({
          date: c.createdAt,
          html: `<article class="hm-wall-comment">${avatar(c.author)}<div><strong>${esc(c.author)}</strong><small>${familyWhen(c.createdAt)}</small><p>${esc(c.body)}</p>${ffAction("Konuşmayı aç", "comments", `data-id="${p.id}"`, "text-btn")}</div></article>`,
        })),
      ),
      ...hm.wallPhotos
        .filter((p) => !used.has(p.id))
        .map((p) => ({ date: p.createdAt || p.date, html: `<article class="hm-wall-photo">${hmTile(p)}</article>` })),
    ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const pane = $("[data-ff-pane=posts]");
    if (!pane) return;
    pane.innerHTML = `<nav class="hm-wall-filters" aria-label="Duvar filtresi">${[
      ["all", "Tümü"],
      ["own", "Kendi paylaşımları"],
      ["tagged", "Etiketlendiği içerikler"],
    ]
      .map(([k, l]) => hmButton(l, "wall-filter", `data-mode="${k}" aria-pressed="${k === mode}"`, k === mode ? "active" : ""))
      .join(
        "",
      )}</nav><div id="ff-profile-posts">${entries.map((x) => x.html).join("") || '<div class="ff-empty">Henüz görünür bir paylaşım yok.</div>'}</div>${hm.wallMore || pages.tagged.more || pages.owned.more ? hmButton("Daha eski içerikler", "wall-more") : ""}`;
    hydrate();
  } catch (e) {
    if (hm.wallToken === token && $("#ff-profile-posts")) $("#ff-profile-posts").textContent = e.message;
  }
}
async function hmHandle(a, el) {
  const id = el.dataset.id;
  switch (a) {
    case "open":
      return photoDetail(id);
    case "guide":
      return hmGuide();
    case "guide-full": {
      const url = window.SF_GUIDE ? URL.createObjectURL(new Blob([window.SF_GUIDE], { type: "text/html" })) : "guide.html";
      window.open(url, "_blank", "noopener");
      if (window.SF_GUIDE) setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }
    case "year":
      hm.year = el.dataset.year;
      hm.loaded = false;
      return hmGalleryLoad();
    case "gallery-retry":
      return hmGalleryLoad();
    case "gallery-more":
      return hmGalleryLoad(true);
    case "upload-index":
      hmCapture();
      hm.index = Number(el.dataset.index);
      return hmShowUpload();
    case "upload-left":
    case "upload-right": {
      hmCapture();
      const n = hm.index + (a === "upload-left" ? -1 : 1);
      if (n >= 0 && n < hm.uploads.length) {
        [hm.uploads[n], hm.uploads[hm.index]] = [hm.uploads[hm.index], hm.uploads[n]];
        hm.index = n;
      }
      return hmShowUpload();
    }
    case "upload-cover": {
      hmCapture();
      hm.uploads.unshift(hm.uploads.splice(hm.index, 1)[0]);
      hm.index = 0;
      return hmShowUpload();
    }
    case "upload-remove":
      hmCapture();
      hm.uploads.splice(hm.index, 1);
      hm.index = Math.max(0, hm.index - 1);
      return hmShowUpload();
    case "marker-remove":
      hmCapture();
      hm.uploads[hm.index].positions.splice(Number(el.dataset.index), 1);
      return hmShowUpload();
    case "edit":
      return hmEdit(id);
    case "reshare":
      return hmReshare(id);
    case "contribute":
      return archiveNew("memory", { photoId: id, title: hm.current.title });
    case "review":
      await hmApi("/" + hm.current.id + "/suggestions", "PATCH", { id, status: el.dataset.status });
      return photoDetail(hm.current.id);
    case "voice":
      return hmVoice(id);
    case "voice-start":
      return hmStartVoice();
    case "voice-stop":
      return hmStopVoice();
    case "wall-filter":
      hm.wallMode = el.dataset.mode;
      return hmWall(personId);
    case "wall-more":
      return hmWall(personId, true);
  }
}
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-hm]");
  if (!el) return;
  e.preventDefault();
  hmHandle(el.dataset.hm, el).catch((e) => toast(e.message));
});
const hmOldBind = window.familyEnhancements.bind;
window.familyEnhancements.bind = function () {
  hmOldBind();
  if (route === "gallery") {
    if (!hm.loaded) hmGalleryLoad();
    const search = $("#hm-search");
    if (search)
      search.oninput = () => {
        query = search.value;
        $("#hm-gallery").innerHTML = hmGalleryMarkup();
        hydrate();
      };
  }
  if (route === "home" && !$("#hm-guide-button")) {
    $(".ff-welcome-actions")?.insertAdjacentHTML(
      "afterbegin",
      hmButton(icon("circle-help"), "guide", 'id="hm-guide-button" aria-label="Kullanım kılavuzu"', "icon-btn"),
    );
    hydrate();
  }
};
const hmOldCleanup = window.familyEnhancements.cleanup;
window.familyEnhancements.cleanup = function () {
  hmOldCleanup();
  hm.items = [];
  hm.loaded = false;
  hm.uploads = [];
  hmStopVoice();
};
if (state) render();
