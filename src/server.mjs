import { startMediaJobs } from "./media-jobs.mjs";
import { eventStream } from "./realtime.mjs";
import { notifications } from "./notifications.mjs";
import { search, warmSearchIndex } from "./search.mjs";
import { hiddenPeople, filterFamilyPayload } from "./privacy.mjs";
import { photoEnhance } from "./photo-enhance.mjs";
import { security, securityGate } from "./security.mjs";
import { backups, makeBackup } from "./backups.mjs";
import { archive, archivePath } from "./archive.mjs";
import { community, communityPath } from "./community.mjs";
import { coreApi } from "./core-api.mjs";
import { log } from "./log.mjs";
import { backupDue } from "./offsite-backup.mjs";
import { createMailer } from "./mail.mjs";
import { createNativePush } from "./native-push.mjs";
import { createVideos, findFfmpeg, streamFile } from "./video.mjs";
import { visiblePhoto } from "./archive.mjs";
import { spawn } from "node:child_process";
import { connect as connectHttp2 } from "node:http2";
import { fileURLToPath } from "node:url";
import { recordError } from "./ops.mjs";
import http from "node:http";
import { readFile, writeFile, mkdir, unlink, readdir, stat, statfs } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { all, one, run, transaction, audit, dataDir } from "./db.mjs";
import { token, hash, passwordHash, passwordVerify, cookie } from "./auth.mjs";
import { assert, clean } from "./domain.mjs";
const argPort = process.argv.indexOf("--port");
const port = Number(process.env.PORT || (argPort >= 0 ? process.argv[argPort + 1] : 3000)),
  origin = process.env.APP_ORIGIN || `http://localhost:${port}`,
  production = process.env.NODE_ENV === "production";
if (production && !origin.startsWith("https://")) throw Error("Production requires HTTPS APP_ORIGIN.");
const publicDir = resolve("public"),
  uploadDir = resolve(dataDir, "uploads");
await mkdir(uploadDir, { recursive: true });
const localStorageAdapter = {
  async put(key, bytes) {
    const file = resolve(uploadDir, key);
    await mkdir(resolve(file, ".."), { recursive: true });
    await writeFile(file, bytes);
  },
  async get(key) {
    try {
      return { body: await readFile(resolve(uploadDir, key)) };
    } catch {
      return null;
    }
  },
  async delete(key) {
    await unlink(resolve(uploadDir, key)).catch(() => {});
  },
};
// Smaller photo copies are made here in the background (MEDIA_JOBS=off disables it, e.g. for tools).
const mediaJobs = process.env.MEDIA_JOBS === "off" ? null : startMediaJobs({ all, one, run, storage: localStorageAdapter });
const mailer = (await createMailer({ all, one, run })).start();
const nativePush = createNativePush(process.env, { http2Connect: connectHttp2 });
// Videos need the file system (chunked upload, streaming); ffmpeg makes playback copies when present.
const videos = process.env.VIDEOS === "off" ? null : createVideos({ all, one, run }, { dataDir, ffmpeg: await findFfmpeg() }).start();
const now = () => new Date().toISOString(),
  publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active });
