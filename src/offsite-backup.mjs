// Full encrypted backups of a Node installation: the SQLite database (every account, message,
// relation and setting) and every stored file, sent to a folder or to S3-compatible storage.
//
// File format (".sfbk"): "SFBK1\n", 16-byte salt, 12-byte IV, then AES-256-GCM ciphertext of a
// gzip stream, then the 16-byte GCM tag. Inside the gzip stream, each file is
//   [4-byte header length][header JSON {path,size}][size bytes][32-byte SHA-256 of the bytes]
// and the stream ends with a header {end:true,files}. The key comes from the passphrase (scrypt).
// Restoring writes into a staging folder and moves it into place only after the tag and every
// checksum verified, so a damaged or tampered backup never leaves a half-restored folder.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt as scryptCb } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, open, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { Readable } from "node:stream";
import { log } from "./log.mjs";

const MAGIC = Buffer.from("SFBK1\n");
/** @returns {Promise<Buffer>} */
const deriveKey = (passphrase, salt) =>
  new Promise((resolve, reject) =>
    scryptCb(String(passphrase), salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, key) => (e ? reject(e) : resolve(key))),
  );

async function* walk(dir, base = dir) {
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path, base);
    else if (entry.isFile()) yield relative(base, path).split(sep).join("/");
  }
}

