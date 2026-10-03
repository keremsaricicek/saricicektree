"use strict";
/* Video for Hayat and Avlu. A video is kept as an Avlu photo whose image is a cover frame, so albums, tags, privacy
   and Hayat sharing work as for photos. The file itself goes up in 4 MB pieces; a failed piece is resent from where
   the server says it stopped, so "Yeniden dene" never starts over. */
const uiVideoSessions = new WeakMap(); // File -> upload session id, so a retry resumes the same upload
const UI_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

const uiVideoOn = () => !!window.sfConfig?.video && !demoMode;
const uiVideoAccept = () => "image/jpeg,image/png,image/webp" + (uiVideoOn() ? "," + UI_VIDEO_TYPES.join(",") : "");
const uiIsVideo = (file) => !!file && (UI_VIDEO_TYPES.includes(file.type) || /\.(mp4|mov|m4v|webm)$/i.test(file.name || ""));

/** Checks the file against the server's limits and takes a cover frame. Returns { file, seconds, poster }. */
async function uiVideoPrepare(file) {
  const limits = window.sfConfig?.video;
  if (!limits) throw Error("Bu kurulumda video eklenemiyor.");
  const mime = file.type || (/\.mov$/i.test(file.name) ? "video/quicktime" : /\.webm$/i.test(file.name) ? "video/webm" : "video/mp4");
  if (!UI_VIDEO_TYPES.includes(mime)) throw Error("Bu video biçimi desteklenmiyor. MP4, MOV ya da WebM seç.");
  if (file.size > limits.maxMb * 1048576) throw Error(`Video en fazla ${limits.maxMb} MB olabilir.`);
  const url = URL.createObjectURL(file),
    el = document.createElement("video");
  el.muted = true;
  el.playsInline = true;
  el.preload = "auto";
  try {
    // A browser that cannot decode the file (for example some iPhone videos on Windows) still gets a plain cover;
    // the server checks the real length and makes a playable copy.
    const meta = await new Promise((resolve) => {
      el.onloadedmetadata = () => resolve(true);
      el.onerror = () => resolve(false);
      setTimeout(() => resolve(false), 8000);
      el.src = url;
    });
    const seconds = meta && Number.isFinite(el.duration) ? el.duration : null;
    if (seconds && seconds > limits.maxSeconds + 0.5) throw Error(`Video en fazla ${Math.round(limits.maxSeconds / 60)} dakika olabilir.`);
    let poster = null;
    if (meta && el.videoWidth) {
      const seeked = await new Promise((resolve) => {
        el.onseeked = () => resolve(true);
        el.onerror = () => resolve(false);
        setTimeout(() => resolve(false), 5000);
        el.currentTime = Math.min(1, (seconds || 2) / 2);
      });
      if (seeked) poster = uiVideoFrame(el, el.videoWidth, el.videoHeight);
    }
    return { file, mime, seconds: seconds ? Math.round(seconds) : null, poster: poster || uiVideoPlainCover() };
  } finally {
    el.removeAttribute("src");
    el.load();
    URL.revokeObjectURL(url);
  }
}
function uiVideoFrame(source, w, h) {
  const scale = Math.min(1, 1280 / Math.max(w, h)),
    c = document.createElement("canvas");
  c.width = Math.max(2, Math.round(w * scale));
  c.height = Math.max(2, Math.round(h * scale));
  c.getContext("2d").drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}
/** A calm cover in the site's colours when no frame could be read. */
function uiVideoPlainCover() {
  const c = document.createElement("canvas");
  c.width = 1280;
  c.height = 720;
  const g = c.getContext("2d");
  g.fillStyle = "#e7ecd9";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#294c3d";
  g.beginPath();
  g.moveTo(590, 290);
  g.lineTo(590, 430);
  g.lineTo(710, 360);
  g.closePath();
  g.fill();
  return c.toDataURL("image/jpeg", 0.85);
}

