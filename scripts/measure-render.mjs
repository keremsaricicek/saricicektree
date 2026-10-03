// Re-render check with a large test family: 1,200 people (a parent tree) and 400 posts.
//   node scripts/measure-render.mjs
// Runs the Node server on a throw-away data folder, 390x844, CPU 4x slower (Chromium emulation).
// Reports page switch times, how often the whole page is rebuilt (render()) on a tree visit, while
// typing in the people search and when changes arrive live, and whether the feed keeps its scroll.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const data = mkdtempSync(join(tmpdir(), "saricicek-render-")),
  port = 3950 + Math.floor(Math.random() * 20),
  origin = "http://localhost:" + port;
const server = spawn(process.execPath, ["scripts/test-server.mjs"], {
  env: { ...process.env, DATA_DIR: data, PORT: String(port), MEDIA_JOBS: "off" },
  stdio: ["ignore", "pipe", "inherit"],
});
for (;;) {
  const [chunk] = await once(server.stdout, "data");
  if (String(chunk).includes("localhost:" + port)) break;
}
const db = new DatabaseSync(join(data, "family.sqlite"));
const owner = db.prepare("SELECT id FROM users WHERE role='owner'").get().id,
  now = new Date().toISOString();
db.exec("BEGIN");
const person = db.prepare("INSERT INTO people(id,name,birthDate,createdAt,updatedAt) VALUES(?,?,?,?,?)"),
  parent = db.prepare("INSERT INTO relations(id,personA,personB,type) VALUES(?,?,?,'parent')"),
  post = db.prepare("INSERT INTO feed_posts(createdBy,clientId,kind,body,peopleIds,visibility,userIds,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?)");
for (let i = 0; i < 1200; i++) {
  person.run("p" + i, "Kişi " + i + " Sarıçiçek", 1900 + (i % 120) + "-01-01", now, now);
  if (i) parent.run("r" + i, "p" + Math.floor((i - 1) / 3), "p" + i);
}
for (let i = 0; i < 400; i++)
  post.run(
    owner,
    "c" + i,
    "post",
    "Paylaşım " + i + " — uzun bir aile notu. ".repeat(3),
    "[]",
    "family",
    "[]",
    new Date(Date.now() - i * 60000).toISOString(),
    now,
  );
db.exec("COMMIT");
const lastPost = db.prepare("SELECT id FROM feed_posts ORDER BY id DESC LIMIT 1").get().id;
db.close();

const login = await fetch(origin + "/api/login", {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({ email: "owner@test.local", password: "Test-Parola-2026!" }),
});
const [name, value] = login.headers.get("set-cookie").split(";")[0].split("="),
  csrf = (await login.json()).csrf;
const api = (path, method, body) =>
  fetch(origin + path, {
    method,
    headers: { "content-type": "application/json", origin, cookie: name + "=" + value, "x-csrf-token": csrf },
    body: JSON.stringify(body),
  });

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name, value, url: origin }]);
  const page = await ctx.newPage();
  await (await ctx.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto(origin + "/#home");
  await page.waitForSelector(".ds-post");
  await page.evaluate(() => {
    window.__renders = 0;
    const base = render;
    render = function () {
      window.__renders++;
      return base.apply(this, arguments);
    };
  });
  const renders = () => page.evaluate(() => window.__renders);
  const reset = () => page.evaluate(() => (window.__renders = 0));
  for (const route of ["tree", "people", "gallery", "home"]) {
    const ms = await page.evaluate(async (route) => {
      const t = performance.now();
      location.hash = route;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return Math.round(performance.now() - t);
    }, route);
    await page.waitForTimeout(1500);
    console.log(`${route}: sayfa geçişi ${ms} ms, ${await page.evaluate(() => document.getElementsByTagName("*").length)} DOM öğesi`);
  }
  await reset();
  await page.evaluate(() => (location.hash = "tree"));
  await page.waitForTimeout(3000);
  console.log(`Soy ağacı ziyareti: ${await renders()} sayfa çizimi`);

  // Large tree: opening, memory, panning across it and zooming out to see all of it.
  const cdp = await ctx.newCDPSession(page);
  await page.evaluate(() => (location.hash = "people"));
  await page.waitForTimeout(800);
  const open = await page.evaluate(async () => {
    const t = performance.now();
    location.hash = "tree";
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return Math.round(performance.now() - t);
  });
  await page.waitForTimeout(1500);
  await cdp.send("HeapProfiler.collectGarbage");
  const heap = (await cdp.send("Runtime.getHeapUsage")).usedSize;
  const treeDom = await page.evaluate(() => document.querySelector(".tree-canvas").getElementsByTagName("*").length);
  const pan = await page.evaluate(async () => {
    const vp = document.querySelector(".tree-viewport"),
      t = performance.now();
    for (let i = 0; i < 20; i++) {
      vp.scrollLeft += 300;
      vp.scrollTop += 120;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    return Math.round(performance.now() - t);
  });
  // "Fit": time until the page answers again (two frames), and until every card on screen is drawn.
  const [fit, fitAll] = await page.evaluate(async () => {
    const t = performance.now(),
      frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    document.querySelector('[data-action="zoom-fit"]').click();
    await frames();
    const first = Math.round(performance.now() - t);
    let n = -1;
    while (n !== document.querySelectorAll(".tree-canvas .ds-node").length) {
      n = document.querySelectorAll(".tree-canvas .ds-node").length;
      await frames();
    }
    return [first, Math.round(performance.now() - t)];
  });
  const shown = await page.evaluate(() => document.querySelectorAll(".tree-canvas .ds-node").length);
  console.log(
    `Büyük ağaç: açılış ${open} ms, ağaçta ${treeDom} DOM öğesi, JS yığını ${(heap / 1048576).toFixed(1)} MB, 20 adım kaydırma ${pan} ms, ekrana sığdır: sayfa ${fit} ms sonra yanıt veriyor, ${shown} kartın tamamı ${fitAll} ms`,
  );

  await page.evaluate(() => (location.hash = "people"));
  await page.waitForTimeout(1500);
  await reset();
  await page.locator("#people-search").focus();
  const t0 = Date.now();
  await page.keyboard.type("Kişi 11");
  const typing = Date.now() - t0;
  await page.waitForTimeout(600);
  console.log(`Kişi aramasında 7 harf: yazma ${typing} ms, ${await renders()} sayfa çizimi`);
  await page.evaluate(() => (location.hash = "home"));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 3000));
  await reset();
  const like = await api("/api/experience/feed/" + lastPost + "/like", "PUT", {});
  const add = await api("/api/people", "POST", { name: "Yeni Kişi Deneme" });
  await page.waitForTimeout(4000);
  console.log(
    `Canlı değişiklik (beğeni ${like.status}, yeni kişi ${add.status}): ${await renders()} sayfa çizimi, kaydırma ${await page.evaluate(() => scrollY)} px (önce 3000)`,
  );
} finally {
  await browser.close();
  server.kill();
}
