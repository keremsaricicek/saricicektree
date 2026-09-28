"use strict";
/* Hayat: voice comments. Record (up to 3 minutes), listen back, delete or send with the comment.
   Uses uiClock from ui/messages.js. The recording is kept per post in memory, so a live update that redraws the card does not lose it,
   and it stays after a failed send so the member can try again. */
const uiVoice = new Map(); // postId -> { state: "recording" | "ready", recorder, stream, started, timer, blob, url, mime, seconds, error }
const UI_VOICE_MAX = 180;
const uiVoiceElapsed = (v) => (Date.now() - v.started) / 1000;

function uiVoiceBar(postId) {
  const v = uiVoice.get(postId);
  if (!v) return "";
  if (v.state === "recording")
    return String(
      html`<div class="ds-voice is-recording" role="group" aria-label="Ses kaydı">
        <span class="ds-voice-dot" aria-hidden="true"></span><span class="ds-voice-time" data-voice-time="${postId}">${uiClock(uiVoiceElapsed(v))}</span>
        <span class="ds-voice-note">Kaydediliyor · en çok 3 dakika</span>
        <button type="button" class="btn small primary" data-ui="voice-stop" data-post="${postId}">Bitir</button>
        <button type="button" class="text-btn" data-ui="voice-cancel" data-post="${postId}">Vazgeç</button>
      </div>`,
    );
  return String(
    html`<div class="ds-voice" role="group" aria-label="Gönderilecek sesli yorum">
      <audio controls preload="metadata" src="${v.url}" aria-label="Kaydını dinle"></audio><span class="ds-voice-time">${uiClock(v.seconds)}</span>
      <button type="button" class="text-btn" data-ui="voice-cancel" data-post="${postId}">Kaydı sil</button>
    </div>`,
  );
}

async function uiVoiceStart(postId) {
  if (uiVoice.get(postId)?.state === "recording") return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw Error("Bu tarayıcı ses kaydını desteklemiyor.");
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    throw Error(
      e.name === "NotAllowedError"
        ? "Mikrofon izni verilmedi. İzni tarayıcının ya da telefonun ayarlarından açabilirsin."
        : "Mikrofon açılamadı. Başka bir uygulama kullanıyor olabilir.",
    );
  }
  uiVoiceClear(postId);
  const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {}),
    chunks = [];
  const v = { state: "recording", recorder, stream, started: Date.now(), cancelled: false, timer: 0 };
  uiVoice.set(postId, v);
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    clearInterval(v.timer);
    stream.getTracks().forEach((t) => t.stop());
    if (v.cancelled) return;
    const type = (recorder.mimeType || mime || "audio/webm").split(";")[0];
    v.blob = new Blob(chunks, { type });
    v.mime = type;
    v.seconds = Math.min(UI_VOICE_MAX, Math.max(1, Math.round(uiVoiceElapsed(v))));
    v.url = URL.createObjectURL(v.blob);
    v.state = "ready";
    uiVoiceRedraw(postId);
    $(`[data-feed-card="${postId}"] .ds-voice audio`)?.focus();
  };
  v.timer = setInterval(() => {
    const t = $(`[data-voice-time="${postId}"]`);
    if (t) t.textContent = uiClock(uiVoiceElapsed(v));
    if (uiVoiceElapsed(v) >= UI_VOICE_MAX) uiVoiceStop(postId);
  }, 500);
  recorder.start();
  uiVoiceRedraw(postId);
  $(`[data-feed-card="${postId}"] [data-ui="voice-stop"]`)?.focus();
}
function uiVoiceStop(postId) {
  const v = uiVoice.get(postId);
  if (v?.state === "recording" && v.recorder.state !== "inactive") v.recorder.stop();
}
function uiVoiceClear(postId) {
  const v = uiVoice.get(postId);
  if (!v) return;
  if (v.state === "recording") {
    v.cancelled = true;
    if (v.recorder.state !== "inactive") v.recorder.stop();
    v.stream.getTracks().forEach((t) => t.stop());
    clearInterval(v.timer);
  }
  if (v.url) URL.revokeObjectURL(v.url);
  uiVoice.delete(postId);
}
function uiVoiceRedraw(postId) {
  const form = $(`[data-feed-card="${postId}"] .ds-comment-form`) || $(`.ds-comment-form[data-post="${postId}"]`);
  if (!form) return;
  form.querySelector(".ds-voice")?.remove();
  form.classList.toggle("has-voice", uiVoice.has(postId));
  form.querySelector(".ds-comment-input")?.insertAdjacentHTML("beforebegin", uiVoiceBar(postId));
  hydrate();
}
/** The recording as the server expects it, or null when there is none ready. */
async function uiVoicePayload(postId) {
  const v = uiVoice.get(postId);
  if (v?.state !== "ready") return null;
  const data = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(Error("Ses kaydı okunamadı."));
    r.readAsDataURL(v.blob);
  });
  return { data, mime: v.mime, seconds: v.seconds, url: v.url };
}
/** Playback for a comment that has a recording. */
function uiCommentVoice(c) {
  if (!c.audio) return "";
  return String(
    html`<div class="ds-voice-comment">
      <audio controls preload="none" src="${c.audio.url}" aria-label="Sesli yorum${c.audio.seconds ? ", " + uiClock(c.audio.seconds) : ""}"></audio>
    </div>`,
  );
}
