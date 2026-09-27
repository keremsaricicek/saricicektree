// Native notifications for the Android and iOS apps: FCM (HTTP v1) and APNs (token auth, HTTP/2).
// Notifications carry no names, message text or post content, so nothing private shows on a lock
// screen; tapping one opens the right page through the `url` field (e.g. "#chat", "#post/12").
//
//   FCM_SERVICE_ACCOUNT  Firebase service-account JSON (the whole file as one line)   -> Android
//   APNS_KEY             Apple .p8 key (PEM text; "\n" escapes allowed)              -> iOS (Node only)
//   APNS_KEY_ID, APNS_TEAM_ID, APNS_TOPIC (bundle id, default com.saricicek.family),
//   APNS_ENV=sandbox for development builds (default: production)
// Without these the app still works; phones simply get no native notifications.
import { log } from "./log.mjs";

export const TEXTS = {
  message: "Yeni bir mesajın var.",
  tag: "Bir paylaşımda etiketlendin.",
  comment: "Paylaşımına yeni bir yorum geldi.",
};
const PREFERENCE = { message: "messages", tag: "tags", comment: "comments" };
const TITLE = "Sarıçiçek Konağı";

const enc = new TextEncoder();
const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
const pemBytes = (pem) =>
  Uint8Array.from(
    atob(
      String(pem)
        .replace(/\\n/g, "\n")
        .replace(/-----[^-]+-----/g, "")
        .replace(/\s+/g, ""),
    ),
    (c) => c.charCodeAt(0),
  );

async function signJwt(header, claims, pem, algorithm) {
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(pem), algorithm, false, ["sign"]);
  const input = b64url(enc.encode(JSON.stringify(header))) + "." + b64url(enc.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign(algorithm.name === "ECDSA" ? { name: "ECDSA", hash: "SHA-256" } : algorithm.name, key, enc.encode(input));
  return input + "." + b64url(signature);
}

/** Valid-looking device tokens: FCM registration tokens and hexadecimal APNs device tokens. */
export function validToken(platform, token) {
  const t = String(token || "");
  return platform === "android" ? /^[A-Za-z0-9_:-]{64,4096}$/.test(t) : platform === "ios" ? /^[0-9a-fA-F]{64,200}$/.test(t) : false;
}

/**
 * @param {Record<string, string|undefined>} env
 * @param {{ fetch?: typeof fetch, http2Connect?: (origin: string) => any }} options
 *   http2Connect: node:http2's connect (Node server). Without it there is no APNs, which is the case on
 *   Cloudflare Workers: they cannot open the HTTP/2 connection Apple requires.
 */
