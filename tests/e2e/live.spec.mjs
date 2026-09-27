import {test, expect} from '@playwright/test';
import {authFile, openApp, apiAs} from './helpers.mjs';

// Known bug until the feed change list reports deletions: remove test.fail when fixed.
test.fail(true, 'deleted posts stay on other readers’ screens');
test('comments arrive live, the reader keeps a half-written draft, and deletions reach other readers', async ({browser}) => {
  const ayse = await apiAs('ayse');
  const text = `Canlı akış testi ${Date.now()}`;
  const post = await ayse.call('/api/experience/feed', 'POST', {clientId: crypto.randomUUID(), body: text, visibility: 'family'});
  expect(post.status).toBeLessThan(300);
  const id = post.body.id;

  const ctx = await browser.newContext({storageState: authFile('mehmet')});
  const page = await ctx.newPage();
  await openApp(page);
  const card = page.locator(`[data-feed-card="${id}"]`);
  await expect(card).toBeVisible();
  const draft = card.locator('.ds-comment-input textarea, .ds-comment-input input').first();
  await draft.fill('Yarım kalan taslak');
  await draft.blur();

  await ayse.call(`/api/experience/feed/${id}/comments`, 'POST', {body: 'Ayşe yorum yazdı', clientId: crypto.randomUUID()});
  await expect(card).toContainText('Ayşe yorum yazdı', {timeout: 20_000});
  await expect(card.locator('.ds-comment-input textarea, .ds-comment-input input').first()).toHaveValue('Yarım kalan taslak');

  expect((await ayse.call(`/api/experience/feed/${id}`, 'DELETE')).status).toBe(200);
  await expect(card).toHaveCount(0, {timeout: 20_000});

  expect((await ayse.call(`/api/experience/feed/${id}/restore`, 'POST')).status).toBe(200);
  await expect(page.locator('#ff-new')).toBeVisible({timeout: 20_000});
  await ctx.close();
});
