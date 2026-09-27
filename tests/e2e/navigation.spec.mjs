import {test, expect} from '@playwright/test';
import {authFile, openApp, apiAs} from './helpers.mjs';

test.use({storageState: authFile('owner')});

test.beforeAll(async () => {
  const {call} = await apiAs('owner');
  if ((await call('/api/experience/memories')).body.items.length) return;
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5L8AAAAASUVORK5CYII=';
  await call('/api/experience/memories', 'POST', {clientId: crypto.randomUUID(), photos: [{title: 'Gezinme', date: '1980-01-02', place: 'Halfeti', description: 'x', outsiders: 'Aile dostu', peopleIds: [], data: png}]});
});

test('back closes the lightbox, then the story, then leaves the page', async ({page}) => {
  await openApp(page, 'home');
  await page.evaluate(() => { location.hash = 'gallery'; });
  await page.locator('.hm-tile').first().click();
  await expect(page.locator('#dialog[open]')).toBeVisible();
  await page.locator('.hm-marker-image > img').first().click();
  await expect(page.locator('dialog.ds-lightbox[open]')).toBeVisible();
  await page.goBack();
  await expect(page.locator('dialog.ds-lightbox')).toHaveCount(0);
  await expect(page.locator('#dialog[open]')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#dialog[open]')).toHaveCount(0);
  await expect(page).toHaveURL(/#gallery$/);
  await page.goBack();
  await expect(page).toHaveURL(/#home$/);
});

test('closing a window and moving on at once never bounces back to the old page', async ({page}) => {
  await openApp(page, 'gallery');
  await page.locator('.hm-tile').first().click();
  await expect(page.locator('#dialog[open]')).toBeVisible();
  // Close and navigate in the same moment, as a quick double tap would.
  await page.evaluate(() => { dialog.close(); location.hash = 'calendar'; });
  await expect(page).toHaveURL(/#calendar$/);
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/#calendar$/);
  await page.goBack();
  await expect(page).toHaveURL(/#gallery$/);
  await expect(page.locator('#dialog[open]')).toHaveCount(0);
});

test('a closed window leaves no dead back step behind', async ({page}) => {
  test.fixme(true, 'known bug: closing a window races with the back step (fails about 3 in 4 runs)');
  await openApp(page, 'home');
  await page.evaluate(() => { location.hash = 'gallery'; });
  await page.locator('.hm-tile').first().click();
  await page.click('#dialog[open] [data-action=close]');
  await expect(page.locator('#dialog[open]')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/#home$/);
});
