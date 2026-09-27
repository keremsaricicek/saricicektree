// Outgoing e-mail for the Node server: invites and password resets.
// Messages are queued (mail_queue) and sent in the background, so a slow or failing mail server never
// blocks the page. Temporary failures are retried with growing delays; permanent ones (SMTP 5xx) and
// the last retry mark the message failed for the admin panel. The one-time link in the body is removed
// as soon as the message is sent or has finally failed.
//   SMTP_URL   smtps://user:password@smtp.example.com:465   (or smtp://…:587 with STARTTLS)
//   MAIL_FROM  "Sarıçiçek Konağı <aile@alanadiniz.com>"
import { log } from "./log.mjs";
import { recordError } from "./ops.mjs";

export const MAX_ATTEMPTS = 5;
const now = () => new Date().toISOString();
const delay = (attempts) => Math.min(3600_000, 60_000 * 2 ** (attempts - 1));

const ROLE = { member: "aile üyesi", moderator: "moderatör" };
export const messages = {
  invite: ({ url, role, inviter }) => ({
    subject: "Sarıçiçek Konağı'na davetlisin",
    body:
      `Merhaba,\n\n${inviter || "Aile yöneticin"} seni Sarıçiçek Konağı'na ${ROLE[role] || "aile üyesi"} olarak davet etti.\n\n` +
      `Katılmak için bu bağlantıyı aç:\n${url}\n\n` +
      `Bağlantı 7 gün geçerlidir ve yalnız bir kez kullanılabilir.\n` +
      `Bu daveti beklemiyorsan bu e-postayı yok sayabilirsin.\n\n— Sarıçiçek Konağı`,
  }),
  reset: ({ url }) => ({
    subject: "Sarıçiçek Konağı şifre yenileme",
    body:
      `Merhaba,\n\nŞifreni yenilemek için bu bağlantıyı aç:\n${url}\n\n` +
      `Bağlantı 1 saat geçerlidir ve yalnız bir kez kullanılabilir.\n` +
      `Bu isteği sen yapmadıysan bu e-postayı yok say; şifren değişmez.\n\n— Sarıçiçek Konağı`,
  }),
};

/**
 * @param {{ all: Function, one: Function, run: Function }} db
 * @param {{ env?: Record<string, string|undefined>, send?: (m: {from: string, to: string, subject: string, text: string}) => Promise<unknown>, intervalMs?: number }} options
 *   `send` replaces the SMTP transport (tests).
 */
export async function createMailer(db, { env = process.env, send = null, intervalMs = 30_000 } = {}) {
  const enabled = !!(send || env.SMTP_URL);
  let transport = send;
  if (!transport && env.SMTP_URL) {
    const nodemailer = (await import("nodemailer")).default;
    const { parseConnectionUrl } = await import("nodemailer/lib/shared/index.js");
    // Short timeouts: a stuck mail server is retried later instead of holding a connection for minutes.
    const smtp = nodemailer.createTransport({ ...parseConnectionUrl(env.SMTP_URL), connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000 });
    transport = (m) => smtp.sendMail(m);
  }
  const from = env.MAIL_FROM || "Sarıçiçek Konağı <no-reply@localhost>";
  let busy = false,
    again = false,
    timer = null;

  async function processDue() {
    if (!enabled) return;
    if (busy) {
      again = true; // a message queued while sending is picked up right after, not at the next tick
      return;
    }
    busy = true;
    try {
      do {
        again = false;
        await sendDue();
      } while (again);
    } finally {
      busy = false;
    }
  }

  async function sendDue() {
    const due = await db.all("SELECT * FROM mail_queue WHERE status='pending' AND (nextAttemptAt IS NULL OR nextAttemptAt<=?) ORDER BY id LIMIT 10", now());
    for (const listed of due) {
      // Re-read: a newer message may have replaced this one (and its link) while others were sent.
      const m = await db.one("SELECT * FROM mail_queue WHERE id=? AND status='pending'", listed.id);
      if (!m) continue;
      try {
        await transport({ from, to: m.toAddr, subject: m.subject, text: m.body });
        await db.run("UPDATE mail_queue SET status='sent',sentAt=?,body=NULL,lastError=NULL,attempts=attempts+1 WHERE id=?", now(), m.id);
        log("info", "mail.sent", { id: m.id, kind: m.kind });
      } catch (e) {
        const attempts = m.attempts + 1,
          permanent = Number(e.responseCode) >= 500,
          final = permanent || attempts >= MAX_ATTEMPTS,
          message = String(e.response || e.message || e).slice(0, 200);
        await db.run(
          final
            ? "UPDATE mail_queue SET status='failed',attempts=?,lastError=?,body=NULL,nextAttemptAt=NULL WHERE id=?"
            : "UPDATE mail_queue SET attempts=?,lastError=?,nextAttemptAt=? WHERE id=?",
          ...(final ? [attempts, message, m.id] : [attempts, message, new Date(Date.now() + delay(attempts)).toISOString(), m.id]),
        );
        log(final ? "error" : "warn", final ? "mail.failed" : "mail.retry", { id: m.id, kind: m.kind, attempts, message });
        if (final) await recordError(db.run, "server", "mail.failed", message, m.kind);
      }
    }
  }

  return {
    enabled,
    /** Queues a message and tries to send it right away. Returns "queued" or null when mail is off. */
    async enqueue(kind, to, refId, data) {
      if (!enabled) return null;
      const { subject, body } = messages[kind](data);
      // A newer message for the same invite or account replaces an unsent older one (its link is no longer valid).
      if (refId) await db.run("UPDATE mail_queue SET status='replaced',body=NULL WHERE refId=? AND kind=? AND status='pending'", refId, kind);
      await db.run("INSERT INTO mail_queue(kind,refId,toAddr,subject,body,createdAt) VALUES(?,?,?,?,?,?)", kind, refId, to, subject, body, now());
      setImmediate(() => processDue().catch((e) => log("error", "mail.process_failed", { message: e.message })));
      return "queued";
    },
    processDue,
    start() {
      if (enabled && !timer) timer = setInterval(() => processDue().catch((e) => log("error", "mail.process_failed", { message: e.message })), intervalMs);
      timer?.unref?.();
      return this;
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
  };
}
