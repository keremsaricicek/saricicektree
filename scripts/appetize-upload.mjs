// Uploads the demo app builds to Appetize (a phone simulator in the browser) and prints the links.
//   APPETIZE_API_TOKEN=… node scripts/appetize-upload.mjs android Saricicek-Android-demo.apk
//   APPETIZE_API_TOKEN=… node scripts/appetize-upload.mjs ios Saricicek-iOS-Simulator-demo.zip
// Needs an Appetize account and its API token (Appetize → Account → API token). With APPETIZE_ANDROID_KEY or
// APPETIZE_IOS_KEY (the app's public key from a first upload) the same app is updated, so its link stays the same.
// Only the demo builds belong there: they carry sample data and never contact the family site.
import { openAsBlob } from "node:fs";
import { basename } from "node:path";

export async function upload({ platform, file, token, key, base = "https://api.appetize.io", fetch = globalThis.fetch }) {
  if (!["android", "ios"].includes(platform)) throw Error("Platform android ya da ios olmalı.");
  if (!token) throw Error("APPETIZE_API_TOKEN verilmedi; Appetize hesabındaki API anahtarı gerekir.");
  const form = new FormData();
  form.set("file", await openAsBlob(file), basename(file));
  form.set("platform", platform);
  form.set("note", "Sarıçiçek deneme sürümü (örnek veri)");
  const res = await fetch(`${base}/v1/apps${key ? "/" + encodeURIComponent(key) : ""}`, { method: "POST", headers: { "X-API-KEY": token }, body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Error(`Appetize yüklemesi başarısız (${res.status}): ${body.message || body.error || "yanıt yok"}`);
  return { publicKey: body.publicKey, url: body.publicURL || `https://appetize.io/app/${body.publicKey}` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [platform, file] = process.argv.slice(2);
  const key = platform === "android" ? process.env.APPETIZE_ANDROID_KEY : process.env.APPETIZE_IOS_KEY;
  const r = await upload({ platform, file, token: process.env.APPETIZE_API_TOKEN, key, base: process.env.APPETIZE_BASE_URL });
  console.log(`${platform}: ${r.url} (public key ${r.publicKey})`);
}
