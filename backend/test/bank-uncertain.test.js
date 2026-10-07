const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validatePlan, UNCERTAIN_FIELDS, DEMOS } = require('../bank/planner');
const { BankService } = require('../bank/service');
const { createBankStore } = require('../bank/store');

function fixture() {
  let actions = []; const planner = { configured: true, model: 'uncertain-test', provider: 'TestPlanner', plan: async () => ({ actions, question: '', meta: { mode: 'ai', provider: 'TestPlanner', latencyMs: 0, totalTokens: 0 } }) };
  const service = new BankService({ store: createBankStore(), planner, now: () => Date.parse('2026-10-07T03:00:00Z') });
  const { token } = service.create();
  return { service, token, set: next => { actions = next; }, chat: text => service.chat(token, { text }) };
}

test('validatePlan accepts well-formed uncertain annotations and rejects anything else', () => {
  const ok = { actions: [{ type: 'transfer', recipient: '王明', amount: '200', uncertain: ['recipient', 'amount'] }], question: '' };
  assert.deepEqual(validatePlan(ok), ok);
  assert.deepEqual(UNCERTAIN_FIELDS.slice(0, 2), ['recipient', 'amount']);
  for (const bad of [['password'], ['balance'], 'recipient', [1], ['recipient', 'amount', 'period', 'merchant', 'category'], [{ field: 'amount' }]]) {
    assert.throws(() => validatePlan({ actions: [{ type: 'transfer', recipient: '王明', amount: '200', uncertain: bad }], question: '' }), { code: 'INVALID_AI_PLAN' }, `should reject ${JSON.stringify(bad)}`);
  }
});

test('uncertain fields travel onto the task, are exposed to the UI and recorded in the audit trail', async () => {
  const f = fixture();
  f.set([{ type: 'transfer', recipient: '王明', amount: '200', uncertain: ['amount', 'recipient', 'amount'] }]);
  const r = await f.chat('给室友小王转两百');
  const task = r.state.tasks.find(t => t.status === 'AWAITING_CONFIRMATION');
  assert.deepEqual(task.uncertain, ['amount', 'recipient']);
  assert.equal(task.action.cents, 20000); assert.equal(task.risk, 'yellow');
  assert.ok(r.state.audit.some(e => e.event === 'TASK_PROPOSED' && /需核对字段：amount、recipient/.test(e.detail)));
  assert.deepEqual(f.service.get(f.token).tasks[0].uncertain, ['amount', 'recipient']);
});

test('tasks without annotations carry an empty list; fixed demos never annotate', async () => {
  const f = fixture(); f.set([{ type: 'freeze_card', cardLast4: '8806' }]);
  const r = await f.chat('把8806挂失');
  assert.deepEqual(r.state.tasks[0].uncertain, []);
  for (const demo of Object.values(DEMOS)) for (const a of demo.actions) assert.equal(a.uncertain, undefined);
  const d = await f.service.chat(f.token, { text: '固定案例', demo: 'transfer' });
  assert.deepEqual(d.state.tasks.find(t => t.status === 'AWAITING_CONFIRMATION').uncertain, []);
});

test('annotation does not change permission level, amount or recipient resolution', async () => {
  const f = fixture();
  f.set([{ type: 'transfer', recipient: '李悦', amount: '1200', uncertain: ['amount'] }]);
  const r = await f.chat('给李悦转一千二');
  const task = r.state.tasks[0];
  assert.equal(task.risk, 'red'); assert.equal(task.action.cents, 120000); assert.equal(task.action.recipientName, '李悦');
  assert.equal(r.state.balance, 1286000);
});

test('workflow nodes keep their own annotations', async () => {
  const f = fixture();
  f.set([{ type: 'balance' }, { type: 'transfer', recipient: '王明', amount: '200', uncertain: ['recipient'] }]);
  const r = await f.chat('先查余额再给小王转两百');
  const task = r.state.tasks.find(t => t.status === 'AWAITING_CONFIRMATION');
  assert.deepEqual(task.uncertain, ['recipient']);
});
