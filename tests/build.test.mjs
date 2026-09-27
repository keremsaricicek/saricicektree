// The hosted (Cloudflare) package must contain every script index.html loads, including the
// minified copies in public/min/ and the on-demand map files. `npm test` builds it first (pretest).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assets } from "../worker/assets.mjs";

test("hosted assets contain every script the page loads and the on-demand map files", () => {
  const html = readFileSync("public/index.html", "utf8");
  const scripts = [...html.matchAll(/<script\b[^>]*src="([^"?]+)/g)].map((m) => "/" + m[1]);
  assert.ok(scripts.length > 20);
  for (const path of [...scripts, "/assets/leaflet.js", "/assets/world-map.js"]) assert.ok(assets[path], path + " missing from the hosted build");
  assert.ok(
    scripts.every((s) => s.startsWith("/min/") || s.startsWith("/assets/")),
    "app scripts load from the minified copies",
  );
});
