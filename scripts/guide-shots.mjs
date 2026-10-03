// Screenshots for the illustrated guide (public/guide.html), taken from the demo family (no real data).
//   node src/build-client.mjs && node scripts/guide-shots.mjs
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import sharp from "sharp";

const root = resolve("public"),
  types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".woff2": "font/woff2",
    ".json": "application/json",
  };
const server = createServer((req, res) => {
  const path = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname.replace(/\/$/, "/index.html")));
  if (!path.startsWith(root)) return res.writeHead(403).end();
  try {
    res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" }).end(readFileSync(path));
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const base = `http://localhost:${server.address().port}/index.html?demo=1`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1348, height: 926 }, reducedMotion: "reduce" });
const settle = () => page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
const shot = async (name) => {
  await page.waitForTimeout(500);
  await settle();
  await sharp(await page.screenshot())
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(`public/guide/${name}.jpg`);
  console.log("public/guide/" + name + ".jpg");
};
const go = async (hash) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(400);
};
await page.goto(base + "#home");
await page.locator(".ds-post").first().waitFor();
await shot("home");
await go("gallery");
await shot("avlu");
await page.locator(".hm-tile").first().click();
await page.locator("#dialog[open] .hm-view-story").waitFor();
await shot("photo");
await page.keyboard.press("Escape");
await go("person/p0");
await shot("profile");
await go("home");
await page.evaluate(() => hmUpload(true));
await shot("upload");
await page.keyboard.press("Escape");
await go("tree");
await shot("tree");
await browser.close();
server.close();
