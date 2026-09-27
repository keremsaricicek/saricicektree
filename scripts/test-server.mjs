// Starts the Node server on a throw-away data folder with one owner account.
// Used by the browser tests and the local test environment; never touches real family data.
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(join(tmpdir(), 'saricicek-test-'));
process.env.PORT ||= '3998';
process.env.APP_ORIGIN ||= `http://localhost:${process.env.PORT}`;
process.env.ADMIN_EMAIL ||= 'owner@test.local';
process.env.ADMIN_NAME ||= 'Test Yönetici';
process.env.ADMIN_PASSWORD ||= 'Test-Parola-2026!';

const {one} = await import('../src/db.mjs');
if (!one('SELECT id FROM users WHERE role=?', 'owner')) await import('../src/admin.mjs');
console.log(`Test data folder: ${process.env.DATA_DIR}`);
await import('../src/server.mjs');
