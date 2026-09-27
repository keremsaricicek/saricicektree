// Test build of the mobile apps with sample data only: the single-file demo (no server, no real
// family data) becomes the app's bundled web content, and the app never contacts the live site.
//   node scripts/build-mobile-demo.mjs                 -> native-demo/ (web content)
//   node scripts/build-mobile-demo.mjs --write-config  -> also rewrites capacitor.config.json for the
//                                                         demo build (CI only; do not commit the result)
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

await import("../src/build-html.mjs");
await mkdir("native-demo", { recursive: true });
await copyFile("exports/Saricicek-Family.html", "native-demo/index.html");
await copyFile("native-www/offline.html", "native-demo/offline.html");

if (process.argv.includes("--write-config")) {
  const config = JSON.parse(await readFile("capacitor.config.json", "utf8"));
  delete config.server; // no live site: everything is bundled
  config.webDir = "native-demo";
  config.appName = "Sarıçiçek (Deneme)";
  await writeFile("capacitor.config.json", JSON.stringify(config, null, 2) + "\n");
  console.log("capacitor.config.json switched to the demo build (bundled sample data, no server).");
}
console.log("Demo web content: native-demo/index.html");
