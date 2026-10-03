// The Appetize upload script against a local stand-in for its API (no account is used in tests).
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { upload } from "../scripts/appetize-upload.mjs";

test("uploads a new app, updates an existing one by key, and explains failures", async (t) => {
  const seen = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString("latin1");
    seen.push({ url: req.url, key: req.headers["x-api-key"], platform: body.match(/name="platform"\r\n\r\n(\w+)/)?.[1], file: body.includes("APK-BYTES") });
    if (req.headers["x-api-key"] !== "good") return res.writeHead(401, { "content-type": "application/json" }).end('{"message":"Invalid token"}');
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ publicKey: "abc123", publicURL: "https://appetize.io/app/abc123" }));
  });
  server.listen(0);
  await once(server, "listening");
  const dir = mkdtempSync(join(tmpdir(), "sf-appetize-")),
    file = join(dir, "Saricicek-Android-demo.apk");
  writeFileSync(file, "APK-BYTES");
  t.after(() => (server.close(), rmSync(dir, { recursive: true, force: true })));
  const base = `http://localhost:${server.address().port}`;

  assert.deepEqual(await upload({ platform: "android", file, token: "good", base }), { publicKey: "abc123", url: "https://appetize.io/app/abc123" });
  assert.deepEqual(seen[0], { url: "/v1/apps", key: "good", platform: "android", file: true });
  await upload({ platform: "android", file, token: "good", key: "abc123", base });
  assert.equal(seen[1].url, "/v1/apps/abc123", "the same app is updated, so its link stays");
  await assert.rejects(upload({ platform: "android", file, token: "bad", base }), /401.*Invalid token/);
  await assert.rejects(upload({ platform: "android", file, token: "", base }), /APPETIZE_API_TOKEN/);
  await assert.rejects(upload({ platform: "windows", file, token: "good", base }), /android ya da ios/);
});
