// Explicitly opt into integration checks on a dedicated Neon branch, never on local ledger files.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const root = path.resolve(__dirname, '..');
require('../backend/node_modules/dotenv').config({ path: path.join(root, 'backend/.env.cloud.local') });
const { migrateDatabase } = require('../backend/cloud/migrate');
const { createPgStore, persistentSessions } = require('../backend/cloud/pg-store');
const { BankService } = require('../backend/bank/service');
(async () => {
  const stores = []; const report = { startedAt: new Date().toISOString(), checks: [], paidModelCalls: 0 };
  const record = (name, fn) => { fn(); report.checks.push(name); };
  const key = 'test-' + randomBytes(6).toString('hex');
  try {
    await migrateDatabase(process.env.DATABASE_URL_UNPOOLED);
    const open = () => { const s = createPgStore({ connectionString: process.env.DATABASE_URL, key }); stores.push(s); return s; };
    const a = open(); const b = open();
    record('Transactions across separate DB clients reload under row lock', () => { a.transact(s => { s.usage.test = 1; }); b.transact(s => { s.usage.test++; }); assert.equal(a.read().usage.test, 2); });
    record('Throwing transaction rolls back', () => { assert.throws(() => a.transact(s => { s.usage.test = 999; throw Error('expected'); })); assert.equal(b.read().usage.test, 2); });
    record('Promise-returning transaction rejected without mutation', () => { assert.throws(() => a.transact(s => { s.usage.test = 999; return Promise.resolve(); }), { code: 'ASYNC_TRANSACTION_REJECTED' }); assert.equal(b.read().usage.test, 2); });
    record('No mutable references escape', () => { const state = a.read(); state.usage.test = 999; assert.equal(b.read().usage.test, 2); });
    const service = new BankService({ store: a, planner: { configured: false } }); const { token } = service.create();
    const prepared = await service.prepareManual(token, { type: 'transfer', recipient: '王明', amount: '200' });
    const task = prepared.state.tasks[0];
    record('Unconfirmed transfer did not debit persisted balance', () => assert.equal(service.get(token).balance, 1286000));
    service.confirm(token, task.id, { confirmed: true });
    const other = new BankService({ store: b, planner: { configured: false } });
    record('Second instance sees committed receipt; replay does not double debit', () => { assert.equal(other.get(token).balance, 1266000); other.confirm(token, task.id, { confirmed: true }); assert.equal(service.get(token).ledger.length, 1); });
    a.close(); const restarted = open();
    record('Restart retains session, balance, ledger and usage counter', () => { const resumed = new BankService({ store: restarted, planner: { configured: false } }); assert.equal(resumed.get(token).balance, 1266000); assert.equal(restarted.read().usage.test, 2); });
    const authKey = key + '-auth'; const authA = createPgStore({ connectionString: process.env.DATABASE_URL, key: authKey }); stores.push(authA);
    const sessionA = persistentSessions(authA, 'version-one'); sessionA.set('fake-cookie-hash', Date.now() + 10000);
    const authB = createPgStore({ connectionString: process.env.DATABASE_URL, key: authKey }); stores.push(authB);
    const sessionB = persistentSessions(authB, 'version-one');
    record('Team login persists; password rotation invalidates old cookies', () => { assert.equal(sessionB.has('fake-cookie-hash'), true); assert.equal(persistentSessions(authB, 'version-two').has('fake-cookie-hash'), false); sessionB.delete('fake-cookie-hash'); assert.equal(sessionA.has('fake-cookie-hash'), false); });
    report.passed = true;
  } catch (e) { report.passed = false; report.errorCode = e.code || 'ASSERTION_OR_CONNECTION_FAILED'; process.exitCode = 1; }
  finally { for (const s of stores) s.close(); report.finishedAt = new Date().toISOString(); const out = path.resolve(root, '../evidence/T009-cloud'); fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'storage-test.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); }
})();
