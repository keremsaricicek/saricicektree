/* ui/messages.js: Messages: window chrome, send state and retry, attachments, voice.
   Loaded in order after the older scripts; see index.html. */
"use strict";

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
    const audio = $("audio", m);
    if (audio) uiVoicePlayer(audio);
  }
  uiDmPendingBubble(w);
  hydrate();
}

/* ---------- Messages: send state, retry, attachments, voice ---------- */
const uiClock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
function uiDmPendingBubble(w) {
  const log = $(".dm-log", w.el);
  if (!log) return;
  $(".ds-dm-pending", log)?.remove();
  const p = w.pending;
  if (!p) return;
  log.querySelector(".dm-empty")?.remove();
  const failed = p.state === "failed";
  log.insertAdjacentHTML(
    "beforeend",
    String(
      html`<article class="dm-message mine ds-dm-pending ${failed ? "is-failed" : ""}" aria-live="polite">
        ${p.preview ? html`<img src="${p.preview}" alt="Gönderilen fotoğraf" />` : ""}${p.voice ? html`<p class="ds-dm-voice-note">${raw(icon("mic"))} Sesli mesaj · ${uiClock(p.voice)}</p>` : ""}${p.body ? html`<p>${p.body}</p>` : ""}
        <footer>
          ${
            failed
              ? html`<span class="ds-dm-status is-failed">${raw(icon("circle-alert"))} Gönderilemedi</span
                  ><button type="button" class="ds-dm-retry" data-ui="dm-retry" data-key="${w.key}">Yeniden dene</button>`
              : html`<span class="ds-dm-status is-sending">${raw(icon("clock-3"))}<span class="sr-only">Gönderiliyor</span></span
                  ><time>Gönderiliyor…</time>`
          }
        </footer>
      </article>`,
    ),
  );
  hydrate();
  log.scrollTop = log.scrollHeight;
}
const uiBaseDmSend = dmSend;
dmSend = async function (w) {
  if (w.sending || w.recording) return;
  const field = w.el.querySelector("textarea"),
    body = field.value.trim();
  if (!body && !w.file) return;
  if (w.pending?.preview && w.pending.previewFile !== w.file) URL.revokeObjectURL(w.pending.preview);
  const preview =
    w.pending && w.file && w.pending.previewFile === w.file ? w.pending.preview : w.file?.type.startsWith("image/") ? URL.createObjectURL(w.file) : null;
  w.pending = { state: "sending", body, preview, previewFile: w.file, voice: w.file?.type.startsWith("audio") ? w.voiceSeconds || 0 : 0 };
  uiDmPendingBubble(w);
  // Marks the attempt so a failure before the base sender signs it still counts as failed.
  if (!w.retrySignature) w.retrySignature = "attempt";
  await uiBaseDmSend(w);
  // The base sender clears the field only after the server accepted the message.
  const sent = !w.retrySignature;
  if (sent) {
    if (w.pending?.preview) URL.revokeObjectURL(w.pending.preview);
    w.pending = null;
    w.voiceSeconds = 0;
    $(".ds-dm-pending", w.el)?.remove();
  } else {
    w.pending.state = "failed";
    const status = $(".dm-status", w.el);
    if (status && !navigator.onLine) status.textContent = "Bağlantı yok. Mesajın korunuyor; bağlantı gelince yeniden dene.";
    else if (status && /fetch|network/i.test(status.textContent)) status.textContent = "Sunucuya ulaşılamadı. Mesajın korunuyor; yeniden dene.";
    uiDmPendingBubble(w);
  }
};
/* Attachment preview before sending */
const uiBaseDmContext = dmContext;
dmContext = function (w) {
  uiBaseDmContext(w);
  const box = $(".dm-context", w.el);
  if (!box || !w.file) return;
  const row = [...box.children].find((d) => d.querySelector('[data-ex="cancel-file"]'));
  if (!row) return;
  if (w.file.type.startsWith("image/")) {
    const url = URL.createObjectURL(w.file);
    row.classList.add("ds-attach");
    row.insertAdjacentHTML("afterbegin", `<img src="${url}" alt="Eklenecek fotoğraf">`);
    row.querySelector("img").onload = () => setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else if (w.file.type.startsWith("audio")) {
    row.classList.add("ds-attach", "is-voice");
    const url = URL.createObjectURL(w.file);
    row.insertAdjacentHTML("afterbegin", `<audio src="${url}" preload="metadata"></audio>`);
    uiVoicePlayer(row.querySelector("audio"));
  }
};
/* Voice player: play/pause, elapsed/total time and bars drawn from the real audio. */
const uiWaveCache = new Map();
async function uiWavePeaks(src, bars = 36) {
  if (uiWaveCache.has(src)) return uiWaveCache.get(src);
  const job = (async () => {
    const buf = await (await fetch(src, { credentials: "same-origin" })).arrayBuffer(),
      Ctx = window.AudioContext || window.webkitAudioContext,
      ctx = new Ctx(),
      audio = await ctx.decodeAudioData(buf);
    ctx.close?.();
    const data = audio.getChannelData(0),
      step = Math.max(1, Math.floor(data.length / bars)),
      peaks = [];
    for (let i = 0; i < bars; i++) {
      let sum = 0;
      for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j++) sum += data[j] * data[j];
      peaks.push(Math.sqrt(sum / step));
    }
    const max = Math.max(...peaks, 0.001);
    return { peaks: peaks.map((x) => x / max), duration: audio.duration };
  })();
  uiWaveCache.set(src, job);
  job.catch(() => uiWaveCache.delete(src));
  return job;
}
function uiDrawWave(canvas, peaks, progress) {
  const dpr = devicePixelRatio || 1,
    w = canvas.clientWidth || 150,
    h = canvas.clientHeight || 28;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d"),
    styles = getComputedStyle(canvas),
    // Resolve token colours (including color-mix) to plain rgb for the canvas.
    resolve = (v, fb) => {
      if (!v) return fb;
      const keep = canvas.style.color;
      canvas.style.color = v;
      const c = getComputedStyle(canvas).color;
      canvas.style.color = keep;
      return c || fb;
    },
    on = resolve(styles.getPropertyValue("--wave-on").trim(), "#2d4a35"),
    off = resolve(styles.getPropertyValue("--wave-off").trim(), "#c9c2b0"),
    n = peaks.length,
    bw = (w / n) * 0.6;
  ctx.scale(dpr, dpr);
  peaks.forEach((v, i) => {
    const bh = Math.max(3, v * (h - 4)),
      x = (i + 0.2) * (w / n);
    ctx.fillStyle = i / n < progress ? on : off;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, (h - bh) / 2, bw, bh, bw / 2) : ctx.rect(x, (h - bh) / 2, bw, bh);
    ctx.fill();
  });
}
function uiVoicePlayer(audio) {
  if (!audio || audio.dataset.ds) return;
  audio.dataset.ds = "1";
  audio.removeAttribute("controls");
  audio.preload = "metadata";
  audio.insertAdjacentHTML(
    "afterend",
    `<div class="ds-voice"><button type="button" class="ds-voice-play" aria-label="Sesli mesajı oynat">${icon("play")}</button><canvas class="ds-voice-wave" aria-hidden="true"></canvas><span class="ds-voice-time">0:00</span></div>`,
  );
  const box = audio.nextElementSibling,
    btn = $(".ds-voice-play", box),
    canvas = $("canvas", box),
    time = $(".ds-voice-time", box);
  let peaks = Array.from({ length: 36 }, () => 0.25),
    total = 0;
  const draw = () => uiDrawWave(canvas, peaks, total ? audio.currentTime / total : 0);
  const setTime = () => (time.textContent = audio.paused || !audio.currentTime ? uiClock(total) : uiClock(audio.currentTime));
  requestAnimationFrame(draw);
  uiWavePeaks(audio.src)
    .then((r) => {
      peaks = r.peaks;
      total = r.duration;
      setTime();
      draw();
    })
    .catch(() => {
      audio.addEventListener("loadedmetadata", () => {
        if (Number.isFinite(audio.duration)) total = audio.duration;
        setTime();
      });
    });
  btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (audio.paused) {
      $$("audio").forEach((a) => a !== audio && a.pause());
      audio.play().catch(() => toast("Ses oynatılamadı."));
    } else audio.pause();
  };
  audio.addEventListener("play", () => {
    btn.innerHTML = icon("pause");
    btn.setAttribute("aria-label", "Duraklat");
    box.classList.add("is-playing");
    hydrate();
  });
  audio.addEventListener("pause", () => {
    btn.innerHTML = icon("play");
    btn.setAttribute("aria-label", "Sesli mesajı oynat");
    box.classList.remove("is-playing");
    setTime();
    hydrate();
  });
  audio.addEventListener("timeupdate", () => {
    setTime();
    draw();
  });
  audio.addEventListener("ended", () => {
    audio.currentTime = 0;
    draw();
  });
  hydrate();
}
/* Recording: elapsed time and a live level meter from the microphone. */
const uiBaseDmRecord = dmRecord;
dmRecord = async function (w) {
  const wasRecording = !!w.recording;
  await uiBaseDmRecord(w);
  if (wasRecording || !w.recording) return;
  const compose = $(".dm-compose", w.el);
  compose.classList.add("is-recording");
  compose.insertAdjacentHTML(
    "afterbegin",
    `<div class="ds-rec" role="status"><i class="ds-rec-dot"></i><span class="ds-rec-time">0:00</span><canvas aria-hidden="true"></canvas><small>Bitirmek için mikrofona dokun</small></div>`,
  );
  const rec = $(".ds-rec", compose),
    canvas = $("canvas", rec),
    start = performance.now(),
    levels = Array.from({ length: 28 }, () => 0);
  let ctx, analyser;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(w.stream).connect(analyser);
  } catch {
    /* no audio analysis in this browser: the recording works, only the level bars stay still */
  }
  const buf = new Uint8Array(128);
  const tick = () => {
    if (!w.recording) {
      w.voiceSeconds = (performance.now() - start) / 1000;
      rec.remove();
      compose.classList.remove("is-recording");
      ctx?.close?.();
      return;
    }
    $(".ds-rec-time", rec).textContent = uiClock((performance.now() - start) / 1000);
    if (analyser) {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
      levels.push(Math.min(1, peak * 2.2));
      levels.shift();
      uiDrawWave(canvas, levels, 1);
    }
    requestAnimationFrame(tick);
  };
  tick();
};

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
  if (!uiWantsStream()) ui.stream?.abort();
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
