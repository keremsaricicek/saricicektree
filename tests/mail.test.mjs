// Automatic e-mail: the queue (retries, permanent failures, links removed after sending) and the whole
// flow on the real Node server against a real local SMTP server (invite, owner reset, "Şifremi unuttum").
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SMTPServer } from "smtp-server";
import { createMailer, MAX_ATTEMPTS } from "../src/mail.mjs";

function memoryDb() {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync("drizzle").filter((x) => x.endsWith(".sql") && /mail_queue|error_log/.test(readFileSync("drizzle/" + x, "utf8"))))
    for (const sql of readFileSync("drizzle/" + f, "utf8").split("--> statement-breakpoint")) if (sql.trim()) db.exec(sql);
  return {
    db,
    all: async (sql, ...a) => db.prepare(sql).all(...a),
    one: async (sql, ...a) => db.prepare(sql).get(...a),
    run: async (sql, ...a) => db.prepare(sql).run(...a),
  };
}
const smtpError = (code, text) => Object.assign(Error(text), { responseCode: code, response: code + " " + text });

test("the queue retries temporary failures, stops at permanent ones and never keeps a sent link", async () => {
  const store = memoryDb();
  const outcomes = [smtpError(451, "try again later"), null];
  const sent = [];
  const mailer = await createMailer(store, {
    send: async (m) => {
      const next = outcomes.shift();
      if (next) throw next;
      sent.push(m);
    },
  });
  await mailer.enqueue("invite", "yeni@example.test", "inv-1", { url: "https://aile.test/#invite=SECRET1", role: "member", inviter: "Ayşe" });
  await mailer.processDue();
  let row = store.db.prepare("SELECT * FROM mail_queue").get();
  assert.equal(row.status, "pending");
  assert.equal(row.attempts, 1);
  assert.match(row.lastError, /451/);
  assert.ok(Date.parse(row.nextAttemptAt) > Date.now() + 50_000, "waits about a minute before retrying");
  await mailer.processDue();
  assert.equal(sent.length, 0, "not retried before its time");
  store.db.exec("UPDATE mail_queue SET nextAttemptAt='2000-01-01T00:00:00Z'");
  await mailer.processDue();
  row = store.db.prepare("SELECT * FROM mail_queue").get();
  assert.equal(row.status, "sent");
  assert.equal(row.body, null, "the one-time link is removed once sent");
  assert.equal(sent[0].to, "yeni@example.test");
  assert.match(sent[0].text, /Ayşe seni Sarıçiçek Konağı'na aile üyesi olarak davet etti[\s\S]*SECRET1[\s\S]*7 gün/);

  // Permanent refusal: failed at once, recorded for the admin panel, link removed.
  const failing = await createMailer(store, { send: async () => Promise.reject(smtpError(550, "mailbox unavailable")) });
  await failing.enqueue("reset", "yok@example.test", "user-9", { url: "https://aile.test/#reset=SECRET2" });
  await failing.processDue();
  row = store.db.prepare("SELECT * FROM mail_queue WHERE kind='reset'").get();
  assert.deepEqual([row.status, row.attempts, row.body], ["failed", 1, null]);
  assert.equal(store.db.prepare("SELECT event FROM error_log").get().event, "mail.failed");

  // Temporary errors give up after MAX_ATTEMPTS.
  const flaky = await createMailer(store, { send: async () => Promise.reject(smtpError(421, "busy")) });
  await flaky.enqueue("reset", "busy@example.test", "user-10", { url: "https://aile.test/#reset=SECRET3" });
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    store.db.exec("UPDATE mail_queue SET nextAttemptAt='2000-01-01T00:00:00Z' WHERE status='pending'");
    await flaky.processDue();
  }
  row = store.db.prepare("SELECT * FROM mail_queue WHERE refId='user-10'").get();
  assert.deepEqual([row.status, row.attempts, row.body], ["failed", MAX_ATTEMPTS, null]);

  // A newer message for the same invite replaces an unsent older one.
  const later = await createMailer(store, { send: async () => Promise.reject(smtpError(451, "later")) });
  await later.enqueue("invite", "a@example.test", "inv-2", { url: "https://aile.test/#invite=OLD" });
  await later.enqueue("invite", "a@example.test", "inv-2", { url: "https://aile.test/#invite=NEW" });
  assert.deepEqual(
    store.db
      .prepare("SELECT status FROM mail_queue WHERE refId='inv-2' ORDER BY id")
      .all()
      .map((r) => r.status),
    ["replaced", "pending"],
  );
  assert.ok(!JSON.stringify(store.db.prepare("SELECT * FROM mail_queue").all()).includes("OLD"));
});