/** Writes an encrypted backup of dataDir to `outFile`. Returns {files, bytes, sha256}. */
export async function createBackup({ dataDir, outFile, passphrase }) {
  if (!passphrase || String(passphrase).length < 12) throw Error("BACKUP_PASSPHRASE must be at least 12 characters.");
  const staging = await mkdtemp(join(dirname(outFile), ".sfbk-"));
  try {
    // A consistent copy of the live database (WAL included), taken without stopping the server.
    const snapshot = join(staging, "family.sqlite");
    const db = new DatabaseSync(join(dataDir, "family.sqlite"));
    try {
      db.exec("VACUUM INTO '" + snapshot.replaceAll("'", "''") + "'");
    } finally {
      db.close();
    }
    const entries = [{ path: "family.sqlite", file: snapshot }];
    for await (const path of walk(join(dataDir, "uploads"))) entries.push({ path: "uploads/" + path, file: join(dataDir, "uploads", path) });

    const salt = randomBytes(16),
      iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", await deriveKey(passphrase, salt), iv);
    const out = createWriteStream(outFile);
    out.write(Buffer.concat([MAGIC, salt, iv]));
    const gzip = createGzip();
    const done = pipeline(gzip, cipher, out, { end: false });
    const write = (chunk) => (gzip.write(chunk) ? null : new Promise((r) => gzip.once("drain", r)));
    const header = (obj) => {
      const json = Buffer.from(JSON.stringify(obj));
      const len = Buffer.alloc(4);
      len.writeUInt32BE(json.length);
      return Buffer.concat([len, json]);
    };
    for (const e of entries) {
      const { size } = await stat(e.file);
      await write(header({ path: e.path, size }));
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(e.file)) {
        hash.update(chunk);
        await write(chunk);
      }
      await write(hash.digest());
    }
    await write(header({ end: true, files: entries.length }));
    gzip.end();
    await done;
    await new Promise((resolve, reject) => out.end(cipher.getAuthTag(), (e) => (e ? reject(e) : resolve())));
    const sha256 = createHash("sha256");
    for await (const chunk of createReadStream(outFile)) sha256.update(chunk);
    return { files: entries.length, bytes: (await stat(outFile)).size, sha256: sha256.digest("hex") };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/** Restores a backup into `targetDir`, which must be empty or missing. */
export async function restoreBackup({ file, targetDir, passphrase }) {
  const existing = await readdir(targetDir).catch(() => []);
  if (existing.length) throw Error("Geri yükleme hedefi boş olmalı: " + targetDir);
  const { size } = await stat(file);
  const fh = await open(file);
  const head = Buffer.alloc(MAGIC.length + 28),
    tag = Buffer.alloc(16);
  await fh.read(head, 0, head.length, 0);
  await fh.read(tag, 0, 16, size - 16);
  await fh.close();
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw Error("Bu dosya bir Sarıçiçek yedeği değil.");
  const salt = head.subarray(MAGIC.length, MAGIC.length + 16),
    iv = head.subarray(MAGIC.length + 16);
  const decipher = createDecipheriv("aes-256-gcm", await deriveKey(passphrase, salt), iv);
  decipher.setAuthTag(tag);

  // Staging lives inside the target (which may be a mounted volume), so the final move is a rename
  // on the same file system. On failure the target is left as it was: empty, or absent.
  const target = resolve(targetDir);
  const created = !(await stat(target).catch(() => null));
  await mkdir(target, { recursive: true });
  const staging = await mkdtemp(join(target, ".restore-"));
  let files = 0,
    ended = false;
  try {
    // Parser for the record stream; writes each file into staging and checks its SHA-256.
    let buf = Buffer.alloc(0),
      current = null;
    const parse = async function* (source) {
      for await (const chunk of source) {
        buf = Buffer.concat([buf, chunk]);
        for (;;) {
          if (!current) {
            if (buf.length < 4) break;
            const len = buf.readUInt32BE(0);
            if (buf.length < 4 + len) break;
            const h = JSON.parse(buf.subarray(4, 4 + len).toString());
            buf = buf.subarray(4 + len);
            if (h.end) {
              if (h.files !== files) throw Error("Yedekteki dosya sayısı tutmuyor.");
              ended = true;
              continue;
            }
            const path = resolve(staging, h.path);
            if (!path.startsWith(staging + sep) || h.path.includes("..")) throw Error("Yedekte geçersiz dosya yolu.");
            await mkdir(dirname(path), { recursive: true });
            current = { left: h.size, hash: createHash("sha256"), out: createWriteStream(path), path: h.path };
          }
          if (current.left > 0) {
            if (!buf.length) break;
            const part = buf.subarray(0, current.left);
            buf = buf.subarray(part.length);
            current.left -= part.length;
            current.hash.update(part);
            if (!current.out.write(part)) await new Promise((r) => current.out.once("drain", r));
            continue;
          }
          if (buf.length < 32) break;
          const expected = buf.subarray(0, 32);
          buf = buf.subarray(32);
          await new Promise((r, j) => current.out.end((e) => (e ? j(e) : r())));
          if (!current.hash.digest().equals(expected)) throw Error("Yedekteki dosya bozuk: " + current.path);
          files++;
          current = null;
        }
      }
      yield Buffer.alloc(0);
    };
    await pipeline(createReadStream(file, { start: head.length, end: size - 17 }), decipher, createGunzip(), parse, async (s) => {
      for await (const _ of s) void _;
    });
    if (!ended || current) throw Error("Yedek dosyası eksik.");
    for (const entry of await readdir(staging)) await rename(join(staging, entry), join(target, entry));
    await rm(staging, { recursive: true, force: true });
    return { files };
  } catch (e) {
    await rm(staging, { recursive: true, force: true });
    if (created) await rm(target, { recursive: true, force: true });
    // Our own checks explain themselves; anything from decryption or decompression means a wrong
    // passphrase or a changed/damaged file (the stream chain may surface it only as "aborted").
    if (/^Yedek/.test(e.message)) throw e;
    throw Error("Yedek çözülemedi: parola yanlış ya da dosya değiştirilmiş veya eksik (" + (e.code || e.message) + ").");
  }
}

// ---- Destinations ----

/** S3 Signature Version 4 headers for a request (no SDK). */
export function signS3({ method, url, headers = {}, payloadHash, accessKeyId, secretAccessKey, region, date = new Date() }) {
  const u = new URL(url);
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, ""),
    day = amzDate.slice(0, 8);
  const all = { ...headers, host: u.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  const names = Object.keys(all)
    .map((k) => k.toLowerCase())
    .sort();
  const lower = Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const encode = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  const canonicalPath = u.pathname
    .split("/")
    .map((p) => encode(decodeURIComponent(p)))
    .join("/");
  const query = [...u.searchParams]
    .map(([k, v]) => [encode(k), encode(v)])
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => k + "=" + v)
    .join("&");
  const canonical = [method, canonicalPath, query, names.map((n) => n + ":" + lower[n] + "\n").join(""), names.join(";"), payloadHash].join("\n");
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, createHash("sha256").update(canonical).digest("hex")].join("\n");
  const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
  const signingKey = hmac(hmac(hmac(hmac("AWS4" + secretAccessKey, day), region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(toSign).digest("hex");
  return {
    ...Object.fromEntries(Object.entries(all).filter(([k]) => k !== "host")),
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
  };
}

/** Sends a finished backup file to BACKUP_TARGET: a folder path or s3://bucket/prefix. */
export async function sendBackup(file, sha256, env = process.env) {
  const target = env.BACKUP_TARGET || "";
  const name = basename(file);
  if (target.startsWith("s3://")) {
    const [bucket, ...prefix] = target.slice(5).split("/");
    const key = [...prefix.filter(Boolean), name].join("/");
    const endpoint = (env.BACKUP_S3_ENDPOINT || `https://s3.${env.BACKUP_S3_REGION || "us-east-1"}.amazonaws.com`).replace(/\/$/, "");
    const url = `${endpoint}/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
    const { size } = await stat(file);
    const creds = { accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID, secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY, region: env.BACKUP_S3_REGION || "us-east-1" };
    if (!creds.accessKeyId || !creds.secretAccessKey) throw Error("BACKUP_S3_ACCESS_KEY_ID and BACKUP_S3_SECRET_ACCESS_KEY are required for an s3:// target.");
    const headers = signS3({ method: "PUT", url, headers: { "content-length": size }, payloadHash: sha256, ...creds });
    // Streamed upload; `duplex` is required by Node's fetch for a stream body (not yet in the DOM types).
    const upload = /** @type {RequestInit} */ ({ method: "PUT", headers, body: Readable.toWeb(createReadStream(file)), duplex: "half" });
    const res = await fetch(url, upload);
    if (!res.ok) throw Error(`S3 upload failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const check = await fetch(url, {
      method: "HEAD",
      headers: signS3({ method: "HEAD", url, payloadHash: createHash("sha256").update("").digest("hex"), ...creds }),
    });
    if (!check.ok || Number(check.headers.get("content-length")) !== size) throw Error("S3 upload could not be verified (HEAD " + check.status + ").");
    return { where: `s3://${bucket}/${key}` };
  }
  if (!target) throw Error("BACKUP_TARGET is not set.");
  const dir = resolve(target);
  await mkdir(dir, { recursive: true });
  const dest = join(dir, name);
  await pipeline(createReadStream(file), createWriteStream(dest + ".part"));
  await rename(dest + ".part", dest);
  // Keep the newest BACKUP_KEEP backups in the folder (S3: use a bucket lifecycle rule instead).
  const keep = Math.max(1, Number(env.BACKUP_KEEP || 14));
  const old = (await readdir(dir)).filter((f) => /^saricicek-.*\.sfbk$/.test(f)).sort();
  for (const f of old.slice(0, Math.max(0, old.length - keep))) await unlink(join(dir, f));
  return { where: dest };
}

/** Creates, sends and verifies one backup; the local temporary copy is always removed. */
export async function runOffsiteBackup({ dataDir, env = process.env, now = new Date() }) {
  const name = "saricicek-" + now.toISOString().replace(/[:.]/g, "-") + ".sfbk";
  const tmpDir = await mkdtemp(join(dataDir, ".backup-"));
  const file = join(tmpDir, name);
  try {
    const made = await createBackup({ dataDir, outFile: file, passphrase: env.BACKUP_PASSPHRASE });
    const sent = await sendBackup(file, made.sha256, env);
    return { ...made, ...sent, name };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Runs a backup and records the outcome in DATA_DIR/backup-status.json. A failure is logged,
 * passed to `record` (the admin panel's error list) and, when BACKUP_ALERT_URL is set, posted there
 * as {"text": "..."} (works with ntfy, Slack-style and most chat webhooks).
 */
export async function backupWithAlerts({ dataDir, env = process.env, record = null, now = new Date() }) {
  const statusFile = join(dataDir, "backup-status.json");
  const status = JSON.parse(await readFile(statusFile, "utf8").catch(() => "{}"));
  try {
    const r = await runOffsiteBackup({ dataDir, env, now });
    Object.assign(status, { lastSuccess: now.toISOString(), lastWhere: r.where, lastBytes: r.bytes, lastFiles: r.files, lastError: null, failures: 0 });
    log("info", "backup.offsite_ok", { files: r.files, bytes: r.bytes });
    return r;
  } catch (e) {
    Object.assign(status, { lastFailure: now.toISOString(), lastError: String(e.message).slice(0, 300), failures: (status.failures || 0) + 1 });
    log("error", "backup.offsite_failed", { message: e.message });
    await record?.(e);
    if (env.BACKUP_ALERT_URL)
      await fetch(env.BACKUP_ALERT_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Sarıçiçek Konağı yedeği alınamadı: " + String(e.message).slice(0, 300) }),
        signal: AbortSignal.timeout(10000),
      }).catch((alertError) => log("error", "backup.alert_failed", { message: alertError.message }));
    throw e;
  } finally {
    await writeFile(statusFile, JSON.stringify(status, null, 2));
  }
}

/** Whether the daily job should run now: once per UTC day, retried hourly after a failure. */
export function backupDue(status, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  if (status.lastSuccess?.slice(0, 10) === today) return false;
  return !status.lastFailure || now.getTime() - Date.parse(status.lastFailure) >= 3600_000;
}
