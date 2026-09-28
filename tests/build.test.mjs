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

test("app scripts never declare the same top-level name twice (they share one global scope)", async () => {
  const { parse } = await import("espree");
  const { readdirSync } = await import("node:fs");
  const files = [
    ...readdirSync("public")
      .filter((f) => f.endsWith(".js") && f !== "sw.js")
      .map((f) => "public/" + f),
    ...readdirSync("public/ui").map((f) => "public/ui/" + f),
  ];
  const seen = new Map(),
    clashes = [];
  for (const file of files)
    for (const node of parse(readFileSync(file, "utf8"), { ecmaVersion: 2024, sourceType: "script" }).body) {
      const names =
        node.type === "FunctionDeclaration" || node.type === "ClassDeclaration"
          ? [node.id.name]
          : node.type === "VariableDeclaration" && node.kind !== "var"
            ? node.declarations.map((d) => d.id.name).filter(Boolean)
            : [];
      // A second const/let is a load error; a second function silently replaces the first.
      for (const name of names) seen.has(name) ? clashes.push(`${name}: ${seen.get(name)} and ${file}`) : seen.set(name, file);
    }
  assert.deepEqual(clashes, []);
});