test("invite and password e-mails on the real server, through a real SMTP server", async (t) => {
  const inbox = [];
  const smtp = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    onData(stream, session, done) {
      let data = "";
      stream.on("data", (c) => (data += c));
      stream.on("end", () => {
        inbox.push({
          to: session.envelope.rcptTo.map((r) => r.address),
          data: data.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))),
        });
        done();
      });
    },
  });
  await new Promise((r) => smtp.listen(0, "127.0.0.1", r));
  const data = mkdtempSync(join(tmpdir(), "sf-mail-")),
    port = 34000 + Math.floor(Math.random() * 1000),
    origin = `http://localhost:${port}`;
  const env = {
    ...process.env,
    DATA_DIR: data,
    PORT: String(port),
    APP_ORIGIN: origin,
    MEDIA_JOBS: "off",
    ADMIN_EMAIL: "owner@mail.test",
    ADMIN_PASSWORD: "owner-long-password",
    SMTP_URL: `smtp://127.0.0.1:${smtp.server.address().port}`,
    MAIL_FROM: "Sarıçiçek Konağı <aile@mail.test>",
  };
  execFileSync(process.execPath, ["src/admin.mjs"], { env, stdio: "pipe" });
  const server = spawn(process.execPath, ["src/server.mjs"], { env, stdio: ["ignore", "pipe", "pipe"] });
  t.after(async () => {
    server.kill();
    await once(server, "exit");
    smtp.close();
    rmSync(data, { recursive: true, force: true });
  });
  for (;;) if (String((await once(server.stdout, "data"))[0]).includes(origin)) break;
  const call = async (path, method = "GET", body, session = {}) => {
    const res = await fetch(origin + path, {
      method,
      headers: { origin, "content-type": "application/json", ...(session.cookie ? { cookie: session.cookie, "x-csrf-token": session.csrf } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json, cookie: res.headers.get("set-cookie")?.split(";")[0], csrf: json.csrf };
  };
  const waitForMail = async (to, n = 1) => {
    for (let i = 0; i < 100 && inbox.filter((m) => m.to.includes(to)).length < n; i++) await new Promise((r) => setTimeout(r, 50));
    return inbox.filter((m) => m.to.includes(to));
  };
  assert.equal((await call("/api/config")).body.mail, true);
  const owner = await call("/api/login", "POST", { email: "owner@mail.test", password: "owner-long-password" });

  // Invite by e-mail; the link in the message works once.
  const invite = await call("/api/invites", "POST", { email: "ayse@mail.test", role: "member" }, owner);
  assert.equal(invite.body.mail, "queued");
  const [inviteMail] = await waitForMail("ayse@mail.test");
  assert.match(inviteMail.data, /Subject: =\?UTF-8\?|Subject: Sar/);
  const token = inviteMail.data.match(/#invite=([0-9a-f]+)/)[1];
  assert.equal((await call("/api/accept-invite", "POST", { token, name: "Ayşe", password: "ayse-long-password" })).status, 201);
  assert.equal((await call("/api/accept-invite", "POST", { token, name: "Başkası", password: "other-long-password" })).status, 400);
  const admin = await call("/api/admin", "GET", null, owner);
  assert.equal(admin.body.invites.find((i) => i.email === "ayse@mail.test").mailStatus, "sent");

  // "Şifremi unuttum": same answer for unknown addresses, and no e-mail for them.
  const unknown = await call("/api/forgot-password", "POST", { email: "kimse@mail.test" });
  const known = await call("/api/forgot-password", "POST", { email: "ayse@mail.test" });
  assert.equal(unknown.status, 200);
  assert.deepEqual(unknown.body, known.body);
  const [resetMail] = await waitForMail("ayse@mail.test", 2).then((m) => m.slice(1));
  assert.equal((await waitForMail("kimse@mail.test")).length, 0);
  assert.match(resetMail.data, /1 saat/);
  const resetToken = resetMail.data.match(/#reset=([0-9a-f]+)/)[1];
  assert.equal((await call("/api/reset-password", "POST", { token: resetToken, password: "ayse-new-password-1" })).status, 200);
  assert.equal((await call("/api/reset-password", "POST", { token: resetToken, password: "ayse-new-password-2" })).status, 400);
  assert.equal((await call("/api/login", "POST", { email: "ayse@mail.test", password: "ayse-new-password-1" })).status, 200);

  // At most three reset e-mails an hour to one address; the answer does not change. A newer request
  // replaces an unsent older message (its link no longer works), so count what was queued.
  for (let i = 0; i < 4; i++) assert.equal((await call("/api/forgot-password", "POST", { email: "ayse@mail.test" })).status, 200);
  const db = new DatabaseSync(join(data, "family.sqlite"));
  const queued = () => db.prepare("SELECT status FROM mail_queue WHERE kind='reset' ORDER BY id").all();
  for (let i = 0; i < 100 && queued().some((r) => r.status === "pending"); i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal(queued().length, 3, "first reset + two more within the hourly limit");
  const last = (await waitForMail("ayse@mail.test", 3)).at(-1);
  const lastToken = last.data.match(/#reset=([0-9a-f]+)/)[1];
  assert.equal((await call("/api/reset-password", "POST", { token: lastToken, password: "ayse-new-password-3" })).status, 200, "the newest link works");

  // Nothing secret stays in the queue.
  assert.equal(db.prepare("SELECT COUNT(*) n FROM mail_queue WHERE body IS NOT NULL").get().n, 0);
  db.close();
});
