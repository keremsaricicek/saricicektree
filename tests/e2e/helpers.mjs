// Shared accounts and API helpers for the browser tests.
import {request} from '@playwright/test';

export const BASE = 'http://localhost:3998';
export const USERS = {
  owner: {email: 'owner@test.local', password: 'Test-Parola-2026!', name: 'Test Yönetici'},
  ayse: {email: 'ayse@test.local', password: 'Ayse-Parola-2026!', name: 'Ayşe Sarıçiçek'},
  mehmet: {email: 'mehmet@test.local', password: 'Mehmet-Parola-2026!', name: 'Mehmet Sarıçiçek'},
};
export const authFile = (key) => `tests/e2e/.auth/${key}.json`;

/** API client bound to one signed-in account (cookie + CSRF token). */
export async function apiAs(key) {
  const ctx = await request.newContext({baseURL: BASE, storageState: authFile(key), extraHTTPHeaders: {origin: BASE}});
  const me = await (await ctx.get('/api/me')).json();
  const call = async (path, method = 'GET', data) => {
    const body = data ?? (method === 'GET' ? undefined : {});
    const res = await ctx.fetch(path, {method, data: body, headers: {'x-csrf-token': me.csrf || ''}});
    const type = res.headers()['content-type'] || '';
    return {status: res.status(), body: type.includes('json') ? await res.json() : await res.body()};
  };
  return {ctx, me, call};
}

/** Opens a route and waits until the signed-in app has loaded its family data. */
export async function openApp(page, route = 'home') {
  await page.goto('/#' + route);
  await page.waitForFunction(() => typeof state !== 'undefined' && state?.user && document.querySelector('.content, main'));
}
