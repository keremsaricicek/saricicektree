// Lint rules. The browser code is a set of classic scripts that share one global scope
// (loaded in order by index.html), so their top-level names are collected here instead of
// being listed by hand.
import js from "@eslint/js";
import globals from "globals";
import { readFileSync, readdirSync } from "node:fs";
import * as espree from "espree";

const scriptFiles = [...readdirSync("public").filter((f) => f.endsWith(".js") && f !== "sw.js"), ...readdirSync("public/ui").map((f) => "ui/" + f)];
const appGlobals = {};
for (const f of scriptFiles) {
  const ast = espree.parse(readFileSync("public/" + f, "utf8"), { ecmaVersion: "latest", sourceType: "script" });
  for (const node of ast.body) {
    if (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") appGlobals[node.id.name] = "writable";
    if (node.type === "VariableDeclaration") for (const d of node.declarations) if (d.id.type === "Identifier") appGlobals[d.id.name] = "writable";
  }
}

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "exports/**",
      "android/**",
      "ios/**",
      "native-www/**",
      "public/assets/**",
      "public/min/**",
      "worker/assets.mjs",
      ".claude/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["public/*.js", "public/ui/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser, ...appGlobals, lucide: "readonly", L: "readonly", topojson: "readonly", FamilyNative: "readonly" },
    },
    rules: {
      // Top-level functions are used by the other scripts, so only local variables are checked.
      "no-unused-vars": ["warn", { vars: "local", args: "none", caughtErrors: "none", ignoreRestSiblings: true }],
      "no-redeclare": "off",
      "no-empty": ["error", { allowEmptyCatch: false }],
    },
  },
  { files: ["public/sw.js"], languageOptions: { sourceType: "script", globals: globals.serviceworker } },
  {
    files: ["src/**/*.mjs", "worker/**/*.mjs", "scripts/**/*.mjs", "tests/**/*.mjs", "mobile/**/*.mjs", "*.mjs"],
    languageOptions: { sourceType: "module", globals: { ...globals.node, ...globals.worker } },
    rules: { "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", ignoreRestSiblings: true }], "no-empty": ["error", { allowEmptyCatch: false }] },
  },
  // Native bridge and map bundles run in the WebView/browser.
  { files: ["mobile/**/*.mjs"], languageOptions: { globals: globals.browser } },
  // Browser tests evaluate code inside the page, where the app's globals exist.
  {
    files: ["tests/e2e/**/*.mjs", "scripts/visual-snapshot.mjs", "scripts/measure-*.mjs"],
    languageOptions: { globals: { ...globals.browser, ...appGlobals } },
  },
];
