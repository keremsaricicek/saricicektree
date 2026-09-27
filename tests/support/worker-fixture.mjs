// In-memory Worker fixture: every generated migration on a fresh SQLite database, a bucket in a
// Map, and a call() helper that signs in as a given e-mail (Sites identity headers) with CSRF.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import worker from "../../worker/index.mjs";

export function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const f of readdirSync("drizzle")
    .filter((x) => x.endsWith(".sql"))
    .sort())
    db.exec(readFileSync("drizzle/" + f, "utf8"));
  const files = new Map(),
    env = {
      OWNER_EMAIL: "owner@test.invalid",
      CSRF_SECRET: "fixture-encryption-key",
      DB: {
        prepare(sql) {
          const s = {
            args: [],
            bind(...args) {
              s.args = args;
              return s;
            },
            async first() {
              return db.prepare(sql).get(...s.args) || null;
            },
            async all() {
              return { results: db.prepare(sql).all(...s.args) };
            },
            async run() {
              return { meta: { changes: db.prepare(sql).run(...s.args).changes } };
            },
          };
          return s;
        },
        async batch(ss) {
          db.exec("BEGIN");
          try {
            const out = [];
            for (const s of ss) out.push(await s.run());
            db.exec("COMMIT");
            return out;
          } catch (e) {
            db.exec("ROLLBACK");
            throw e;
          }
        },
      },
      BUCKET: {
        async put(k, b) {
          files.set(k, new Uint8Array(b));
        },
        async get(k) {
          return files.has(k) ? { body: files.get(k) } : null;
        },
        async delete(k) {
          files.delete(k);
        },
      },
    };
  const csrf = new Map();
  async function call(path, method = "GET", data, email = "owner@test.invalid", factor = "") {
    if (path === "/api/photos" && method === "POST")
      data = { date: "2000-01-02", place: "Test location", description: "Test family memory", outsiders: "Test guest", ...data };
    const headers = {
      "Content-Type": "application/json",
      Origin: "https://family.test",
      "oai-authenticated-user-id": email,
      "oai-authenticated-user-email": email,
      "X-CSRF-Token": csrf.get(email) || "",
      "X-Family-Factor": factor,
    };
    const res = await worker.fetch(new Request("https://family.test" + path, { method, headers, ...(data ? { body: JSON.stringify(data) } : {}) }), env);
    const type = res.headers.get("Content-Type"),
      body = type?.includes("json") ? await res.json() : await res.arrayBuffer();
    if (body.csrf) csrf.set(email, body.csrf);
    return { status: res.status, body };
  }
  async function member(email) {
    await call("/api/me");
    const inv = await call("/api/invites", "POST", { email, role: "member" });
    await call("/api/me", "GET", null, email);
    return (await call("/api/accept-invite", "POST", { name: email, token: inv.body.url.split("#invite=")[1] }, email)).body.user;
  }
  return { db, files, env, call, member };
}