// Logged as a JSON line and kept in error_log for the admin panel; never with request bodies.
function serverError(event, e, fields = {}) {
  log("error", event, { ...fields, message: e?.message });
  recordError(run, "server", event, e?.message).catch(() => {}); // the log line above is the fallback record
}
const owner = (u) => assert(u.role === "owner", 403, "Bu işlem yalnızca aile yöneticisine açık.");
function limit(key, max = 10, ms = 900000) {
  const item = one("SELECT * FROM throttle WHERE key=?", key);
  if (!item || Number(item.expires) < Date.now()) run("INSERT OR REPLACE INTO throttle VALUES(?,?,?)", key, 1, Date.now() + ms);
  else {
    assert(Number(item.count) < max, 429, "Çok fazla deneme. Lütfen daha sonra tekrar deneyin.");
    run("UPDATE throttle SET count=count+1 WHERE key=?", key);
  }
}
async function body(req, max = 12 * 1024 * 1024) {
  let chunks = [],
    size = 0;
  for await (const c of req) {
    size += c.length;
    assert(size <= max, 413, "Dosya veya istek çok büyük.");
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    assert(false, 400, "İstek biçimi geçersiz.");
  }
}
function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(filterFamilyPayload(data, res.hidden)));
}
// Behind Caddy (compose.yaml sets TRUST_PROXY=1) every connection comes from the proxy, so the
// visitor's address is the last X-Forwarded-For entry, which Caddy itself writes. Without the
// setting the header is ignored, so a visitor cannot choose their own address.
function clientAddress(req) {
  const forwarded =
    process.env.TRUST_PROXY === "1" &&
    String(req.headers["x-forwarded-for"] || "")
      .split(",")
      .pop()
      .trim();
  return forwarded || req.socket.remoteAddress;
}
// Admin panel extras only Node can answer: stored bytes per kind of file (cached for 10 minutes),
// database size and the off-site backup status.
let storageCache = null;
const opsInfo = {
  async storage() {
    if (storageCache && Date.now() - storageCache.at < 600_000) return storageCache.value;
    const byKind = {};
    let total = 0;
    const walk = async (dir, kind) => {
      for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const path = resolve(dir, e.name);
        if (e.isDirectory()) await walk(path, kind || e.name);
        else {
          const size = (await stat(path).catch(() => ({ size: 0 }))).size;
          byKind[kind || "diğer"] = (byKind[kind || "diğer"] || 0) + size;
          total += size;
        }
      }
    };
    await walk(uploadDir, "");
    const disk = await statfs(dataDir).catch(() => null);
    storageCache = { at: Date.now(), value: { total, byKind, diskFree: disk ? disk.bavail * disk.bsize : null } };
    return storageCache.value;
  },
  database: () => {
    const page = one("PRAGMA page_size").page_size,
      pages = one("PRAGMA page_count").page_count;
    return { bytes: Number(page) * Number(pages) };
  },
  async backup() {
    const status = JSON.parse(await readFile(resolve(dataDir, "backup-status.json"), "utf8").catch(() => "{}"));
    return {
      configured: !!process.env.BACKUP_TARGET,
      lastSuccess: status.lastSuccess || null,
      lastFailure: status.lastFailure || null,
      lastError: status.lastError || null,
      failures: status.failures || 0,
    };
  },
};
// A one-hour, single-use reset link; any older unused link for the account stops working.
function createReset(userId) {
  const raw = token();
  run("UPDATE resets SET used=1 WHERE userId=?", userId);
  run("INSERT INTO resets VALUES(?,?,?,0)", hash(raw), userId, Date.now() + 3600000);
  return origin + "/#reset=" + raw;
}
function createSession(res, u) {
  const raw = token(),
    csrf = token();
  run("INSERT INTO sessions VALUES(?,?,?,?)", hash(raw), u.id, csrf, Date.now() + 7 * 86400000);
  res.setHeader("Set-Cookie", `sf_session=${raw}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${production ? "; Secure" : ""}`);
  return { user: publicUser(u), csrf };
}
function authorize(req) {
  const sid = cookie(req.headers.cookie).sf_session;
  const session = sid && one("SELECT * FROM sessions WHERE token=? AND expires>?", hash(sid), Date.now());
  assert(session, 401, "Oturum açmanız gerekiyor.");
  const u = one("SELECT * FROM users WHERE id=? AND active=1", session.userId);
  assert(u, 401, "Hesap kullanılamıyor.");
  if (!["GET", "HEAD"].includes(req.method)) assert(req.headers["x-csrf-token"] === session.csrf, 403, "Oturum doğrulaması başarısız. Sayfayı yenileyin.");
  return { u, session };
}
async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; media-src 'self' blob: data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  if (production) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  try {
    const url = new URL(req.url, origin),
      path = url.pathname,
      method = req.method;
    if (path === "/health") return json(res, 200, { ok: true });
    if (path.startsWith("/api/") && !["GET", "HEAD"].includes(method)) {
      assert(req.headers.origin === origin, 403, "İstek kaynağı doğrulanamadı.");
      // Video chunks are raw bytes; every other write is JSON. Origin and the session's CSRF token are checked for both.
      const chunk = method === "PUT" && /^\/api\/experience\/videos\/uploads\/[\w-]+$/.test(path);
      assert((req.headers["content-type"] || "").startsWith(chunk ? "application/octet-stream" : "application/json"), 415, "JSON içerik gerekiyor.");
    }
    if (path === "/api/login" && method === "POST") {
      limit("login-ip:" + clientAddress(req), 40);
      const b = await body(req, 4096),
        email = clean(b.email).toLowerCase();
      limit("login:" + email, 10);
      const u = one("SELECT * FROM users WHERE email=? AND active=1", email);
      const fallback = "00".repeat(32) + ":" + "00".repeat(64);
      const valid = await passwordVerify(b.password, u?.password || fallback);
      assert(u && valid, 401, "E-posta veya şifre hatalı.");
      audit(u.id, "Giriş yapıldı");
      return json(res, 200, createSession(res, u));
    }
    if (path === "/api/accept-invite" && method === "POST") {
      limit("accept:" + clientAddress(req), 20);
      const b = await body(req, 4096),
        p = await passwordHash(b.password),
        name = clean(b.name, 120);
      assert(name.length > 1, 400, "Ad soyad girin.");
      const u = transaction(() => {
        const invite = one("SELECT * FROM invites WHERE token=? AND used=0 AND expires>?", hash(clean(b.token, 100)), Date.now());
        assert(invite, 400, "Davet geçersiz veya süresi dolmuş.");
        assert(!one("SELECT id FROM users WHERE email=?", invite.email), 409, "Bu e-posta zaten kayıtlı.");
        const id = randomUUID();
        run("INSERT INTO users VALUES(?,?,?,?,?,?,?)", id, name, invite.email, p, invite.role, 1, now());
        run("UPDATE invites SET used=1 WHERE id=?", invite.id);
        audit(id, "Davet kabul edildi");
        return one("SELECT * FROM users WHERE id=?", id);
      });
      return json(res, 201, createSession(res, u));
    }
    // Self-service reset by e-mail. The answer is the same whether or not the address has an account.
    if (path === "/api/forgot-password" && method === "POST") {
      assert(mailer.enabled, 503, "Bu kurulumda e-posta gönderimi açık değil. Aile yöneticinden şifre yenileme bağlantısı iste.");
      limit("forgot-ip:" + clientAddress(req), 10, 3600000);
      const b = await body(req, 2048),
        email = clean(b.email).toLowerCase();
      const user = email && one("SELECT id,email FROM users WHERE email=? AND active=1", email);
      let allowed = true;
      try {
        limit("forgot:" + email, 3, 3600000); // at most three e-mails an hour to one address, silently
      } catch {
        allowed = false;
      }
      if (user && allowed) {
        await mailer.enqueue("reset", String(user.email), String(user.id), { url: createReset(user.id) });
        audit(user.id, "Şifre yenileme e-postası istendi");
      }
      return json(res, 200, { ok: true, message: "Bu adres kayıtlıysa şifre yenileme bağlantısı birkaç dakika içinde e-postana gelir." });
    }
    if (path === "/api/reset-password" && method === "POST") {
      limit("reset:" + clientAddress(req), 15);
      const b = await body(req, 4096),
        p = await passwordHash(b.password);
      transaction(() => {
        const r = one("SELECT * FROM resets WHERE token=? AND used=0 AND expires>?", hash(clean(b.token, 100)), Date.now());
        assert(r, 400, "Bağlantı geçersiz veya süresi dolmuş.");
        run("UPDATE users SET password=? WHERE id=?", p, r.userId);
        run("DELETE FROM sessions WHERE userId=?", r.userId);
        run("UPDATE resets SET used=1 WHERE token=?", r.token);
        audit(r.userId, "Şifre yenilendi");
      });
      return json(res, 200, { ok: true });
    }
    if (path === "/api/config" && method === "GET")
      return json(res, 200, {
        demo: process.env.DEMO_MODE === "1",
        configured: !!one("SELECT id FROM users LIMIT 1"),
        mediaOptimizer: mediaJobs ? "server" : "client",
        operatorName: process.env.SITE_OPERATOR_NAME || null,
        supportEmail: process.env.SUPPORT_EMAIL || null,
        mail: mailer.enabled,
        nativePush: nativePush.available,
        video: videos ? { maxMb: Math.round(videos.limits.bytes / 1048576), maxSeconds: videos.limits.seconds, playbackCopies: videos.ffmpeg } : null,
      });
    if (path.startsWith("/api/") || path.startsWith("/media/") || path.startsWith("/document/") || path.startsWith("/archive-media/")) {
      const { u, session } = authorize(req);
      await securityGate({ u, path, token: req.headers["x-family-factor"] || cookie(req.headers.cookie).sf_factor, one });
      const videoUpload = path.match(/^\/api\/experience\/videos\/uploads(?:\/([\w-]+))?(\/complete)?$/);
      if (videoUpload) {
        assert(videos, 404, "Bu kurulumda video yüklenemez.");
        const [, id, done] = videoUpload;
        if (!id && method === "POST") {
          limit("video-new:" + u.id, 30, 3600000);
          return json(res, 201, await videos.createUpload(u, await body(req, 2000)));
        }
        if (id && !done && method === "GET") return json(res, 200, await videos.uploadState(u, id));
        if (id && !done && method === "PUT") {
          limit("video-chunk:" + u.id, 3000, 3600000);
          const r = await videos.writeChunk(u, id, Number(url.searchParams.get("offset")), req, Number(req.headers["content-length"]));
          return json(res, r.status, r.body);
        }
        if (id && done && method === "POST") return json(res, 201, await videos.complete(u, id, await body(req, 3 * 1024 * 1024)));
        assert(false, 405, "İşlem desteklenmiyor.");
      }
      const videoFile = path.match(/^\/api\/experience\/videos\/([\w-]+)(?:\/(play|poster))?$/);
      if (videoFile && ["GET", "HEAD"].includes(method)) {
        assert(videos, 404, "Video bulunamadı.");
        const helpers = { visiblePhoto };
        if (!videoFile[2]) return json(res, 200, await videos.info(u, videoFile[1], helpers));
        return streamFile(req, res, await videos.file(u, videoFile[1], videoFile[2], helpers));
      }
      if (path === "/api/chat/stream" && method === "GET") {
        const controller = new AbortController();
        res.on("close", () => controller.abort());
        const r = eventStream({
          u,
          one,
          signal: controller.signal,
          authorize: async () => {
            authorize(req);
            await securityGate({ u, path, token: req.headers["x-family-factor"] || cookie(req.headers.cookie).sf_factor, one });
          },
        });
        res.writeHead(r.status, Object.fromEntries(r.headers));
        for await (const chunk of r.body) {
          if (!res.write(chunk))
            await new Promise((resolve) => {
              res.once("drain", resolve);
              res.once("close", resolve);
            });
        }
        return res.end();
      }
      if (path.startsWith("/api/search") && method === "GET") {
        const r = await search({ path, url, u, all, one });
        res.writeHead(r.status, Object.fromEntries(r.headers));
        return res.end(Buffer.from(await r.arrayBuffer()));
      }
      if (communityPath(path) || archivePath(path) || path.startsWith("/api/security/") || path.startsWith("/api/notifications/")) {
        const storage = localStorageAdapter;
        let keyText = process.env.SECURITY_KEY || one("SELECT value FROM settings WHERE key='localSecurityKey'")?.value;
        if (!keyText) {
          keyText = token();
          run("INSERT OR IGNORE INTO settings VALUES(?,?)", "localSecurityKey", keyText);
          keyText = one("SELECT value FROM settings WHERE key='localSecurityKey'").value;
        }
        // Each handler reads only the fields it needs from one shared context.
        /** @type {(ctx: Record<string, any>) => Promise<Response>} */
        const handle = path.startsWith("/api/notifications/")
          ? notifications
          : path === "/api/archive/photo-enhance"
            ? photoEnhance
            : path.startsWith("/api/security/")
              ? security
              : path.startsWith("/api/archive/backups")
                ? backups
                : archivePath(path)
                  ? archive
                  : community;
        const r = await handle({
          defer: (task) => task.catch((e) => serverError("notification.failed", e)),
          apiKey: process.env.OPENAI_API_KEY,
          model: process.env.IMAGE_MODEL || "gpt-image-1.5",
          keyText,
          path,
          method,
          url,
          u,
          read: (max) => body(req, max),
          all,
          one,
          run,
          batch: (items) => transaction(() => items.map(([sql, ...args]) => run(sql, ...args))),
          storage,
          limit,
          mediaJobs,
          opsInfo,
          nativePush,
          videos,
          // Node keeps its own sign-in data; the shared code removes everything else.
          onAccountDeleted: async (id) => {
            transaction(() => {
              run("DELETE FROM sessions WHERE userId=?", id);
              run("DELETE FROM resets WHERE userId=?", id);
              run("UPDATE users SET password=? WHERE id=?", "deleted:" + "0".repeat(128), id);
            });
            await videos?.forgetUser(id);
          },
        });
        res.writeHead(r.status, Object.fromEntries(r.headers));
        return res.end(Buffer.from(await r.arrayBuffer()));
      }
      if (path === "/api/me") return json(res, 200, { user: publicUser(u), csrf: session.csrf });
      if (path === "/api/ops/backup-status" && method === "GET") {
        assert(u.role !== "member", 403, "Bu işlem yöneticiye açık.");
        const status = JSON.parse(await readFile(resolve(dataDir, "backup-status.json"), "utf8").catch(() => "{}"));
        return json(res, 200, {
          configured: !!process.env.BACKUP_TARGET,
          target: (process.env.BACKUP_TARGET || "").startsWith("s3://") ? "s3" : process.env.BACKUP_TARGET ? "folder" : null,
          ...status,
          lastWhere: undefined,
        });
      }
      if (path === "/api/logout" && method === "POST") {
        run("DELETE FROM sessions WHERE token=?", session.token);
        res.setHeader("Set-Cookie", "sf_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
        return json(res, 200, { ok: true });
      }
      res.hidden = await hiddenPeople(all, u);
      if (path === "/api/bootstrap" && method === "GET" && u.role === "owner")
        await makeBackup({ all, run, storage: localStorageAdapter }, true).catch((e) => serverError("backup.first_failed", e));
      // Password reset links exist only with Node's own sign-in.
      if (path === "/api/reset-link" && method === "POST") {
        owner(u);
        const b = await body(req, 4096),
          target = one("SELECT id,email FROM users WHERE id=?", b.userId);
        assert(target, 404, "Üye bulunamadı.");
        const url = createReset(target.id);
        audit(u.id, "Şifre yenileme bağlantısı oluşturuldu", String(target.id));
        const mail = await mailer.enqueue("reset", String(target.email), String(target.id), { url });
        return json(res, 201, { url, mail });
      }
      // Everything else is shared with the Cloudflare runtime.
      const r = await coreApi({
        path,
        method,
        url,
        u,
        res,
        read: (max) => body(req, max),
        json: (status, data) =>
          new Response(JSON.stringify(filterFamilyPayload(data, res.hidden)), {
            status,
            headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
          }),
        all,
        one,
        run,
        batch: async (items) => transaction(() => items.map(([sql, ...args]) => run(sql, ...args))),
        storage: localStorageAdapter,
        limit,
        origin,
        token,
        hash,
        mediaJobs,
        onUserDeactivated: (id) => run("DELETE FROM sessions WHERE userId=?", id),
        onInviteCreated: ({ id, email, role, url, inviter }) => mailer.enqueue("invite", email, id, { url, role, inviter }),
      });
      res.writeHead(r.status, Object.fromEntries(r.headers));
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    assert(method === "GET" || method === "HEAD", 405, "Yöntem desteklenmiyor.");
    // `npm run dev` serves the editable sources in place of the minified copies in public/min/.
    const asset = process.env.DEV_SOURCES === "1" && path.startsWith("/min/") ? path.slice(4) : path;
    const file = resolve(publicDir, "." + decodeURIComponent(asset === "/" ? "/index.html" : asset));
    assert(file.startsWith(publicDir + "/"), 404, "Dosya bulunamadı.");
    const types = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".webp": "image/webp",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".woff2": "font/woff2",
      ".webmanifest": "application/manifest+json",
    };
    const bytes = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": !production ? "no-store" : extname(file) === ".html" ? "no-cache" : "public, max-age=3600",
    });
    res.end(method === "HEAD" ? undefined : bytes);
  } catch (e) {
    if (!res.headersSent)
      json(res, e.status || (e.code === "ENOENT" ? 404 : 500), {
        error: e.status ? e.message : e.code === "ENOENT" ? "Dosya bulunamadı." : "İşlem tamamlanamadı. Lütfen tekrar deneyin.",
      });
    else res.end();
    if (!e.status && e.code !== "ENOENT") serverError("request.failed", e, { path: new URL(req.url, origin).pathname, method: req.method });
  }
}
const server = http.createServer(handler);
server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.listen(port, process.env.HOST || "0.0.0.0", () => console.log(`Sarıçiçek Family: ${origin}`));
setInterval(() => {
  run("DELETE FROM sessions WHERE expires<?", Date.now());
  run("DELETE FROM throttle WHERE expires<?", Date.now());
}, 3600000).unref();

