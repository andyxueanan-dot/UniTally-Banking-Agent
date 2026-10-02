const riskFixture = require('./risk-fixtures.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BankService } = require('../bank/service');
const { createBankStore } = require('../bank/store');
function fixture() {
  let now = Date.parse('2026-09-26T10:00:00Z');
  let actions = [];
  const planner = { configured: true, model: 'integration-test-double', plan: async () => ({ actions, question: '', meta: { mode: 'test', totalTokens: 0, latencyMs: 0 } }) };
  const service = new BankService({ store: createBankStore(), planner, now: () => now, limits: { commandsPerMinute: 100 } });
  const { token } = service.create();
  return { service, token, tick: ms => now += ms,
    state: () => service.get(token), task: () => service.get(token).tasks[0],
    manual: action => service.prepareManual(token, action),
    async plan(value) { actions = value; return service.chat(token, { text: '完整集成流程（虚构测试）' }); },
    confirm(task = service.get(token).tasks[0]) { const code = task.risk === 'red' ? service.challenge(token, task.id).demoCode : undefined; return service.confirm(token, task.id, { confirmed: true, code }); },
  };
}
test('graph read -> transfer -> read is controlled by actual backend task settlement', async () => {
  const f = fixture(); await f.plan([{ type: 'balance' }, { type: 'transfer', recipient: '王明', amount: '200' }, { type: 'cards' }]);
  let flow = f.state().workflows[0]; assert.equal(flow.nodes[0].status, 'SUCCEEDED'); assert.equal(flow.nodes[1].status, 'WAITING_CONFIRMATION'); assert.equal(flow.nodes[2].status, 'PENDING');
  f.service.workflowControl(f.token, flow.id, 'advance'); assert.equal(f.state().tasks.length, 1);
  f.confirm(); assert.equal(f.state().balance, 1266000); assert.equal(f.state().workflows[0].nodes[2].status, 'PENDING');
  f.service.workflowControl(f.token, flow.id, 'advance'); flow = f.state().workflows[0]; assert.equal(flow.status, 'SUCCEEDED'); assert.equal(f.state().ledger.length, 1);
});
test('multiple writes cannot share a single confirmation or skip strong authentication', async () => {
  const f = fixture(); await f.plan([{ type: 'transfer', recipient: '王明', amount: '200' }, { type: 'freeze_card', cardLast4: '8806' }]);
  const flow = f.state().workflows[0]; f.confirm(); assert.equal(f.state().cards[0].status, 'ACTIVE');
  f.service.workflowControl(f.token, flow.id, 'advance'); const red = f.task(); assert.equal(red.risk, 'red');
  assert.equal(f.service.confirm(f.token, red.id, { confirmed: true }).error.code, 'VERIFICATION_REQUIRED');
  f.confirm(); assert.equal(f.state().cards[0].status, 'FROZEN'); assert.equal(f.state().workflows[0].status, 'SUCCEEDED');
});
test('workflow pause and human handoff invalidate old drafts but never fabricate human response', async () => {
  const f = fixture(); await f.plan([{ type: 'balance' }, { type: 'transfer', recipient: '王明', amount: '200' }]);
  const flow = f.state().workflows[0]; const old = f.task();
  f.service.workflowControl(f.token, flow.id, 'handoff'); assert.equal(f.state().workflows[0].handoff.status, 'PREPARED_NOT_SENT');
  assert.throws(() => f.service.confirm(f.token, old.id, { confirmed: true }), { code: 'TASK_NOT_ACTIONABLE' });
  f.service.workflowControl(f.token, flow.id, 'resume'); assert.notEqual(f.task().id, old.id); f.confirm(); assert.equal(f.state().balance, 1266000);
});
test('new chat pauses existing workflow and resuming requires a fresh approval', async () => {
  const f = fixture(); await f.plan([{ type: 'balance' }, { type: 'transfer', recipient: '王明', amount: '200' }]);
  const id = f.state().workflows[0].id; const old = f.task(); await f.manual({ type: 'balance' });
  assert.equal(f.state().workflows[0].status, 'PAUSED'); f.service.workflowControl(f.token, id, 'resume'); assert.notEqual(f.task().id, old.id);
});
test('cross-session workflow controls cannot access another session', async () => {
  const f = fixture(); await f.plan([{ type: 'balance' }, { type: 'cards' }]); const other = f.service.create();
  assert.throws(() => f.service.workflowControl(other.token, f.state().workflows[0].id, 'advance'), { code: 'WORKFLOW_NOT_FOUND' });
});
test('subscription query is yellow, cancellation is scope-specific, no AI charge for manual form', async () => {
  const f = fixture(); await f.manual({ type: 'subscription_query' }); assert.equal(f.task().risk, 'yellow'); assert.equal(f.state().business.subscriptions.length, 0);
  f.confirm(); assert.equal(f.state().business.subscriptions.length, 3); assert.equal(f.task().result.type, 'subscription_query');
  await f.manual({ type: 'cancel_subscription', subscriptionId: 'sub-music', scope: 'bank_mandate' }); f.confirm();
  const music = f.state().business.subscriptions.find(s => s.id === 'sub-music'); assert.equal(music.bankMandateStatus, 'CANCELLED'); assert.equal(music.merchantMembershipStatus, 'ACTIVE');
  assert.equal(f.service.metadata().aiCallsToday, 0);
});
test('wealth buy and redeem use red confirmation and maintain exact capital balance', async () => {
  const f = fixture(); await f.manual({ type: 'wealth_buy', productId: 'demo-flex', amount: '100' }); assert.equal(f.state().tasks.length, 0);
  await f.manual({ type: 'risk_assessment', questionnaireVersion: riskFixture.VERSION, answers: riskFixture.MID }); f.confirm();
  await f.manual({ type: 'wealth_buy', productId: 'demo-flex', amount: '100' }); const buy = f.task(); assert.equal(buy.risk, 'red');
  assert.equal(f.service.confirm(f.token, buy.id, { confirmed: true }).error.code, 'VERIFICATION_REQUIRED'); f.confirm();
  assert.equal(f.state().balance, 1276000); const pos = f.state().business.positions[0]; assert.equal(pos.principalCents, 10000);
  await f.manual({ type: 'wealth_redeem', positionId: pos.id, amount: '100' }); f.confirm();
  assert.equal(f.state().balance, 1286000); assert.equal(f.state().business.principalTotal, 0); assert.equal(f.state().ledger.length, 2);
});
test('virtual application and card lock/restrictions share the same service auth boundary', async () => {
  const f = fixture(); await f.manual({ type: 'apply_virtual_card' }); assert.equal(f.task().risk, 'yellow'); f.confirm();
  assert.equal(f.state().cards.length, 3); assert.match(f.state().cards[2].demoNumber, /^DEMO-/);
  await f.manual({ type: 'temporary_lock_card', cardLast4: '8806' }); f.confirm(); assert.equal(f.state().cards[0].status, 'LOCKED');
  await f.manual({ type: 'unfreeze_card', cardLast4: '8806' }); assert.equal(f.state().history.at(-1).results[0].type, 'blocked');
  await f.manual({ type: 'unlock_card', cardLast4: '8806' }); f.confirm();
  await f.manual({ type: 'card_restriction', cardLast4: '8806', channel: 'online', enabled: false }); f.confirm();
  assert.equal(f.state().business.cardControls['card-8806'].online, false);
});
test('manual parameters cannot add fake approval or arbitrary tool calls', () => {
  const f = fixture();
  assert.throws(() => f.service.prepareManual(f.token, { type: 'transfer', recipient: '王明', amount: '100', confirmed: true }), { code: 'INVALID_MANUAL_ACTION' });
  assert.throws(() => f.service.prepareManual(f.token, { type: 'shell', command: 'bad' }), { code: 'INVALID_MANUAL_ACTION' });
});
test('expired workflow approval can be advanced only by issuing a new task', async () => {
  const f = fixture(); await f.plan([{ type: 'balance' }, { type: 'transfer', recipient: '王明', amount: '200' }]);
  const flowId = f.state().workflows[0].id; const oldId = f.task().id; f.tick(601000);
  f.service.workflowControl(f.token, flowId, 'advance'); assert.notEqual(f.task().id, oldId);
  assert.equal(f.state().tasks.find(t => t.id === oldId).status, 'EXPIRED'); assert.equal(f.task().status, 'AWAITING_CONFIRMATION');
  f.confirm(); assert.equal(f.state().balance, 1266000);
});
