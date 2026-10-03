// The repository's Caddyfile in front of the real server (TRUST_PROXY=1, as in compose.yaml): sign-in limits count
// the visitor's real address, a forged X-Forwarded-For cannot dodge them, two visitors are counted apart, and the
// 12 MB body limit applies. Needs a Caddy binary (CADDY_BIN, or `caddy` on PATH); skipped otherwise.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { request } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const caddy = (() => {
  for (const bin of [process.env.CADDY_BIN, "caddy"].filter(Boolean))
    try {
      execFileSync(bin, ["version"], { stdio: "ignore" });
      return bin;
    } catch {
      // try the next one
    }
  return null;
})();

const post = (port, path, body, { from = "127.0.0.1", headers = {}, origin }) =>
  new Promise((resolve, reject) => {
    const data = typeof body === "string" ? body : JSON.stringify(body);
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "POST",
        localAddress: from,
        headers: { "content-type": "application/json", origin, "content-length": Buffer.byteLength(data), ...headers },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      },
    );
    req.on("error", reject);
    req.end(data);
  });

test("behind the real Caddyfile: limits use the visitor's address and ignore forged headers", { skip: !caddy && "Caddy not installed" }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sf-caddy-")),
    app = 36100 + Math.floor(Math.random() * 400),
    edge = app + 500,
    origin = `http://localhost:${edge}`;
  const env = {
    ...process.env,
    DATA_DIR: dir,
    PORT: String(app),
    HOST: "127.0.0.1",
    APP_ORIGIN: origin,
    TRUST_PROXY: "1",
    MEDIA_JOBS: "off",
    VIDEOS: "off",
    ADMIN_EMAIL: "owner@caddy.test",
    ADMIN_PASSWORD: "owner-long-password",
  };
  execFileSync(process.execPath, ["src/admin.mjs"], { env, stdio: "pipe" });
  const server = spawn(process.execPath, ["src/server.mjs"], { env, stdio: ["ignore", "pipe", "pipe"] });
  // The repository's Caddyfile, unchanged except for the upstream address (compose uses the service name "app").
  const config = readFileSync("Caddyfile", "utf8").replace("app:3000", `127.0.0.1:${app}`);
  writeFileSync(join(dir, "Caddyfile"), config);
  const proxy = spawn(caddy, ["run", "--config", join(dir, "Caddyfile"), "--adapter", "caddyfile"], {
    env: { ...process.env, SITE_DOMAIN: `:${edge}`, XDG_DATA_HOME: dir, XDG_CONFIG_HOME: dir },
    stdio: "ignore",
  });
  t.after(async () => {
    proxy.kill();
    server.kill();
    await Promise.all([once(proxy, "exit"), once(server, "exit")]);
    rmSync(dir, { recursive: true, force: true });
  });
  for (;;) if (String((await once(server.stdout, "data"))[0]).includes(origin)) break;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${edge}/health`)).ok) break;
    } catch {
      // Caddy is still starting
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  // 40 failed sign-ins from one visitor, each with a different forged X-Forwarded-For and a different e-mail
  // (so the per-address limit is the one that counts): the 41st is refused.
  const statuses = [];
  for (let i = 0; i < 41; i++)
    statuses.push(
      await post(
        edge,
        "/api/login",
        { email: `kisi${i}@caddy.test`, password: "wrong-password-123" },
        { origin, headers: { "x-forwarded-for": `203.0.113.${i}` } },
      ),
    );
  assert.deepEqual(new Set(statuses.slice(0, 40)), new Set([401]));
  assert.equal(statuses[40], 429, "forged X-Forwarded-For does not reset the limit");

  // A second visitor (another source address) is counted on its own and can still sign in.
  assert.equal(await post(edge, "/api/login", { email: "owner@caddy.test", password: "owner-long-password" }, { origin, from: "127.0.0.2" }), 200);

  const db = new DatabaseSync(join(dir, "family.sqlite"));
  const keys = db
    .prepare("SELECT key,count FROM throttle WHERE key LIKE 'login-ip:%' ORDER BY key")
    .all()
    .map((r) => [r.key, r.count]);
  db.close();
  assert.deepEqual(keys, [
    ["login-ip:127.0.0.1", 40],
    ["login-ip:127.0.0.2", 1],
  ]);

  // A body over 12 MB is refused (Caddy's request_body limit and the app's own limit are both 12 MB). Sent from a
  // third address, since the first one is already at its sign-in limit and would be answered before the body is read.
  assert.equal(await post(edge, "/api/login", "x".repeat(13 * 1024 * 1024), { origin, from: "127.0.0.3" }), 413);
});
