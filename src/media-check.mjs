// Upload checks shared by the Node server and the Cloudflare Worker.
// Images are identified by their real structure, not by the name or MIME type the browser
// sends, and their pixel size is read from the file itself.
import { assert } from "./domain.mjs";

export const MAX_IMAGE_SIDE = 12000;
export const MAX_IMAGE_PIXELS = 60_000_000;

/** Decodes a data URL or bare base64 string; rejects anything that is not base64 or too large. */
export function decodeUpload(data, maxBytes, what = "Dosya") {
  let bytes;
  try {
    bytes = Uint8Array.from(
      atob(
        String(data || "")
          .split(",")
          .pop(),
      ),
      (c) => c.charCodeAt(0),
    );
  } catch {
    assert(false, 400, `${what} okunamadı.`);
  }
  assert(bytes.length > 0, 400, `${what} boş.`);
  assert(bytes.length <= maxBytes, 413, `${what} en fazla ${Math.round(maxBytes / 1024 / 1024)} MB olabilir.`);
  return bytes;
}

const ascii = (b, from, to) => String.fromCharCode(...b.subarray(from, to));
const u16be = (b, i) => (b[i] << 8) | b[i + 1];
const u32be = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const u32le = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const u24le = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

function png(b) {
  if (b.length < 45 || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)) return null;
  // First chunk must be a 13-byte IHDR; walk the chunks up to IEND so a cut-off file is refused.
  if (u32be(b, 8) !== 13 || ascii(b, 12, 16) !== "IHDR") return null;
  const width = u32be(b, 16),
    height = u32be(b, 20);
  let i = 8;
  while (i + 12 <= b.length) {
    const len = u32be(b, i),
      type = ascii(b, i + 4, i + 8);
    if (i + 12 + len > b.length) return null;
    if (type === "IEND") return { mime: "image/png", width, height };
    i += 12 + len;
  }
  return null;
}

function jpeg(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2,
    size = null;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xd9) break;
    if (marker === 0xda) {
      // Entropy-coded data follows; the file must still finish with an end-of-image marker.
      for (let j = b.length - 2; j > i; j--) if (b[j] === 0xff && b[j + 1] === 0xd9) return size ? { mime: "image/jpeg", ...size } : null;
      return null;
    }
    if (marker === 0xff) {
      i++;
      continue;
    }
    const len = u16be(b, i + 2);
    if (len < 2 || i + 2 + len > b.length) return null;
    const sof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (sof && len >= 7) size = { height: u16be(b, i + 5), width: u16be(b, i + 7) };
    i += 2 + len;
  }
  return null;
}

function webp(b) {
  if (b.length < 30 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 12) !== "WEBP") return null;
  const riff = u32le(b, 4) + 8;
  if (riff !== b.length && riff + 1 !== b.length) return null; // declared size must match the file
  const chunk = ascii(b, 12, 16);
  if (chunk === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a)
    return { mime: "image/webp", width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
  if (chunk === "VP8L" && b[20] === 0x2f) {
    const bits = u32le(b, 21);
    return { mime: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") return { mime: "image/webp", width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  return null;
}

/**
 * Returns {mime, width, height} for a well-formed JPEG, PNG or WebP within the size limits.
 * `types` narrows the accepted formats (e.g. only JPEG/WebP for smaller copies).
 */
export function inspectImage(bytes, types = ["image/jpeg", "image/png", "image/webp"]) {
  const info = jpeg(bytes) || png(bytes) || webp(bytes);
  assert(info && types.includes(info.mime), 400, "Dosya geçerli bir " + types.map((t) => t.split("/")[1].toUpperCase()).join(", ") + " görseli değil.");
  assert(info.width > 0 && info.height > 0, 400, "Görselin ölçüleri okunamadı.");
  assert(
    info.width <= MAX_IMAGE_SIDE && info.height <= MAX_IMAGE_SIDE && info.width * info.height <= MAX_IMAGE_PIXELS,
    400,
    "Görsel çok büyük; en fazla 12.000 piksel kenar ve 60 megapiksel olabilir.",
  );
  return info;
}

/** Reads a stored file (Node buffer or R2 object) into bytes. */
export async function storedBytes(file) {
  if (!file) return null;
  const body = file.body ?? file;
  if (body instanceof Uint8Array) return body;
  if (typeof file.arrayBuffer === "function") return new Uint8Array(await file.arrayBuffer());
  return new Uint8Array(await new Response(body).arrayBuffer());
}

/**
 * Audio type from the file's own signature. MP4 and WebM containers also carry video, so for those
 * the browser's declared type decides between audio and video (the container is still checked).
 */
export function sniffAudio(bytes, declared = "") {
  const head = ascii(bytes, 0, 12);
  if (head.startsWith("OggS")) return "audio/ogg";
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WAVE") return "audio/wav";
  if (head.startsWith("ID3") || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (head.slice(4, 8) === "ftyp" && String(declared).startsWith("audio/mp4")) return "audio/mp4";
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3 && String(declared).startsWith("audio/webm")) return "audio/webm";
  return null;
}

/** A photo (checked like any image upload) or a voice recording, for message attachments. */
export function inspectAttachment(bytes, declared) {
  const isImage =
    (bytes[0] === 0xff && bytes[1] === 0xd8) || (bytes[0] === 0x89 && bytes[1] === 0x50) || (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP");
  if (isImage) return inspectImage(bytes).mime;
  const audio = sniffAudio(bytes, declared);
  assert(audio, 400, "Fotoğraf veya ses dosyası seç.");
  return audio;
}
