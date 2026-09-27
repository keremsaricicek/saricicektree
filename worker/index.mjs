import { eventStream } from "../src/realtime.mjs";
import { notifications } from "../src/notifications.mjs";
import { search, warmSearchIndex } from "../src/search.mjs";
import { hiddenPeople, filterFamilyPayload } from "../src/privacy.mjs";
import { photoEnhance } from "../src/photo-enhance.mjs";
import { security, securityGate } from "../src/security.mjs";
import { backups, makeBackup } from "../src/backups.mjs";
import { archive, archivePath } from "../src/archive.mjs";
import { assert, clean } from "../src/domain.mjs";
import { community, communityPath } from "../src/community.mjs";
import { coreApi } from "../src/core-api.mjs";
import { createNativePush } from "../src/native-push.mjs";
import { log } from "../src/log.mjs";
import { recordError } from "../src/ops.mjs";
import { assets } from "./assets.mjs";
const hex = (bytes) => Array.from(new Uint8Array(bytes), (v) => v.toString(16).padStart(2, "0")).join("");
const from64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const now = () => new Date().toISOString(),
  randomUUID = () => crypto.randomUUID();
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) => v.toString(16).padStart(2, "0")).join("");
const hash = async (v) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active });
function concat(chunks, length) {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}
async function body(req, max = 12 * 1024 * 1024) {
  assert(Number(req.headers.get("content-length") || 0) <= max, 413, "Dosya veya istek çok büyük.");
  const reader = req.body?.getReader();
  let chunks = [],
    length = 0;
  if (reader)
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > max) {
        await reader.cancel();
        assert(false, 413, "Dosya veya istek çok büyük.");
      }
      chunks.push(value);
    }
  try {
    return JSON.parse(new TextDecoder().decode(concat(chunks, length)) || "{}");
  } catch {
    assert(false, 400, "İstek biçimi geçersiz.");
  }
}
const headers = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; media-src 'self' blob: data:; base-uri 'none'; form-action 'self'",
};
function json(_res, status, data) {
  return new Response(JSON.stringify(filterFamilyPayload(data, _res?.hidden)), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
// Logged as a JSON line and kept in error_log for the admin panel; never with request bodies.
async function serverError(run, event, e, fields = {}) {
  log("error", event, { ...fields, message: e?.message });
  if (run) await recordError(run, "server", event, e?.message).catch(() => {}); // the log line above is the fallback record
}
export default {
  async fetch(req, env, ctx) {
    const res = {},
      url = new URL(req.url),
      origin = url.origin,
      path = url.pathname,
      method = req.method;
    try {
      if (path === "/health") return json(res, 200, { ok: true, storage: "D1/R2" });
      if (path === "/api/config")
        return json(res, 200, {
          demo: false,
          configured: true,
          auth: "chatgpt",
          mediaOptimizer: "client",
          operatorName: env.SITE_OPERATOR_NAME || null,
          supportEmail: env.SUPPORT_EMAIL || null,
          nativePush: createNativePush(env).available,
        });
      if (!path.startsWith("/api/") && !path.startsWith("/media/") && !path.startsWith("/document/") && !path.startsWith("/archive-media/")) {
        assert(["GET", "HEAD"].includes(method), 405, "Yöntem desteklenmiyor.");
        const asset = assets[path === "/" ? "/index.html" : path];
        assert(asset, 404, "Dosya bulunamadı.");
        return new Response(method === "HEAD" ? null : from64(asset.data), { headers: { ...headers, "Content-Type": asset.type } });
      }
      assert(env.DB && env.BUCKET, 503, "Arşiv bağlantısı şu anda kullanılamıyor.");
      const stmt = (sql, ...args) => env.DB.prepare(sql).bind(...args),
        all = async (sql, ...args) => (await stmt(sql, ...args).all()).results,
        one = (sql, ...args) => stmt(sql, ...args).first(),
        run = (sql, ...args) => stmt(sql, ...args).run();
      const batch = (items) => env.DB.batch(items.map(([sql, ...args]) => stmt(sql, ...args)));
      const audit = (uid, action, id = "") => run("INSERT INTO audit(userId,action,entityId,createdAt) VALUES(?,?,?,?)", uid, action, id, now());

      const limit = async (key, max = 10, ms = 900000) => {
        const result = await stmt(
          "INSERT INTO throttle(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END RETURNING count",
          key,
          Date.now() + ms,
          Date.now(),
          Date.now(),
        ).first();
        assert(result.count <= max, 429, "Çok fazla deneme. Lütfen daha sonra tekrar deneyin.");
      };
      const authId = req.headers.get("oai-authenticated-user-id"),
        email = clean(req.headers.get("oai-authenticated-user-email")).toLowerCase();
      assert(authId && email, 401, "Oturum açmanız gerekiyor.");
      assert(env.CSRF_SECRET, 503, "Oturum doğrulaması yapılandırılmamış.");
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.CSRF_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const csrf = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(authId + "|" + origin)));
      if (!["GET", "HEAD"].includes(method)) {
        assert(req.headers.get("origin") === origin, 403, "İstek kaynağı doğrulanamadı.");
        assert(req.headers.get("content-type")?.startsWith("application/json"), 415, "JSON içerik gerekiyor.");
        assert(req.headers.get("x-csrf-token") === csrf, 403, "Oturum doğrulaması başarısız. Sayfayı yenileyin.");
      }
      let u = await one("SELECT * FROM users WHERE authId=?", authId);
      if (!u && email === env.OWNER_EMAIL?.toLowerCase()) {
        await run(
          "INSERT OR IGNORE INTO users(id,name,email,authId,role,active,createdAt) SELECT ?,?,?,?,'owner',1,? WHERE NOT EXISTS(SELECT 1 FROM users WHERE role='owner')",
          randomUUID(),
          "Kerem Sarıçiçek",
          email,
          authId,
          now(),
        );
        u = await one("SELECT * FROM users WHERE authId=?", authId);
      }
      if (path === "/api/me" && method === "GET") return json(res, 200, { user: u?.active ? publicUser(u) : null, csrf });
      if (path === "/api/accept-invite" && method === "POST") {
        assert(!u, 409, "Bu hesap zaten kayıtlı.");
        const b = await body(req, 4096),
          name = clean(b.name, 120);
        assert(name.length >= 2, 400, "Ad soyad girin.");
        const digest = await hash(clean(b.token, 100)),
          id = randomUUID(),
          time = Date.now();
        await batch([
          [
            "INSERT INTO users(id,name,email,authId,role,active,createdAt) SELECT ?,?,email,?,role,1,? FROM invites WHERE token=? AND email=? AND used=0 AND expires>?",
            id,
            name,
            authId,
            now(),
            digest,
            email,
            time,
          ],
          ["UPDATE invites SET used=1 WHERE token=? AND EXISTS(SELECT 1 FROM users WHERE id=?)", digest, id],
        ]);
        u = await one("SELECT * FROM users WHERE id=?", id);
        assert(u, 400, "Davet geçersiz, süresi dolmuş veya başka bir e-posta adresine ait.");
        await audit(u.id, "Davet kabul edildi");
        return json(res, 201, { user: publicUser(u), csrf });
      }
      assert(u && u.active, 403, "Bu hesap aileye henüz davet edilmedi veya erişimi donduruldu.");
      await securityGate({ u, path, token: req.headers.get("x-family-factor") || req.headers.get("cookie")?.match(/(?:^|;\s*)sf_factor=([^;]+)/)?.[1], one });
      if (path === "/api/chat/stream" && method === "GET")
        return eventStream({
          u,
          one,
          signal: req.signal,
          authorize: async () => {
            assert(await one("SELECT id FROM users WHERE id=? AND active=1", u.id), 403, "Hesap kapalı.");
            await securityGate({
              u,
              path,
              token: req.headers.get("x-family-factor") || req.headers.get("cookie")?.match(/(?:^|;\\s*)sf_factor=([^;]+)/)?.[1],
              one,
            });
          },
        });
      if (path.startsWith("/api/notifications/"))
        return await notifications({ path, method, u, read: (max) => body(req, max), one, run, limit, keyText: env.CSRF_SECRET });
      if (path.startsWith("/api/search") && method === "GET") return await search({ path, url, u, all, one });
      if (path.startsWith("/api/security/"))
        return await security({ u, path, method, read: (max) => body(req, max), one, run, batch, limit, keyText: env.CSRF_SECRET });
      if (path === "/api/archive/photo-enhance")
        return await photoEnhance({
          u,
          method,
          read: (max) => body(req, max),
          one,
          all,
          batch,
          storage: env.BUCKET,
          limit,
          apiKey: env.OPENAI_API_KEY,
          model: env.IMAGE_MODEL || "gpt-image-1.5",
        });
      if (path.startsWith("/api/archive/backups"))
        return await backups({ path, method, u, read: (max) => body(req, max), all, one, run, batch, storage: env.BUCKET });
      if (path === "/api/bootstrap" && u.role === "owner" && ctx?.waitUntil)
        ctx.waitUntil(warmSearchIndex({ all, batch }).catch((e) => log("warn", "search.index_failed", { message: e?.message })));
      if (path === "/api/bootstrap" && u.role === "owner")
        await makeBackup({ all, run, storage: env.BUCKET }, true).catch((e) => serverError(run, "backup.first_failed", e));
      if (archivePath(path)) return await archive({ path, method, url, u, read: (max) => body(req, max), all, one, run, batch, storage: env.BUCKET, limit });
      if (communityPath(path))
        return await community({
          path,
          method,
          url,
          u,
          read: (max) => body(req, max),
          all,
          one,
          run,
          batch,
          storage: env.BUCKET,
          limit,
          hosted: true,
          keyText: env.CSRF_SECRET,
          defer: ctx?.waitUntil ? (task) => ctx.waitUntil(task) : null,
          nativePush: createNativePush(env), // Android only; see src/native-push.mjs
        });
      res.hidden = await hiddenPeople(all, u);
      return await coreApi({
        path,
        method,
        url,
        u,
        res,
        read: (max) => body(req, max),
        json: (status, data) => json(res, status, data),
        all,
        one,
        run,
        batch,
        storage: env.BUCKET,
        limit,
        origin,
        token,
        hash,
        securityHeaders: headers,
      });
    } catch (e) {
      if (!e.status)
        await serverError(
          env.DB &&
            ((sql, ...args) =>
              env.DB.prepare(sql)
                .bind(...args)
                .run()),
          "request.failed",
          e,
          { path, method },
        );
      return json(res, e.status || 500, { error: e.status ? e.message : "İşlem tamamlanamadı. Lütfen tekrar deneyin." });
    }
  },
};
