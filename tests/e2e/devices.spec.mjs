// Layout checks on every main page at phone, tablet and desktop size, in the light and dark theme, and at 320 px
// wide (what 400 % browser zoom leaves on a 1280 px screen, WCAG 1.4.10 reflow): nothing scrolls sideways, every
// control is at least 24×24 px (WCAG 2.5.8; 44 px is reported for phones), the dark theme passes the automated
// WCAG A/AA rules and keyboard focus is visible. These run in Chromium; they do not replace a real phone with
// VoiceOver or TalkBack (docs/PHONE-CHECKLIST.md).
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROUTES = ["home", "tree", "people", "gallery", "calendar", "history", "places", "chat", "documents", "archive", "connections", "groups"];
const SIZES = [
  ["telefon", { width: 390, height: 844 }],
  ["tablet", { width: 820, height: 1180 }],
  ["masaüstü", { width: 1440, height: 900 }],
  ["320 px yeniden akış", { width: 320, height: 640 }],
];

async function settle(page) {
  await page.evaluate(async () => {
    const left = () =>
      document.getAnimations().filter((a) => a.playState !== "finished" && a.playState !== "idle" && a.effect?.getTiming().iterations !== Infinity);
    for (let i = 0; i < 20 && left().length; i++) {
      await Promise.all(left().map((a) => a.finished.catch(() => {})));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
  });
}

/** Sideways overflow of the page, and visible controls smaller than `min` px (inline text links excepted, WCAG 2.5.8). */
const measure = (page, min) =>
  page.evaluate((min) => {
    const sideways = document.scrollingElement.scrollWidth - innerWidth;
    const small = [];
    for (const el of document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=button], summary")) {
      const r = el.getBoundingClientRect(),
        cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === "hidden" || el.closest("[hidden], .leaflet-control-attribution")) continue;
      if (cs.pointerEvents === "none" && cs.opacity === "0") continue; // shown only once there is something to send
      if (el.tagName === "A" && cs.display === "inline" && el.closest("p, li, small, .legal-links")) continue; // links inside a sentence
      if (el.type === "checkbox" || el.type === "radio" || el.type === "range") continue; // sized by their label
      if (r.width < min - 0.5 || r.height < min - 0.5)
        small.push(
          `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`,
        );
    }
    return { sideways, small };
  }, min);

for (const [name, viewport] of SIZES)
  for (const theme of ["light", "dark"])
    test(`${name}, ${theme === "dark" ? "koyu" : "açık"} tema: yatay taşma yok, dokunma hedefleri yeterli`, async ({ page }) => {
      test.setTimeout(120000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.goto("/index.html?demo=1#home");
      await expect(page.locator(".ds-post").first()).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const problems = [];
      for (const r of ROUTES) {
        await page.evaluate((r) => (location.hash = r), r);
        await expect(page.locator("main")).toBeVisible();
        await page.waitForTimeout(150);
        await settle(page);
        const { sideways, small } = await measure(page, 24);
        if (sideways > 1) problems.push(`${r}: sayfa ${sideways} px yana taşıyor`);
        problems.push(...small.map((s) => `${r}: küçük dokunma hedefi ${s}`));
        // Apple and Google recommend 44–48 px on phones; reported (not failed), since text-sized links are allowed.
        if (name === "telefon" && theme === "light")
          for (const s of (await measure(page, 44)).small) test.info().annotations.push({ type: "44 px altı", description: `${r}: ${s}` });
        if (theme === "dark" && name !== "320 px yeniden akış") {
          const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
          problems.push(...axe.violations.flatMap((v) => v.nodes.map((n) => `${r}: ${v.id} ${n.target.join(" ")}`)));
        }
      }
      expect(problems).toEqual([]);
    });

test("keyboard focus is always visible on the main controls", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/index.html?demo=1#home");
  await expect(page.locator(".ds-post").first()).toBeVisible();
  const hidden = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      // The ring may sit on the field itself or on the box around it (the comment field and the post composer).
      const shows = (x) => {
        const cs = getComputedStyle(x);
        return (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
      };
      let ring = false;
      for (let x = el, i = 0; x && i < 5 && !ring; x = x.parentElement, i++) ring = shows(x) && (x === el || x.matches(":focus-within"));
      return ring ? null : `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}"`;
    });
    if (r) hidden.push(r);
  }
  expect(hidden).toEqual([]);
});
