// Screens of the demo family for refactor checks: the same pages and dialogs are captured with a
// fixed clock and random seed, so two runs of unchanged code give byte-identical files.
//   node scripts/visual-snapshot.mjs <outdir>             capture
//   node scripts/visual-snapshot.mjs --compare <a> <b>    list files that differ
// Known to vary between identical runs: *-places (map tiles) and desk-settings (sub-pixel text).
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";

if (process.argv[2] === "--compare") {
  const [a, b] = process.argv.slice(3);
  const diff = readdirSync(a).filter((f) => !readdirSync(b).includes(f) || !readFileSync(join(a, f)).equals(readFileSync(join(b, f))));
  console.log(diff.length ? "Differ:\n" + diff.join("\n") : "All " + readdirSync(a).length + " files identical.");
  process.exit(diff.length ? 1 : 0);
}
const out = process.argv[2];
if (!out) throw Error("usage: node scripts/visual-snapshot.mjs <outdir>");
mkdirSync(out, { recursive: true });
const root = resolve("public"),
  types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
    ".json": "application/json",
    ".woff2": "font/woff2",
  };
const server = createServer((req, res) => {
  const file = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  try {
    if (!file.startsWith(root)) throw Error("outside");
    const body = readFileSync(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const base = "http://localhost:" + server.address().port;
const ROUTES = [
  "home",
  "tree",
  "people",
  "gallery",
  "calendar",
  "history",
  "places",
  "chat",
  "documents",
  "archive",
  "connections",
  "groups",
  "admin",
  "settings",
];
const b = await chromium.launch();
const errors = [];
for (const [k, vp, mobile] of [
  ["desk", { width: 1440, height: 900 }, false],
  ["mob", { width: 390, height: 844 }, true],
]) {
  const ctx = await b.newContext({
    viewport: vp,
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    timezoneId: "Europe/Istanbul",
    locale: "tr-TR",
  });
  await ctx.addInitScript(() => {
    const T = new Date("2026-09-20T10:00:00+03:00").getTime();
    const D = Date;
    const off = D.now() - T;
    globalThis.Date = class extends D {
      constructor(...a) {
        a.length ? super(...a) : super(D.now() - off);
      }
      static now() {
        return D.now() - off;
      }
    };
    Math.random = (() => {
      let s = 1;
      return () => (s = (s * 16807) % 2147483647) / 2147483647;
    })();
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(k + ": " + e.message));
  await p.goto(base + "/index.html?demo=1#home");
  await p.waitForSelector(".ds-post");
  await p.waitForTimeout(800);
  const shot = async (name) => {
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${out}/${k}-${name}.png`, fullPage: true, animations: "disabled", caret: "hide" });
  };
  for (const r of ROUTES) {
    await p.evaluate((r) => (location.hash = r), r);
    await shot(r);
  }
  const pid = await p.evaluate(() => state.people[0].id);
  await p.evaluate((id) => (location.hash = "person/" + id), pid);
  await shot("person");
  await p.evaluate(() => (location.hash = "gallery"));
  await p.waitForTimeout(700);
  await p.locator(".hm-tile").first().click();
  await shot("gallery-dialog");
  await p.keyboard.press("Escape");
  await p.evaluate(() => (location.hash = "home"));
  await p.waitForTimeout(700);
  const img = p.locator(".ds-post img").first();
  if (await img.count()) {
    await img.click();
    await shot("home-lightbox");
    await p.keyboard.press("Escape");
  }
  await p.evaluate(() => (location.hash = "chat"));
  await p.waitForTimeout(700);
  const conv = p.locator(".dm-thread, [data-action='dm-open']").first();
  if (await conv.count()) {
    await conv.click();
    await shot("chat-open");
  }
  await p.keyboard.press("Escape");
  await p.evaluate(() => (location.hash = "home"));
  await p.waitForTimeout(700);
  await p.evaluate(() => handle("account", document.querySelector("[data-action=account]")));
  await shot("account");
  await p.keyboard.press("Escape");
  await p.evaluate(() => ffHandle("options", document.querySelector('[aria-label="Paylaşım seçenekleri"]')));
  await shot("post-options");
  await p.keyboard.press("Escape");
  await p.evaluate(() => ffHandle("kind", document.querySelector("[data-kind=question]")));
  await shot("compose-question");
  const pid2 = await p.evaluate(() => ffDemo?.posts?.[0]?.id);
  await p.evaluate((id) => {
    location.hash = "post/" + id;
  }, pid2);
  await shot("post-link");
  await p.keyboard.press("Escape");
  const q = await p.evaluate(
    async () => JSON.stringify(await ffApi("?q=a")).length + ":" + JSON.stringify(await ffApi("/" + ffDemo.posts[0].id)).slice(0, 400),
  );
  writeFileSync(out + "/" + k + "-api.txt", q);
  await ctx.close();
}
await b.close();
server.close();
console.log(errors.length ? errors.join("\n") : "no errors");
