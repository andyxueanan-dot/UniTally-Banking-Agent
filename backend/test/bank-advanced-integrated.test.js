const riskFixture = require('./risk-fixtures.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BankService } = require('../bank/service');
const { createBankStore } = require('../bank/store');
function fixture() {
  let now = Date.parse('2026-09-26T10:00:00Z');
  const sent = [];
  const planner = { configured: true, model: 'test-double', plan: async text => { sent.push(text); return { actions: [{ type: 'transfer', recipient: '王明', amount: '200' }], question: '', meta: { mode: 'test', totalTokens: 0, latencyMs: 0 } }; } };
  const store = createBankStore(); const service = new BankService({ store, planner, now: () => now, limits: { commandsPerMinute: 100 } }); const { token } = service.create();
  return { service, store, token, sent, now: () => now, tick: ms => now += ms,
    state: () => service.get(token), task: () => service.get(token).tasks[0], manual: a => service.prepareManual(token, a),
    confirm() { const t = service.get(token).tasks[0]; const code = t.risk === 'red' ? service.challenge(token, t.id).demoCode : undefined; return service.confirm(token, t.id, { confirmed: true, code }); },
  };
}
test('AA request does not imply payment; manual explicit simulation uses separate pool and is idempotent', async () => {
  const f = fixture(); await f.manual({ type: 'aa_request', amount: '240', participants: ['王明', '李悦'], includeSelf: true }); f.confirm();
  assert.equal(f.state().balance, 1286000); const request = f.state().advanced.requests[0]; assert.equal(request.collectedCents, 0);
  const participant = request.shares.find(s => s.participantId === 'wang');
  await f.manual({ type: 'simulate_aa_payment', requestId: request.id, participantId: participant.participantId, simulation: true });
  assert.equal(f.state().balance, 1286000); f.confirm(); assert.equal(f.state().balance, 1294000);
  f.confirm(); assert.equal(f.state().ledger.length, 1); assert.equal(f.service.metadata().aiCallsToday, 0);
});
test('the AI tool schema cannot declare that someone else paid', async () => {
  const { validatePlan } = require('../bank/planner');
  assert.throws(() => validatePlan({ actions: [{ type: 'simulate_aa_payment', requestId: 'fake', participantId: 'wang', simulation: true }], question: '' }), { code: 'INVALID_AI_PLAN' });
});
test('birthday reserve, order, payment and release keep cash and available funds consistent', async () => {
  const f = fixture(); const future = new Date(f.now() + 86400000).toISOString();
  await f.manual({ type: 'reserve_budget', amount: '1000', label: '虚构生日预算', eventAt: future }); f.confirm();
  assert.equal(f.state().balance, 1286000); assert.equal(f.state().available, 1186000); const budget = f.state().advanced.budgets[0];
  await f.manual({ type: 'transfer', amount: '12000', recipient: '王明' }); assert.equal(f.state().history.at(-1).results[0].code, 'INSUFFICIENT_FUNDS');
  await f.manual({ type: 'prepare_merchant_order', budgetId: budget.id, productId: 'flower-demo', deliveryAt: future }); f.confirm();
  const order = f.state().advanced.orders[0]; assert.equal(order.status, 'PREPARED');
  await f.manual({ type: 'pay_merchant_order', orderId: order.id }); assert.equal(f.task().risk, 'red'); f.confirm();
  assert.equal(f.state().balance, 1266100); assert.equal(f.state().available, 1186000);
  await f.manual({ type: 'release_budget', budgetId: budget.id }); f.confirm(); assert.equal(f.state().available, 1266100);
  await f.manual({ type: 'cancel_merchant_order', orderId: order.id }); assert.equal(f.state().history.at(-1).results[0].code, 'ORDER_ALREADY_PAID');
});
test('a due schedule requires new authorization and cannot generate a second payment after success', async () => {
  const f = fixture(); const future = new Date(f.now() + 3600000).toISOString();
  await f.manual({ type: 'schedule_transfer', recipient: '王明', amount: '200', executeAt: future }); assert.equal(f.task().risk, 'red'); f.confirm();
  const schedule = f.state().advanced.schedules[0]; assert.equal(f.state().balance, 1286000);
  const action = { type: 'transfer', recipient: '王明', amount: '200', scheduleId: schedule.id };
  await f.manual(action); assert.equal(f.state().history.at(-1).results[0].code, 'SCHEDULE_NOT_DUE');
  f.tick(3600001); assert.equal(f.state().advanced.schedules[0].effectiveStatus, 'DUE'); assert.equal(f.state().balance, 1286000);
  await f.manual(action); assert.equal(f.task().status, 'AWAITING_CONFIRMATION'); f.confirm();
  assert.equal(f.state().balance, 1266000); assert.equal(f.state().advanced.schedules[0].status, 'COMPLETED');
  await f.manual(action); assert.equal(f.state().history.at(-1).results[0].code, 'SCHEDULE_NOT_DUE'); assert.equal(f.state().ledger.length, 1);
});
test('formatted fake phone resolves locally while unknown private numbers stay blocked', async () => {
  const f = fixture(); await f.service.chat(f.token, { text: '给演示手机号00000001028转200元' });
  assert.equal(f.sent[0].includes('00000001028'), false); assert.match(f.sent[0], /王明/);
  await f.manual({ type: 'transfer', recipient: '00000001028', amount: '200' }); assert.equal(f.task().action.recipientId, 'wang');
  await assert.rejects(f.service.chat(f.token, { text: '给13800138000转200元' }), { code: 'PRIVATE_DATA_BLOCKED' });
});
test('opaque local IDs with long decimal runs are not mistaken for real account data in manual mode', async () => {
  const f = fixture(); await f.manual({ type: 'risk_assessment', questionnaireVersion: riskFixture.VERSION, answers: riskFixture.MID }); f.confirm();
  await f.manual({ type: 'wealth_buy', productId: 'demo-flex', amount: '100' }); f.confirm();
  const fixedId = 'POS-123456789012abcdef123456';
  f.store.transact(db => { Object.values(db.sessions)[0].business.positions[0].id = fixedId; });
  await f.manual({ type: 'wealth_redeem', positionId: fixedId, amount: '100' }); f.confirm(); assert.equal(f.state().balance, 1286000);
});
