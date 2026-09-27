import { cp, mkdir } from "node:fs/promises";
import { build } from "esbuild";
await mkdir("public/assets", { recursive: true });
await cp("node_modules/leaflet/dist/leaflet.js", "public/assets/leaflet.js");
await cp("node_modules/leaflet/dist/leaflet.css", "public/assets/leaflet.css");
await cp("node_modules/leaflet/dist/images", "public/assets/images", { recursive: true });
await cp("node_modules/leaflet/LICENSE", "public/assets/LEAFLET-LICENSE");
await build({ entryPoints: ["mobile/bridge.mjs"], bundle: true, format: "iife", target: "es2022", outfile: "public/assets/mobile-bridge.js", minify: true });

await build({ entryPoints: ["mobile/world-map.mjs"], bundle: true, format: "iife", target: "es2022", outfile: "public/assets/world-map.js", minify: true });
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
