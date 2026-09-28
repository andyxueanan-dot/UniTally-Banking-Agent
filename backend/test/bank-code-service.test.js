const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BankService } = require('../bank/service');
const { createBankStore } = require('../bank/store');
const { createBankApp } = require('../bank-server');
const ADD = '(module (func (export "calculate") (param i64 i64) (result i64) local.get 0 local.get 1 i64.add))';
function fixture() { return new BankService({ store: createBankStore(), planner: { configured: false, model: 'none' } }); }
test('actual isolated calculation has no financial, credential or model side effects', async () => {
  const service = fixture(); const { token } = service.create(); const result = await service.compute(token, { wat: ADD, inputs: [100, 25] });
  assert.equal(result.calculation.ok, true); assert.equal(result.calculation.result, '125'); assert.equal(result.calculation.metrics.trustedForLedger, false);
  assert.equal(result.state.balance, 1286000); assert.equal(result.state.tasks.length, 0); assert.equal(result.state.ledger.length, 0); assert.equal(service.metadata().aiCallsToday, 0);
  assert.equal(result.state.audit[0].event, 'UNTRUSTED_CODE_CALCULATION'); assert.equal(JSON.stringify(result.state).includes(ADD), false);
});
test('failed code cannot change account and calculation quota does not block bank queries', async () => {
  const service = fixture(); const { token } = service.create();
  for (let i = 0; i < 8; i++) { const r = await service.compute(token, { wat: ADD, inputs: ['bad', 0] }); assert.equal(r.calculation.ok, false); }
  await assert.rejects(service.compute(token, { wat: ADD, inputs: [1, 2] }), { code: 'CALCULATION_LIMIT' });
  const r = await service.chat(token, { text: '离线余额查询', demo: 'balance' }); assert.equal(r.state.balance, 1286000);
  await assert.rejects(service.compute('x'.repeat(64), { wat: ADD, inputs: [1, 2] }), { code: 'SESSION_REQUIRED' });
});
test('HTTP sandbox status probes real runtime, requires session and keeps root routes bank-only', async t => {
  const { app } = createBankApp({ store: createBankStore(), planner: { configured: false, model: 'none' } });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); }); const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/bank/sandbox/status`)).status, 401);
  const secureHeaders = await fetch(`${base}/api/bank/health`);
  assert.match(secureHeaders.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.match(secureHeaders.headers.get('permissions-policy'), /publickey-credentials-get=\(self\)/);
  for (const route of ['/', '/index.html']) { const r = await fetch(`${base}${route}`, { redirect: 'manual' }); assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/bank-agent'); }
  const session = await (await fetch(`${base}/api/bank/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
  const status = await (await fetch(`${base}/api/bank/sandbox/status`, { headers: { Authorization: `Bearer ${session.token}` } })).json();
  assert.equal(status.installed, true); assert.equal(status.limits.memoryBytes, 131072); assert.equal(status.trustedForLedger, false);
});