// Runs without a browser visit. Once per UTC day, after 02:00; retries on the next tick.
let backupBusy = false;
setInterval(async () => {
  if (backupBusy || new Date().getUTCHours() < 2 || !one("SELECT id FROM users WHERE role='owner' AND active=1")) return;
  backupBusy = true;
  try {
    await warmSearchIndex({ all, batch: (items) => transaction(() => items.map(([sql, ...args]) => run(sql, ...args))) });
    await makeBackup({ all, run, storage: localStorageAdapter }, true);
  } catch (e) {
    serverError("backup.scheduled_failed", e);
  } finally {
    backupBusy = false;
  }
}, 60000).unref();

// Full encrypted off-site backup (accounts, messages, relations, files) when BACKUP_TARGET is set.
// It runs in a separate process so a large backup never slows requests; that process records its
// own failures and alerts (docs/BACKUP.md).
let offsiteBusy = false;
setInterval(async () => {
  if (offsiteBusy || !process.env.BACKUP_TARGET || new Date().getUTCHours() < 2) return;
  const status = JSON.parse(await readFile(resolve(dataDir, "backup-status.json"), "utf8").catch(() => "{}"));
  if (!backupDue(status)) return;
  offsiteBusy = true;
  const child = spawn(process.execPath, [fileURLToPath(new URL("../scripts/backup.mjs", import.meta.url))], { stdio: "inherit" });
  child.once("exit", () => (offsiteBusy = false));
  child.once("error", (e) => {
    offsiteBusy = false;
    serverError("backup.offsite_start_failed", e);
  });
}, 60000).unref();
