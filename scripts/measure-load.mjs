// Page-load measurement under fixed conditions, for before/after comparisons.
//   node scripts/measure-load.mjs [runs=5] [out.json]
// Starts the Node server on a throw-away data folder, signs in as the test owner and loads each
// page with a cold cache, a 10 Mbit/s / 40 ms network and 4x CPU slowdown (Chromium DevTools
// emulation, not a real phone). Sizes are the bytes the server sent ("raw") and the same bodies
// compressed with gzip level 6 ("gzip"); production compression by Caddy may differ slightly.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const runs = Number(process.argv[2] || 5),
  outFile = process.argv[3],
  port = 3970 + Math.floor(Math.random() * 20),
  origin = `http://localhost:${port}`;
const PAGES = [
  ["Hayat (giriş sonrası ilk sayfa)", "home"],
  ["Bizimkiler Nerede? (harita)", "places"],
];

const server = spawn(process.execPath, ["scripts/test-server.mjs"], {
  env: { ...process.env, PORT: String(port), MEDIA_JOBS: "off" },
  stdio: ["ignore", "pipe", "inherit"],
});
for (;;) {
  const [chunk] = await once(server.stdout, "data");
  if (String(chunk).includes("localhost:" + port)) break;
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const browser = await chromium.launch();
const version = browser.version();
const results = [];
try {
  const login = await fetch(origin + "/api/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email: "owner@test.local", password: "Test-Parola-2026!" }),
  });
  const cookie = login.headers.get("set-cookie").split(";")[0].split("=");
  for (const [label, hash] of PAGES) {
    const samples = [];
    for (let i = 0; i < runs; i++) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await ctx.addCookies([{ name: cookie[0], value: cookie[1], url: origin }]);
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: 1_250_000, uploadThroughput: 1_250_000 });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await cdp.send("Performance.enable");
      const files = [];
      page.on("response", async (r) => {
        const url = new URL(r.url());
        if (url.origin !== origin || url.pathname.startsWith("/api/")) return;
        try {
          const body = await r.body();
          files.push({ path: url.pathname, type: r.headers()["content-type"] || "", raw: body.length, gzip: gzipSync(body, { level: 6 }).length });
        } catch {
          // Streams (e.g. live updates) have no finished body; they are not static assets.
        }
      });
      const t0 = Date.now();
      await page.goto(origin + "/#" + hash, { waitUntil: "load" });
      await page.waitForSelector("#main");
      if (hash === "places") await page.waitForSelector("#family-map .leaflet-overlay-pane canvas", { state: "attached", timeout: 60000 });
      const ready = Date.now() - t0;
      await page.waitForTimeout(500);
      const nav = await page.evaluate(() => {
        const n = performance.getEntriesByType("navigation")[0],
          fcp = performance.getEntriesByName("first-contentful-paint")[0];
        return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: Math.round(fcp?.startTime || 0) };
      });
      const m = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
      const sum = (f, k) => files.filter(f).reduce((a, x) => a + x[k], 0);
      const isJs = (x) => /javascript/.test(x.type),
        isCss = (x) => /css/.test(x.type);
      samples.push({
        ...nav,
        ready,
        scriptMs: Math.round(m.ScriptDuration * 1000),
        heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(1),
        requests: files.length,
        jsRaw: sum(isJs, "raw"),
        jsGzip: sum(isJs, "gzip"),
        cssRaw: sum(isCss, "raw"),
        cssGzip: sum(isCss, "gzip"),
        allRaw: sum(() => true, "raw"),
        allGzip: sum(() => true, "gzip"),
        files: files.map((f) => f.path + " " + f.raw),
      });
      await ctx.close();
    }
    const pick = (k) => median(samples.map((s) => s[k]));
    const summary = { page: label, runs };
    for (const k of ["fcp", "dcl", "load", "ready", "scriptMs", "heapMB", "requests", "jsRaw", "jsGzip", "cssRaw", "cssGzip", "allRaw", "allGzip"])
      summary[k] = pick(k);
    summary.files = samples[0].files;
    results.push(summary);
  }
} finally {
  await browser.close();
  server.kill();
}
const kb = (b) => (b / 1024).toFixed(0) + " KB";
for (const r of results)
  console.log(
    `${r.page}: FCP ${r.fcp} ms · DOMContentLoaded ${r.dcl} ms · load ${r.load} ms · hazır ${r.ready} ms · betik ${r.scriptMs} ms · ` +
      `JS ${kb(r.jsRaw)} ham / ${kb(r.jsGzip)} gzip · CSS ${kb(r.cssRaw)} / ${kb(r.cssGzip)} · toplam ${kb(r.allRaw)} / ${kb(r.allGzip)} · ${r.requests} istek`,
  );
if (outFile)
  writeFileSync(
    outFile,
    JSON.stringify({ measuredAt: new Date().toISOString(), conditions: "390x844, cold cache, 10 Mbit/s 40 ms, CPU 4x, Chromium " + version, results }, null, 2),
  );
