// Creates the test family once per run: the owner plus two invited members, each with a saved session.
import {request} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {BASE, USERS, authFile} from './helpers.mjs';

async function login(key) {
  const ctx = await request.newContext({baseURL: BASE, extraHTTPHeaders: {origin: BASE}});
  const res = await ctx.post('/api/login', {data: {email: USERS[key].email, password: USERS[key].password}});
  if (!res.ok()) throw Error(`Login ${key}: ${res.status()} ${await res.text()}`);
  await ctx.storageState({path: authFile(key)});
  return {ctx, csrf: (await res.json()).csrf};
}

export default async function globalSetup() {
  mkdirSync('tests/e2e/.auth', {recursive: true});
  const owner = await login('owner');
  for (const key of ['ayse', 'mehmet']) {
    const invite = await owner.ctx.post('/api/invites', {data: {email: USERS[key].email, role: 'member'}, headers: {'x-csrf-token': owner.csrf}});
    if (!invite.ok()) throw Error(`Invite ${key}: ${invite.status()} ${await invite.text()}`);
    const token = (await invite.json()).url.split('invite=')[1];
    const guest = await request.newContext({baseURL: BASE, extraHTTPHeaders: {origin: BASE}});
    const accepted = await guest.post('/api/accept-invite', {data: {token, name: USERS[key].name, password: USERS[key].password}});
    if (!accepted.ok()) throw Error(`Accept ${key}: ${accepted.status()} ${await accepted.text()}`);
    await guest.dispose();
    await login(key);
  }
  // A small tree so tagging, portraits and profiles have someone to point at.
  const people = [
    {name: 'Mehmet Sarıçiçek', birthDate: '1940-05-01', deathDate: '2019-04-12', place: 'Halfeti', country: 'Türkiye'},
    {name: 'Emine Sarıçiçek', birthDate: '1943-02-11', place: 'Halfeti', country: 'Türkiye'},
  ];
  for (const p of people) await owner.ctx.post('/api/people', {data: p, headers: {'x-csrf-token': owner.csrf}});
  await owner.ctx.dispose();
}