export function createNativePush(env, { fetch: send = fetch, http2Connect = null } = {}) {
  let account = null;
  try {
    account = env.FCM_SERVICE_ACCOUNT ? JSON.parse(env.FCM_SERVICE_ACCOUNT) : null;
  } catch {
    log("error", "push.fcm_config_invalid", {});
  }
  const android = !!(account?.project_id && account?.client_email && account?.private_key);
  const ios = !!(http2Connect && env.APNS_KEY && env.APNS_KEY_ID && env.APNS_TEAM_ID);
  const fcmBase = env.FCM_BASE_URL || "https://fcm.googleapis.com";
  const apnsOrigin = env.APNS_ORIGIN || (env.APNS_ENV === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com");
  let oauth = null,
    apnsJwt = null,
    apnsSession = null;

  async function fcmAccessToken(force = false) {
    if (!force && oauth && oauth.expires > Date.now() + 60_000) return oauth.token;
    const iat = Math.floor(Date.now() / 1000),
      tokenUri = account.token_uri || "https://oauth2.googleapis.com/token";
    const assertion = await signJwt(
      { alg: "RS256", typ: "JWT" },
      { iss: account.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: tokenUri, iat, exp: iat + 3600 },
      account.private_key,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    );
    const r = await send(tokenUri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.access_token) throw Error("FCM sign-in failed: HTTP " + r.status);
    oauth = { token: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 };
    return oauth.token;
  }

  /** @returns {Promise<"sent"|"invalid"|"failed">} */
  async function sendFcm(token, kind, url, retried = false) {
    const r = await send(`${fcmBase}/v1/projects/${account.project_id}/messages:send`, {
      method: "POST",
      headers: { authorization: "Bearer " + (await fcmAccessToken(retried)), "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: TITLE, body: TEXTS[kind] },
          data: { url, kind },
          android: { priority: "high", notification: { tag: kind, visibility: "PRIVATE" } },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (r.ok) return "sent";
    if (r.status === 401 && !retried) return sendFcm(token, kind, url, true);
    const error = await r.json().catch(() => ({}));
    const code = (error.error?.details || []).map((d) => d.errorCode).find(Boolean) || error.error?.status;
    if (r.status === 404 || code === "UNREGISTERED" || (r.status === 400 && code === "INVALID_ARGUMENT")) return "invalid";
    log("warn", "push.fcm_rejected", { status: r.status, code });
    return "failed";
  }

  async function apnsToken() {
    if (apnsJwt && apnsJwt.at > Date.now() - 50 * 60_000) return apnsJwt.token;
    const token = await signJwt({ alg: "ES256", kid: env.APNS_KEY_ID }, { iss: env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }, env.APNS_KEY, {
      name: "ECDSA",
      namedCurve: "P-256",
    });
    apnsJwt = { token, at: Date.now() };
    return token;
  }

  async function apnsConnection() {
    if (apnsSession && !apnsSession.closed && !apnsSession.destroyed) return apnsSession;
    apnsSession = http2Connect(apnsOrigin);
    apnsSession.on("error", (e) => log("warn", "push.apns_connection", { message: e.message }));
    apnsSession.unref?.();
    return apnsSession;
  }

  /** @returns {Promise<"sent"|"invalid"|"failed">} */
  async function sendApns(token, kind, url) {
    const [session, jwt] = [await apnsConnection(), await apnsToken()];
    const body = JSON.stringify({ aps: { alert: { title: TITLE, body: TEXTS[kind] }, sound: "default", "thread-id": kind }, url });
    const { status, reason } = await new Promise((resolve, reject) => {
      const req = session.request({
        ":method": "POST",
        ":path": "/3/device/" + token,
        authorization: "bearer " + jwt,
        "apns-topic": env.APNS_TOPIC || "com.saricicek.family",
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      });
      let status = 0,
        text = "";
      req.setTimeout(10_000, () => req.close());
      req.on("response", (h) => (status = Number(h[":status"])));
      req.on("data", (c) => (text += c));
      req.on("end", () => resolve({ status, reason: (JSON.parse(text || "{}").reason || "") + "" }));
      req.on("error", reject);
      req.end(body);
    });
    if (status === 200) return "sent";
    if (status === 410 || ["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"].includes(reason)) return "invalid";
    if (status === 403 && reason === "ExpiredProviderToken") apnsJwt = null;
    log("warn", "push.apns_rejected", { status, reason });
    return "failed";
  }

  return {
    available: { android, ios },
    /**
     * Sends one notification kind to these accounts' devices. The caller has already checked that each
     * account may see what the notification points to. Returns counts for tests and logs.
     */
    async send({ all, one, run }, userIds, kind, url) {
      const result = { sent: 0, removed: 0, failed: 0, skipped: 0 };
      if (!android && !ios) return result;
      for (const userId of [...new Set(userIds)]) {
        const account = await one("SELECT active FROM users WHERE id=?", userId);
        const prefs = JSON.parse((await one("SELECT data FROM user_preferences WHERE userId=?", userId))?.data || "{}");
        if (!account?.active || prefs.notifications?.[PREFERENCE[kind]] === false) {
          result.skipped++;
          continue;
        }
        for (const device of await all("SELECT token,platform FROM push_devices WHERE userId=?", userId)) {
          try {
            let outcome = "failed";
            if (device.platform === "android" && android) outcome = await sendFcm(device.token, kind, url);
            else if (device.platform === "ios" && ios) outcome = await sendApns(device.token, kind, url);
            else continue;
            if (outcome === "invalid") {
              await run("DELETE FROM push_devices WHERE token=?", device.token);
              result.removed++;
            } else result[outcome]++;
          } catch (e) {
            result.failed++;
            log("warn", "push.native_undelivered", { platform: device.platform, message: e?.message });
          }
        }
      }
      if (result.sent || result.failed || result.removed) log("info", "push.native", { kind, ...result });
      return result;
    },
    close() {
      apnsSession?.close();
    },
  };
}
