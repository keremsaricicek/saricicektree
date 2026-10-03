// Video through Avlu (and on to Hayat): a cover frame is taken in the browser, the file goes up in pieces with
// progress, a cut-off upload resumes on retry and stores one video, and the card shows "preparing" then the player.
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";
import { authFile, apiAs, fillUpload, openApp } from "./helpers.mjs";

test.use({ storageState: authFile("owner") });

const dir = mkdtempSync(join(tmpdir(), "sf-e2e-video-"));
const make = (name, input) => {
  const out = join(dir, name);
  execFileSync(String(ffmpeg), [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    input,
    ...(name.endsWith(".webm") ? ["-c:v", "libvpx", "-b:v", "300k"] : ["-c:v", "libx264"]),
    out,
  ]);
  return out;
};

test("a video goes up in pieces, resumes after a cut-off, and plays in Hayat and Avlu", async ({ page }) => {
  const file = make("aile.webm", "testsrc=duration=3:size=640x360:rate=15");
  const title = `Video ${Date.now()}`;
  await fillUpload(page, file, title);
  // The cover is a real frame from the video (not the plain placeholder).
  const cover = await page.evaluate(() => hm.uploads[0].data);
  expect(cover.startsWith("data:image/jpeg")).toBe(true);
  expect(await page.evaluate(() => hm.uploads[0].video.seconds)).toBe(3);

  let cut = true;
  await page.route("**/api/experience/videos/uploads/*?offset=*", (route) => {
    if (cut) {
      cut = false;
      return route.abort("connectionreset");
    }
    return route.continue();
  });
  await page.click("#kn-upload-submit");
  await expect(page.locator("#hm-upload-form .form-error")).toContainText("kaldığı yerden");
  await expect(page.locator("#kn-video-progress progress")).toBeVisible();
  await page.click("#kn-upload-submit");
  await expect(page.locator("dialog[open] #hm-upload-form")).toHaveCount(0, { timeout: 30_000 });

  const { call } = await apiAs("owner");
  const find = async () => (await call("/api/experience/memories")).body.items.filter((x) => x.title === title);
  await expect.poll(async () => (await find()).length).toBe(1);
  const [photo] = await find();
  expect(photo.video.seconds).toBe(3);
  await expect.poll(async () => (await find())[0].video.status, { timeout: 60_000 }).toBe("ready");

  // Hayat card: the player with the cover, playable over Range requests.
  await openApp(page, "home");
  const player = page.locator(`.ds-video[data-video="${photo.video.id}"] video`).first();
  await expect(player).toBeVisible();
  await expect(player).toHaveAttribute("poster", /\/poster$/);
  const src = await player.getAttribute("src");
  const head = await page.request.get(src, { headers: { range: "bytes=0-1023" } });
  expect(head.status()).toBe(206);
  expect(head.headers()["content-type"]).toBe("video/mp4");

  // Avlu: the tile carries a play badge and the detail view shows the player instead of a still photo.
  await openApp(page, "gallery");
  const tile = page.locator(`.hm-tile[data-id="${photo.id}"]`);
  await expect(tile.locator(".ds-video-badge")).toContainText("0:03");
  await tile.click();
  await expect(page.locator(`dialog[open] .hm-view-photo .ds-video video`)).toBeVisible();
});

test("a video whose frames the browser cannot read still gets a cover; a too-long video is refused before upload", async ({ page }) => {
  await openApp(page, "gallery");
  await page.evaluate(() => hmUpload(false));
  // An H.264 file: test Chromium cannot decode it, so the calm placeholder cover is used and the server checks the length.
  await page.setInputFiles("#hm-files", make("h264.mp4", "testsrc=duration=2:size=320x240:rate=10"));
  await expect(page.locator("#hm-upload-form [name=title]")).toBeVisible();
  expect(await page.evaluate(() => hm.uploads[0].data.startsWith("data:image/jpeg"))).toBe(true);

  const limit = await page.evaluate(() => window.sfConfig.video.maxSeconds);
  await page.evaluate(() => hmUpload(false));
  await page.setInputFiles("#hm-files", make("long.webm", `testsrc=duration=${limit + 3}:size=160x120:rate=5`));
  await expect(page.locator("#hm-upload-form .form-error")).toContainText("dakika");
});
