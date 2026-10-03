import { cp, mkdir } from "node:fs/promises";
import { build } from "esbuild";
await mkdir("public/assets", { recursive: true });
await cp("node_modules/leaflet/dist/leaflet.js", "public/assets/leaflet.js");
await cp("node_modules/leaflet/dist/leaflet.css", "public/assets/leaflet.css");
await cp("node_modules/leaflet/dist/images", "public/assets/images", { recursive: true });
await cp("node_modules/leaflet/LICENSE", "public/assets/LEAFLET-LICENSE");
await build({ entryPoints: ["mobile/bridge.mjs"], bundle: true, format: "iife", target: "es2022", outfile: "public/assets/mobile-bridge.js", minify: true });

// Icons: only the lucide icons whose names appear in the app's own source (a superset: any
// matching word counts), with the same window.lucide.createIcons() the app already calls.
{
  const { readdirSync, readFileSync } = await import("node:fs");
  const lucide = await import("lucide");
  const pascal = (name) => name.replace(/(\w)(\w*)(_|-|\s*)/g, (m, a, b) => a.toUpperCase() + b.toLowerCase());
  const sources = [
    "public/index.html",
    ...readdirSync("public")
      .filter((f) => f.endsWith(".js"))
      .map((f) => "public/" + f),
    ...readdirSync("public/ui").map((f) => "public/ui/" + f),
  ];
  const words = new Set(sources.flatMap((f) => readFileSync(f, "utf8").match(/[a-z][a-z0-9]*(?:-[a-z0-9]+)*/g) || []));
  const used = [...new Set([...words].map(pascal).filter((n) => n in lucide.icons))].sort();
  await build({
    stdin: {
      contents: `import { createIcons, ${used.join(", ")} } from "lucide";\nconst icons = { ${used.join(", ")} };\nwindow.lucide = { createIcons: (options = {}) => createIcons({ icons, ...options }) };`,
      resolveDir: ".",
      loader: "js",
    },
    bundle: true,
    format: "iife",
    target: "es2022",
    outfile: "public/assets/lucide.min.js",
    minify: true,
    legalComments: "none",
    banner: {
      js: "/* lucide " + JSON.parse(readFileSync("node_modules/lucide/package.json", "utf8")).version + " (ISC), " + used.length + " icons used by the app */",
    },
  });
  await cp("node_modules/lucide/LICENSE", "public/assets/LUCIDE-LICENSE");
}
// World map (Natural Earth country outlines, no tile server). world-map.js is the light outline drawn first: all 241
// countries of the 1:50m set with corners smaller than a screen pixel at the world view removed (weight 0.01 square
// degrees, about 0.18° per pixel at zoom 3). world-map-detail.js is the full 1:50m outline, loaded once a map is
// zoomed in (familyWorldLayer in public/community.js). JSON.parse of a string is faster to start than a literal.
{
  const { readFileSync } = await import("node:fs");
  const { presimplify, simplify } = await import("topojson-simplify");
  const { quantize } = await import("topojson-client");
  const full = JSON.parse(readFileSync("node_modules/world-atlas/countries-50m.json", "utf8"));
  const light = quantize(simplify(presimplify(structuredClone(full)), 0.01), 1e4);
  const world = (name, topology) =>
    build({
      stdin: {
        contents: `import { feature } from "topojson-client";\nconst t = JSON.parse(${JSON.stringify(JSON.stringify(topology))});\nwindow.${name} = feature(t, t.objects.countries);`,
        resolveDir: ".",
        loader: "js",
      },
      bundle: true,
      format: "iife",
      target: "es2022",
      minify: true,
      outfile: name === "FamilyWorld" ? "public/assets/world-map.js" : "public/assets/world-map-detail.js",
    });
  await world("FamilyWorld", light);
  await world("FamilyWorldDetail", full);
}
await cp("node_modules/world-atlas/LICENSE", "public/assets/WORLD-ATLAS-LICENSE");
await cp("node_modules/topojson-client/LICENSE", "public/assets/TOPOJSON-LICENSE");

// Production stylesheet: app.css and its layered @imports in one minified file.
// Asset URLs stay external and are rebased from each source file to public/.
const { relative, resolve } = await import("node:path");
const rebase = {
  name: "rebase-urls",
  setup(b) {
    b.onResolve({ filter: /.*/ }, (a) =>
      a.kind === "url-token" && !/^(data:|#|https?:)/.test(a.path)
        ? { path: relative(resolve("public"), resolve(a.resolveDir, a.path)).split("\\").join("/"), external: true }
        : undefined,
    );
  },
};
await build({
  entryPoints: ["public/app.css"],
  bundle: true,
  minify: true,
  outfile: "public/app.bundle.css",
  plugins: [rebase],
  target: ["chrome100", "safari15", "firefox100"],
  logLevel: "warning",
});

// App scripts: minified copies in public/min/ (not committed), loaded by index.html. Each file is
// minified on its own and stays a classic script, so shared top-level names and each file's strict
// mode are unchanged. `npm run dev` serves the sources instead (DEV_SOURCES=1 in server.mjs).
{
  const { readdirSync } = await import("node:fs");
  const { rm } = await import("node:fs/promises");
  await rm("public/min", { recursive: true, force: true });
  const scripts = [...readdirSync("public").filter((f) => f.endsWith(".js") && f !== "sw.js"), ...readdirSync("public/ui").map((f) => "ui/" + f)];
  await build({ entryPoints: scripts.map((f) => "public/" + f), outdir: "public/min", outbase: "public", minify: true, target: "es2022", logLevel: "warning" });
}
