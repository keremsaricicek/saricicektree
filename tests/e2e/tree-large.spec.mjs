// A large family tree (600 people, built in the page from the demo data): only the cards around the visible area
// are in the page, links stay complete as a few paths, and panning, zooming out, search/focus and printing still
// show the right people.
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/index.html?demo=1#home");
  await expect(page.locator(".ds-post").first()).toBeVisible();
  await page.evaluate(() => {
    const people = [],
      relations = [];
    for (let i = 0; i < 600; i++) {
      people.push({ id: "big" + i, name: "Kişi" + i + " Sarıçiçek", birthDate: 1850 + Math.floor(Math.log2(i + 1)) * 25 + "-01-01", place: "" });
      if (i) relations.push({ id: "bigr" + i, personA: "big" + Math.floor((i - 1) / 3), personB: "big" + i, type: "parent" });
    }
    state.people = people;
    state.relations = relations;
    location.hash = "tree";
  });
  await expect(page.locator(".tree-canvas .ds-node").first()).toBeVisible();
});

const cards = (page) => page.locator(".tree-canvas .ds-node");

test("only nearby cards are drawn; links are complete; panning brings in the people there", async ({ page }) => {
  const drawn = await cards(page).count();
  expect(drawn).toBeGreaterThan(0);
  expect(drawn).toBeLessThan(150);
  // All 599 parent links are drawn, as one path.
  const links = await page.evaluate(() =>
    [...document.querySelectorAll(".tree-canvas svg path")].map((p) => [p.getAttribute("class"), p.getAttribute("d").split("M").length - 1]),
  );
  expect(links).toEqual([["ds-edge-parent", 599]]);
  // The root generation is centred and visible.
  await expect(page.locator('.ds-node[data-id="big0"]')).toBeInViewport();

  // Scroll to the far bottom-right: the people placed there appear, the ones far away are gone.
  const far = await page.evaluate(() => {
    const L = ui.treeLayout,
      [id, c] = [...L.pos].sort((a, b) => b[1].x + b[1].y - (a[1].x + a[1].y))[0],
      vp = document.querySelector(".tree-viewport");
    vp.scrollTo(c.x * zoom - 200, c.y * zoom - 200);
    return id;
  });
  await expect(page.locator(`.ds-node[data-id="${far}"]`)).toBeInViewport();
  await expect(page.locator('.ds-node[data-id="big0"]')).toHaveCount(0);
  expect(await cards(page).count()).toBeLessThan(150);
});

test("zooming out, focusing a person found by search, and printing", async ({ page }) => {
  await page.click('[data-action="zoom-fit"]');
  await expect.poll(() => cards(page).count()).toBeGreaterThan(150); // more of the tree is on screen

  await page.click('[data-action="search-tree"]');
  await page.locator("#dialog input").fill("Kişi433 ");
  await page.locator('#dialog [data-action="focus-person"][data-id="big433"]').click();
  await expect(page.locator('.ds-node[data-id="big433"]')).toBeInViewport();
  await expect(page.locator(".ds-focus-chip")).toContainText("Kişi433");

  await page.click('[data-action="tree-reset"]');
  await expect(cards(page).first()).toBeVisible();
  await page.evaluate(() => dispatchEvent(new Event("beforeprint")));
  await expect(cards(page)).toHaveCount(600);
  await page.evaluate(() => dispatchEvent(new Event("afterprint")));
  await expect.poll(() => cards(page).count()).toBeLessThan(600);
});
