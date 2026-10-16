// Features learned from closed products and regulation (2026-10-16): scam intervention + cooling-off,
// trade PIN as a second factor, answer reconciliation, proactive insights, handoff summaries.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BankService } = require('../bank/service');
const { createBankStore } = require('../bank/store');

const START = Date.parse('2026-10-16T03:00:00Z');
function fixture({ plan = [], question = '', mode = 'ai' } = {}) {
  let now = START; let actions = plan; let q = question;
  const planner = { configured: true, model: 't', provider: 'TestPlanner', plan: async () => ({ actions: structuredClone(actions), question: q, meta: { mode, provider: 'TestPlanner', latencyMs: 0, totalTokens: 0 } }) };
  const service = new BankService({ store: createBankStore(), planner, now: () => now, ruleFastPath: false, riskRules: false, limits: { commandsPerMinute: 100 } });
  const { token } = service.create();
  const f = { service, token, set: (a, qq = '') => { actions = a; q = qq; }, tick: ms => { now += ms; }, state: () => service.get(token),
    chat: text => service.chat(token, { text }), awaiting: () => service.get(token).tasks.find(t => t.status === 'AWAITING_CONFIRMATION') };
  return f;
}
const code = (f, t) => f.service.challenge(f.token, t.id).demoCode;

test('large first-time transfer: questionnaire first, any "yes" stops it and opens an anti-fraud case', async () => {
  const f = fixture({ plan: [{ type: 'transfer', recipient: '李悦', amount: '3000' }] });
  await f.chat('给李悦转 3000'); const t = f.awaiting();
  assert.equal(t.fraudCheck.status, 'REQUIRED'); assert.equal(t.fraudCheck.questions.length, 3);
  assert.throws(() => f.service.confirm(f.token, t.id, { confirmed: true, code: code(f, t) }), { code: 'FRAUD_CHECK_REQUIRED' });
  const r = f.service.fraudAnswer(f.token, t.id, { answers: [false, true, false] });
  assert.equal(r.outcome, 'FLAGGED'); assert.match(r.text, /96110/);
  const st = f.state(); assert.equal(st.tasks.find(x => x.id === t.id).status, 'CANCELLED'); assert.ok(st.lockedUntil > START);
  assert.equal(st.riskLock.rule, 'FRAUD_SUSPECTED'); assert.ok(st.handoffs.some(c => c.kind === 'risk' && /诈骗/.test(c.reason)));
  assert.equal(st.balance, 1286000);
});

test('all "no": cooling-off period, then normal red verification; small or known-recipient transfers skip the questions', async () => {
  const f = fixture({ plan: [{ type: 'transfer', recipient: '李悦', amount: '3000' }] });
  await f.chat('给李悦转 3000'); const t = f.awaiting();
  assert.equal(f.service.fraudAnswer(f.token, t.id, { answers: [false, false, false] }).outcome, 'COOLING');
  assert.throws(() => f.service.confirm(f.token, t.id, { confirmed: true, code: code(f, t) }), { code: 'COOLING_OFF' });
  f.tick(61000); f.service.confirm(f.token, t.id, { confirmed: true, code: code(f, t) });
  assert.equal(f.state().balance, 1286000 - 300000);
  f.set([{ type: 'transfer', recipient: '李悦', amount: '2500' }]); await f.chat('再给李悦转 2500'); assert.equal(f.awaiting().fraudCheck, undefined, 'known recipient');
  f.set([{ type: 'transfer', recipient: '王明', amount: '500' }]); await f.chat('给王明转 500'); assert.equal(f.awaiting().fraudCheck, undefined, 'small amount');
  assert.throws(() => f.service.fraudAnswer(f.token, f.awaiting().id, { answers: [false, false] }), { code: 'INVALID_FRAUD_ANSWERS' });
});

test('once a trade PIN is set, red operations need it as a second factor; wrong PINs count toward the lockout', async () => {
  const f = fixture({ plan: [{ type: 'change_password' }] });
  await f.chat('设置交易密码'); let t = f.awaiting(); f.service.confirm(f.token, t.id, { confirmed: true, code: code(f, t), newPin: '583920' });
  f.set([{ type: 'freeze_card', cardLast4: '8806' }]); await f.chat('挂失 8806'); t = f.awaiting(); assert.equal(t.risk, 'red');
  let c = code(f, t);
  assert.equal(f.service.confirm(f.token, t.id, { confirmed: true, code: c }).error.code, 'PIN_INVALID');
  c = code(f, f.awaiting());
  assert.equal(f.service.confirm(f.token, t.id, { confirmed: true, code: c, pin: '111111' }).error.code, 'PIN_INVALID');
  c = code(f, f.awaiting());
  f.service.confirm(f.token, t.id, { confirmed: true, code: c, pin: '583920' });
  assert.equal(f.state().cards.find(x => x.last4 === '8806').status, 'FROZEN');
  f.set([{ type: 'transfer', recipient: '王明', amount: '100' }]); await f.chat('给王明转 100'); t = f.awaiting(); assert.equal(t.risk, 'yellow');
  f.service.confirm(f.token, t.id, { confirmed: true }); assert.equal(f.state().balance, 1286000 - 10000, 'yellow needs no PIN');
});

test('answer reconciliation: numbers the model invents are not shown; numbers from the user or snapshot are fine', async () => {
  const f = fixture({ question: '你上个月在咖啡店花了 999 元，要我帮你设个预算吗？' });
  const r = await f.chat('我是不是花太多了');
  assert.doesNotMatch(r.message.text, /999/); assert.match(r.message.text, /答后对账/);
  assert.ok(f.state().audit.some(e => e.event === 'NUMBER_RECONCILE_BLOCKED' && /999/.test(e.detail)));
  f.set([], '找到两位陈晨，尾号 3801 和 9526，请问是哪一位？');
  const ok = await f.chat('给陈晨转 100'); assert.match(ok.message.text, /3801/);
  f.set([], '你说的 250 元是要转给谁？'); const echoed = await f.chat('转 250 元'); assert.match(echoed.message.text, /250/);
});

test('proactive insights: duplicate charge and new-merchant alert from the ledger; subscriptions only after the user allowed the query', async () => {
  const early = fixture(); assert.ok(!early.state().insights.some(i => i.kind === 'duplicate_charge'), 'the seeded double charge on the 18th has not happened yet on the 16th');
  const f = fixture(); f.tick(4 * 86400000); const kinds = f.state().insights.map(i => i.kind);
  assert.ok(kinds.includes('duplicate_charge')); assert.ok(kinds.includes('large_new_merchant'));
  assert.ok(!kinds.includes('renewal'), 'no subscription insights before the yellow query was confirmed');
  for (const i of f.state().insights) { assert.ok(i.title && i.detail && i.action?.label); assert.ok(!('taskId' in i.action), 'insights never execute anything'); }
});

test('handoff tickets carry a summary so the user does not repeat themselves', async () => {
  const f = fixture({ plan: [{ type: 'transfer', recipient: '李悦', amount: '1500' }] });
  await f.chat('给李悦转 1500'); const h = f.service.taskHandoff(f.token, f.awaiting().id);
  assert.match(h.handoff.summary, /想办：向李悦/); assert.match(h.handoff.summary, /红色/); assert.match(h.handoff.summary, /没有资金变动/);
});