/** Sends the file and returns the server's video record. `onProgress(sent, total)` is called after every piece. */
async function uiVideoUpload(prepared, onProgress = () => {}) {
  const { file, mime, poster } = prepared;
  let id = uiVideoSessions.get(file),
    received = 0,
    chunk = 4 * 1024 * 1024;
  if (id) {
    try {
      received = (await api("/api/experience/videos/uploads/" + id)).received;
    } catch {
      id = null; // expired or removed: start a new upload
    }
  }
  if (!id) {
    const s = await api("/api/experience/videos/uploads", "POST", { size: file.size, mime });
    id = s.id;
    chunk = s.chunkSize;
    uiVideoSessions.set(file, id);
  }
  onProgress(received, file.size);
  while (received < file.size) {
    const piece = file.slice(received, Math.min(file.size, received + chunk));
    let res;
    try {
      res = await fetch(`/api/experience/videos/uploads/${id}?offset=${received}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/octet-stream", ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
        body: piece,
      });
    } catch {
      throw Error("Bağlantı koptu. Yeniden denediğinde video kaldığı yerden sürer.");
    }
    const body = await res.json().catch(() => ({}));
    if (res.status === 409 && Number.isFinite(body.received)) received = body.received;
    else if (!res.ok) throw Error((body.error || "Video gönderilemedi.") + " Yeniden denediğinde kaldığı yerden sürer.");
    else received = body.received;
    onProgress(received, file.size);
  }
  const done = await api(`/api/experience/videos/uploads/${id}/complete`, "POST", { poster });
  uiVideoSessions.delete(file);
  return done;
}

/** Progress line shown while a video goes up. */
function uiVideoProgress(sent, total, label = "") {
  const pct = total ? Math.floor((sent / total) * 100) : 0;
  return String(
    html`<div class="ds-video-progress" role="status">
      <progress max="100" value="${pct}" aria-label="Video yükleniyor"></progress><span>${label}Video gönderiliyor · %${pct}</span>
    </div>`,
  );
}

/** Duration label such as 1:05. */
const uiVideoTime = (s) => (s ? uiClock(s) : "");

/** The player for a photo that carries a video. `poster` is the photo's own image. */
function uiVideoPlayer(video, poster, label) {
  if (video.status === "ready")
    return String(
      html`<div class="ds-video" data-video="${video.id}">
        <video
          controls
          playsinline
          preload="none"
          poster="${video.poster || poster}"
          src="${video.play}"
          aria-label="${label || "Video"}${video.seconds ? ", " + uiVideoTime(video.seconds) : ""}"
        ></video>
      </div>`,
    );
  if (video.status === "processing") setTimeout(uiVideoWatch);
  return String(
    html`<div class="ds-video is-${video.status}" data-video="${video.id}" data-video-wait="${video.status === "processing" ? video.id : ""}">
      <img src="${poster}" alt="" loading="lazy" /><span class="ds-video-state" role="status"
        >${video.status === "processing" ? "Video hazırlanıyor. Birkaç dakika içinde izlenebilir." : "Bu video oynatılamadı."}</span
      >
    </div>`,
  );
}
/** Small play badge for tiles and thumbnails. */
function uiVideoBadge(video) {
  return String(html`<span class="ds-video-badge" aria-hidden="true">${raw(icon("play"))}${uiVideoTime(video.seconds)}</span>`);
}

// While a video is being prepared its card asks now and then whether it is ready, and swaps in the player.
let uiVideoPoll = 0;
function uiVideoWatch() {
  if (uiVideoPoll || !$("[data-video-wait]:not([data-video-wait=''])")) return;
  uiVideoPoll = setTimeout(async () => {
    uiVideoPoll = 0;
    const waiting = $$("[data-video-wait]:not([data-video-wait=''])");
    for (const id of new Set(waiting.map((el) => el.dataset.videoWait))) {
      const v = await api("/api/experience/videos/" + id).catch(() => null);
      if (!v || v.status === "processing") continue;
      for (const el of $$(`[data-video-wait="${id}"]`)) el.outerHTML = uiVideoPlayer(v, $("img", el)?.getAttribute("src") || "", "Video");
    }
    uiVideoWatch();
  }, 6000);
}
