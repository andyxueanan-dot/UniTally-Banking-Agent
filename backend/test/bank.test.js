const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createBankStore } = require('../bank/store');
const { BankService, cents } = require('../bank/service');
const { createDeepSeekPlanner, validatePlan } = require('../bank/planner');
const { createBankApp } = require('../bank-server');

function fixture({ file, maxDailyCalls = 80 } = {}) {
  let time = Date.parse('2026-09-23T10:00:00Z');
  let actions = [];
  const store = createBankStore(file);
  const planner = { configured: true, model: 'test-double-not-real-AI', plan: async () => ({ actions, question: '', meta: { mode: 'test', latencyMs: 0, totalTokens: 0 } }) };
  const service = new BankService({ store, planner, now: () => time, maxDailyCalls });
  const { token } = service.create();
  return { service, store, planner, token, tick: (ms = 2000) => time += ms,
    async plan(nextActions, opts = {}) { actions = nextActions; time += 2000; return service.chat(token, { text: '测试输入（非真实 AI）', ...opts }); },
    latest() { return service.get(token).tasks[0]; },
  };
}
const transfer = (amount = '200', recipient = '王明') => ({ type: 'transfer', amount, recipient });
const freeze = { type: 'freeze_card', cardLast4: '8806' };

test('amount parser uses integer cents and rejects dangerous formats', () => {
  assert.equal(cents('0.01'), 1); assert.equal(cents('999.99'), 99999);
  for (const value of ['-1', '0', '0.00', '1.001', '1e3', 'NaN', '1,000', '01', '1000001', 200, null]) assert.throws(() => cents(value), { code: 'INVALID_AMOUNT' });
});
test('new sessions have independent fictional accounts and no shared history', () => {
  const f = fixture(); const second = f.service.create(); assert.notEqual(f.token, second.token);
  assert.equal(f.service.get(f.token).balance, 1286000); assert.equal(second.state.history.length, 0);
  assert.throws(() => f.service.get('a'.repeat(64)), { code: 'SESSION_REQUIRED' });
});
test('green analysis has exact source-grounded totals and duplicate candidates, no write', async () => {
  const f = fixture(); const response = await f.plan([{ type: 'analyze', period: 'compare' }]);
  const result = response.message.results[0];
  assert.equal(result.total, 112500); assert.equal(result.previous, 51400);
  assert.equal(result.rows.length, 14); assert.equal(result.anomalyIds.length, 1);
  assert.equal(response.state.tasks.length, 0); assert.equal(response.state.balance, 1286000);
});
test('yellow draft does not move funds; explicit confirmation does, exactly once', async () => {
  const f = fixture(); await f.plan([transfer()]); const t = f.latest();
  assert.equal(t.risk, 'yellow'); assert.equal(f.service.get(f.token).balance, 1286000);
  assert.throws(() => f.service.confirm(f.token, t.id, {}), { code: 'CONFIRMATION_REQUIRED' });
  const result = f.service.confirm(f.token, t.id, { confirmed: true });
  assert.equal(result.task.status, 'SUCCEEDED'); assert.equal(result.state.balance, 1266000);
  assert.equal(result.state.ledger.length, 1);
  assert.equal(f.service.confirm(f.token, t.id, { confirmed: true }).idempotent, true);
  assert.equal(f.service.get(f.token).ledger.length, 1);
  const internal = Object.values(f.store.read().sessions)[0]; assert.equal(internal.contacts[0].balance, 20000);
});
test('request parameters cannot tamper with immutable confirmation target or amount', async () => {
  const f = fixture(); await f.plan([transfer()]); const t = f.latest();
  const result = f.service.confirm(f.token, t.id, { confirmed: true, cents: 999999, recipientId: 'li', risk: 'green' });
  assert.equal(result.state.balance, 1266000); assert.equal(result.task.action.recipientId, 'wang');
});
test('new write intent invalidates old task and its challenge', async () => {
  const f = fixture(); await f.plan([transfer('1200')]); const old = f.latest(); f.service.challenge(f.token, old.id);
  await f.plan([transfer('300')]);
  assert.throws(() => f.service.confirm(f.token, old.id, { confirmed: true, code: '123456' }), { code: 'TASK_NOT_ACTIONABLE' });
  assert.equal(f.service.get(f.token).tasks[1].status, 'SUPERSEDED');
});
test('a multi-write plan creates a dependency workflow with only one active authorization', async () => {
  const f = fixture(); const r = await f.plan([transfer(), freeze]);
  assert.equal(r.state.tasks.length, 1); assert.equal(r.state.workflows.length, 1);
  assert.equal(r.state.workflows[0].nodes[1].status, 'PENDING'); assert.equal(r.state.balance, 1286000);
});
test('a changed but ambiguous write request also invalidates the old draft', async () => {
  const f = fixture(); await f.plan([transfer()]); const old = f.latest();
  await f.plan([transfer('300', '陈晨')]); assert.equal(f.latest().status, 'SUPERSEDED');
  assert.throws(() => f.service.confirm(f.token, old.id, { confirmed: true }), { code: 'TASK_NOT_ACTIONABLE' });
});
test('foreign currency and scheduled requests cannot silently become immediate CNY transfers', async () => {
  const f = fixture();
  const foreign = await f.plan([transfer()], { text: '给王明转200美元' }); assert.equal(foreign.state.tasks.length, 0); assert.match(foreign.message.text, /不支持外币/);
  const future = await f.plan([transfer()], { text: '明天给王明转200元' }); assert.equal(future.state.tasks.length, 0); assert.match(future.message.text, /预约/);
});
test('exact daily 1000 threshold remains yellow; next cent requires red verification', async () => {
  const f = fixture(); await f.plan([transfer('1000')]); assert.equal(f.latest().risk, 'yellow');
  f.service.confirm(f.token, f.latest().id, { confirmed: true });
  await f.plan([transfer('0.01')]); assert.equal(f.latest().risk, 'red');
  const denied = f.service.confirm(f.token, f.latest().id, { confirmed: true });
  assert.equal(denied.error.code, 'VERIFICATION_REQUIRED'); assert.equal(denied.state.balance, 1186000);
});
test('600 + 500 uses red; spending accounting uses China calendar day', async () => {
  const f = fixture(); await f.plan([transfer('600')]); f.service.confirm(f.token, f.latest().id, { confirmed: true });
  await f.plan([transfer('500')]); assert.equal(f.latest().risk, 'red');
  f.tick(24 * 3600000); assert.equal(f.service.get(f.token).dailyTransferred, 0);
});
test('red card action requires task-bound unexpired challenge; no code leaks in state', async () => {
  const f = fixture(); await f.plan([freeze]); const t = f.latest();
  assert.equal(t.risk, 'red'); assert.equal(f.service.confirm(f.token, t.id, { confirmed: true }).error.code, 'VERIFICATION_REQUIRED');
  const challenge = f.service.challenge(f.token, t.id);
  assert.match(challenge.demoCode, /^\d{6}$/); assert.equal(f.latest().challenge, undefined);
  const result = f.service.confirm(f.token, t.id, { confirmed: true, code: challenge.demoCode });
  assert.equal(result.state.cards[0].status, 'FROZEN'); assert.equal(result.state.balance, 1286000);
});
test('expired challenge cannot authorize transaction', async () => {
  const f = fixture(); await f.plan([freeze]); const t = f.latest(); const ch = f.service.challenge(f.token, t.id);
  f.tick(121000); assert.equal(f.service.confirm(f.token, t.id, { confirmed: true, code: ch.demoCode }).error.code, 'VERIFICATION_REQUIRED');
});
test('three bad verifications lock sensitive operations while queries remain available', async () => {
  const f = fixture(); await f.plan([freeze]); const t = f.latest(); f.service.challenge(f.token, t.id);
  for (let i = 0; i < 3; i++) f.service.confirm(f.token, t.id, { confirmed: true, code: '000000' });
  assert.throws(() => f.service.challenge(f.token, t.id), { code: 'SAFETY_LOCKED' });
  const response = await f.plan([{ type: 'balance' }]); assert.equal(response.message.results[0].type, 'balance');
  const blocked = await f.plan([transfer()]); assert.equal(blocked.message.results[0].code, 'SAFETY_LOCKED');
  f.tick(301000);
  assert.throws(() => f.service.challenge(f.token, t.id), { code: 'TASK_NOT_ACTIONABLE' });
  await f.plan([freeze]);
  assert.match(f.service.challenge(f.token, f.latest().id).demoCode, /^\d{6}$/);
});
test('ambiguous and unknown contacts never become executable proposals', async () => {
  const f = fixture(); const r = await f.plan([transfer('100', '陈晨')]); assert.match(r.message.text, /3801、9526/); assert.equal(r.state.tasks.length, 0);
  const unknown = await f.plan([transfer('100', '不存在')]); assert.match(unknown.message.text, /未找到/);
  const resolved = await f.plan([transfer('100', '9526')]); assert.equal(resolved.state.tasks[0].action.recipientId, 'chen2');
});
test('missing amount or card identifier triggers clarification', async () => {
  const f = fixture(); const r = await f.plan([{ type: 'transfer', recipient: '王明' }]); assert.equal(r.state.tasks.length, 0);
  const c = await f.plan([{ type: 'freeze_card' }]); assert.match(c.message.text, /8806/); assert.equal(c.state.tasks.length, 0);
});
test('insufficient available balance is rejected before proposing a task', async () => {
  const f = fixture(); const r = await f.plan([transfer('99999')]); assert.equal(r.message.results[0].code, 'INSUFFICIENT_FUNDS'); assert.equal(r.state.balance, 1286000);
});
test('timeout reserves funds and daily limit; reconciliation settles once without retry transfer', async () => {
  const f = fixture(); await f.plan([transfer()], { simulateTimeout: true }); const t = f.latest();
  const r = f.service.confirm(f.token, t.id, { confirmed: true });
  assert.equal(r.task.status, 'PENDING_REVIEW'); assert.equal(r.task.receipt, undefined);
  assert.equal(r.state.balance, 1286000); assert.equal(r.state.available, 1266000); assert.equal(r.state.dailyTransferred, 20000);
  assert.equal(f.service.confirm(f.token, t.id, { confirmed: true }).state.ledger.length, 0);
  assert.throws(() => f.service.cancel(f.token, t.id), { code: 'CANNOT_CANCEL' });
  const settled = f.service.reconcile(f.token, t.id); assert.equal(settled.state.balance, 1266000); assert.equal(settled.state.available, 1266000);
  assert.equal(f.service.reconcile(f.token, t.id).idempotent, true); assert.equal(f.service.get(f.token).ledger.length, 1);
});
test('cannot spend money reserved by a pending transfer', async () => {
  const f = fixture(); await f.plan([transfer('12000')], { simulateTimeout: true }); const t = f.latest();
  const c = f.service.challenge(f.token, t.id); f.service.confirm(f.token, t.id, { confirmed: true, code: c.demoCode });
  const r = await f.plan([transfer('1000')]); assert.equal(r.message.results[0].code, 'INSUFFICIENT_FUNDS');
});
test('cancel and expiry never execute; completed transfers cannot be undone', async () => {
  const f = fixture(); await f.plan([transfer()]); const t = f.latest(); f.service.cancel(f.token, t.id);
  assert.throws(() => f.service.confirm(f.token, t.id, { confirmed: true }), { code: 'TASK_NOT_ACTIONABLE' });
  await f.plan([transfer()]); f.tick(601000); assert.equal(f.latest().status, 'EXPIRED');
  assert.throws(() => f.service.confirm(f.token, f.latest().id, { confirmed: true }), { code: 'TASK_EXPIRED' });
});
test('cross-session task access is rejected for every sensitive operation', async () => {
  const f = fixture(); await f.plan([transfer()]); const other = f.service.create();
  for (const action of ['challenge', 'confirm', 'cancel', 'reconcile']) assert.throws(() => f.service[action](other.token, f.latest().id, { confirmed: true }), { code: 'TASK_NOT_FOUND' });
});
test('card freeze, unfreeze and limit adjustment are functional', async () => {
  const f = fixture();
  for (const action of [freeze, { type: 'unfreeze_card', cardLast4: '8806' }, { type: 'card_limit', cardLast4: '8806', limit: '500' }]) {
    await f.plan([action]); const t = f.latest(); const ch = f.service.challenge(f.token, t.id); f.service.confirm(f.token, t.id, { confirmed: true, code: ch.demoCode });
  }
  assert.equal(f.service.get(f.token).cards[0].status, 'ACTIVE'); assert.equal(f.service.get(f.token).cards[0].limit, 50000);
});
test('persistent store restores receipts, balances and sessions after service recreation', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unitally-bank-test-')); const file = path.join(dir, 'state.json');
  const f = fixture({ file }); await f.plan([transfer()]); const t = f.latest(); f.service.confirm(f.token, t.id, { confirmed: true });
  const restored = new BankService({ store: createBankStore(file), planner: f.planner });
  assert.equal(restored.get(f.token).balance, 1266000); assert.equal(restored.get(f.token).tasks[0].receipt.id, f.latest().receipt.id);
});
test('store rolls back a throwing mutation rather than keeping half an operation', () => {
  const store = createBankStore(); assert.throws(() => store.transact(s => { s.sessions.partial = {}; throw Error('failure'); }));
  assert.deepEqual(store.read().sessions, {});
});
test('AI budget persists across sessions; no paid calls in offline mode', async () => {
  const f = fixture({ maxDailyCalls: 1 }); await f.plan([{ type: 'balance' }]);
  await assert.rejects(f.plan([{ type: 'balance' }]), { code: 'AI_BUDGET_LIMIT' });
  await f.service.chat(f.token, { text: '固定案例', demo: 'analysis' }); assert.equal(f.service.metadata().aiCallsToday, 1);
});
test('disallowed tools, injected authority fields and malformed model amounts are rejected', async () => {
  assert.throws(() => validatePlan({ actions: [{ type: 'execute_shell' }], question: '' }), { code: 'INVALID_AI_PLAN' });
  assert.throws(() => validatePlan({ actions: [{ type: 'transfer', confirmed: true }], question: '' }), { code: 'INVALID_AI_PLAN' });
  const f = fixture(); const r = await f.plan([transfer('-200')]); assert.equal(r.message.results[0].code, 'INVALID_AMOUNT');
});
test('plausible secrets and full account numbers are not sent to model', async () => {
  const f = fixture();
  await assert.rejects(f.service.chat(f.token, { text: 'sk-thisIsAFakeSecretForTestOnly' }), { code: 'PRIVATE_DATA_BLOCKED' });
  await assert.rejects(f.service.chat(f.token, { text: '银行卡 6222021234567890' }), { code: 'PRIVATE_DATA_BLOCKED' });
  assert.equal(f.service.metadata().aiCallsToday, 0);
});
test('DeepSeek error paths do not fabricate success and never leak provider response body', async () => {
  const p = createDeepSeekPlanner({ apiKey: 'test-only', fetchImpl: async () => ({ ok: false, status: 401 }) });
  await assert.rejects(p.plan('查询余额', []), { code: 'AI_KEY_INVALID' });
  const missing = createDeepSeekPlanner(); await assert.rejects(missing.plan('test', []), { code: 'AI_NOT_CONFIGURED' });
  const malformed = createDeepSeekPlanner({ apiKey: 'test-only', fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '转账成功了' } }] }) }) });
  await assert.rejects(malformed.plan('test', []), { code: 'INVALID_AI_PLAN' });
});
test('HTTP application enforces session ownership, host and origin; serves health without secrets', async t => {
  const f = fixture(); const { app } = createBankApp({ store: f.store, planner: f.planner });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.on('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/bank/state`)).status, 401);
  assert.equal((await fetch(`${base}/api/bank/health`, { headers: { Origin: 'https://evil.example' } })).status, 403);
  const invalidHostStatus = await new Promise((resolve, reject) => { const req = http.get(`${base}/api/bank/health`, { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); });
  assert.equal(invalidHostStatus, 403);
  const health = await (await fetch(`${base}/api/bank/health`)).text(); assert.ok(!health.includes('apiKey')); assert.ok(!health.includes('sk-'));
  const session = await (await fetch(`${base}/api/bank/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
  const response = await fetch(`${base}/api/bank/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ text: '离线转账示例', demo: 'transfer' }) });
  const planned = await response.json(); assert.equal(response.status, 200); assert.equal(planned.state.tasks[0].risk, 'yellow');
  const confirmed = await fetch(`${base}/api/bank/tasks/${planned.state.tasks[0].id}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, body: '{"confirmed":true}' });
  assert.equal((await confirmed.json()).state.balance, 1266000);
});
