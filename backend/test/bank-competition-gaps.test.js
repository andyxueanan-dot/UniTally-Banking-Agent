// Competition requirements closed on 2026-10-09: cross-scene DAG with references, rollback (saga),
// reversal with human approval, human takeover desk, behaviour circuit breaker, password change,
// bill report, and model-written code that only runs in the sandbox.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BankService } = require('../bank/service');
const { createBankStore } = require('../bank/store');
const { dateFromText, expandLifeEventPlan } = require('../bank/life-events');
const { compile } = require('../bank/generated-code');
const riskMonitor = require('../bank/risk-monitor');

const START = Date.parse('2026-10-09T03:00:00Z'); // 2026-10-09 11:00 Beijing
function fixture({ plan = [], riskRules, limits } = {}) {
  let now = START; let actions = plan; let question = '';
  const planner = { configured: true, model: 'gaps-test', provider: 'TestPlanner', plan: async () => ({ actions: structuredClone(actions), question, meta: { mode: 'ai', provider: 'TestPlanner', latencyMs: 0, totalTokens: 0 } }) };
  const service = new BankService({ store: createBankStore(), planner, now: () => now, ruleFastPath: false, limits: { commandsPerMinute: 100, ...limits }, ...(riskRules === undefined ? {} : { riskRules }) });
  const { token } = service.create();
  const f = { service, token, set: (a, q = '') => { actions = a; question = q; }, tick: ms => { now += ms; }, now: () => now,
    chat: (text, extra = {}) => service.chat(token, { text, ...extra }),
    state: () => service.get(token),
    awaiting: () => service.get(token).tasks.find(t => t.status === 'AWAITING_CONFIRMATION'),
    confirm(task = f.awaiting(), extra = {}) { const code = task.risk === 'red' ? service.challenge(token, task.id).demoCode : undefined; return service.confirm(token, task.id, { confirmed: true, code, ...extra }); },
    desk: (caseId, action, body = {}) => service.handoffAction(token, caseId, { action, ...body }),
  };
  return f;
}

test('dates are read from the user\'s words, never invented', () => {
  assert.equal(dateFromText('下个月15号是我爱人生日', START), '2026-11-15');
  assert.equal(dateFromText('12月3日是妈妈生日', START), '2026-12-03');
  assert.equal(dateFromText('3月1日结婚纪念日', START), '2027-03-01');
  assert.equal(dateFromText('2月30日', START), 'INVALID');
  assert.equal(dateFromText('帮我准备生日', START), null);
  const s = { createdAt: START };
  assert.match(expandLifeEventPlan({ type: 'life_event_plan', label: '妈妈生日' }, s, START, '帮我准备妈妈生日', { money: String }).clarify, /具体日期/);
  assert.match(expandLifeEventPlan({ type: 'life_event_plan', label: '爱人生日', eventDate: '2026-11-20' }, s, START, '下个月15号是我爱人生日', { money: String }).clarify, /不一致/);
  assert.match(expandLifeEventPlan({ type: 'life_event_plan', label: '生日', amount: '100' }, s, START, '下个月15号生日', { money: c => `¥${c / 100}` }).clarify, /至少需要/);
  assert.match(expandLifeEventPlan({ type: 'life_event_plan', label: '生日' }, s, START, '这个月10号生日', { money: String }).clarify, /不足 3 天/);
});

test('birthday sentence becomes a 5-node DAG; references flow from node to node; each write is confirmed separately', async () => {
  const f = fixture({ plan: [{ type: 'life_event_plan', label: '爱人生日', amount: '1000' }] });
  const r = await f.chat('下个月15号是我爱人生日，帮我准备一下');
  const flow = f.state().workflows[0];
  assert.equal(flow.kind, 'life_event'); assert.deepEqual(flow.nodes.map(n => n.id), ['reserve', 'flower', 'cake', 'pay-flower', 'pay-cake']);
  assert.deepEqual(flow.nodes.find(n => n.id === 'cake').dependsOn, ['reserve']);
  assert.deepEqual(flow.nodes.find(n => n.id === 'flower').action.budgetId, { $ref: 'reserve', path: 'budget.id' });
  assert.ok(r.message.results.some(x => x.type === 'life_plan' && x.event.date === '2026-11-15' && x.event.deliveryDate === '2026-11-13'));
  assert.equal(f.state().balance, 1286000);
  const balance0 = f.state().balance;
  // 1 reserve (yellow) → available drops, balance unchanged
  let t = f.awaiting(); assert.equal(t.action.type, 'reserve_budget'); assert.equal(t.risk, 'yellow'); f.confirm(t);
  assert.equal(f.state().balance, balance0); assert.equal(f.state().available, balance0 - 100000);
  // auto-advance prepared the next draft; its budgetId is the real id produced by node 1
  t = f.awaiting(); assert.equal(t.action.type, 'prepare_merchant_order'); assert.equal(t.action.budgetId, f.state().advanced.budgets[0].id);
  assert.equal(t.action.deliveryAtIso, '2026-11-13T10:00:00+08:00'); f.confirm(t);
  t = f.awaiting(); assert.equal(t.action.type, 'prepare_merchant_order'); f.confirm(t);
  t = f.awaiting(); assert.equal(t.action.type, 'pay_merchant_order'); assert.equal(t.risk, 'red');
  assert.equal(t.action.orderId, f.state().advanced.orders.find(o => o.productId === 'flower-demo').id); f.confirm(t);
  t = f.awaiting(); assert.equal(t.action.type, 'pay_merchant_order'); f.confirm(t);
  const done = f.state();
  assert.equal(done.workflows[0].status, 'SUCCEEDED'); assert.equal(done.balance, balance0 - 19900 - 26900);
  assert.equal(done.advanced.budgets[0].spentCents, 46800); assert.equal(f.awaiting(), undefined);
});

test('rollback compensates finished steps in reverse order and never pretends a payment is undone', async () => {
  const f = fixture({ plan: [{ type: 'life_event_plan', label: '爱人生日', amount: '1000' }] });
  await f.chat('下个月15号是我爱人生日');
  f.confirm(); f.confirm(); f.confirm(); f.confirm(); // reserve, flower order, cake order, pay flower
  const flow = f.state().workflows[0]; assert.equal(f.awaiting().action.type, 'pay_merchant_order');
  const r = f.service.workflowControl(f.token, flow.id, 'rollback');
  const [orig, comp] = [f.state().workflows.find(w => w.id === flow.id), f.state().workflows.find(w => w.compensates === flow.id)];
  assert.equal(orig.status, 'CANCELLED'); assert.equal(orig.compensatedBy, comp.id);
  assert.deepEqual(comp.nodes.map(n => n.action.type), ['request_reversal', 'cancel_merchant_order', 'release_budget']);
  assert.match(r.results[0].text, /只能申请撤回/);
  f.confirm(); // reversal request: no money yet
  const reversal = f.state().reversals[0]; assert.equal(reversal.status, 'REQUESTED'); assert.equal(f.state().balance, 1286000 - 19900);
  f.confirm(); f.confirm(); // cancel cake order, release budget
  assert.equal(f.state().advanced.budgets[0].status, 'RELEASED');
  assert.equal(f.state().available, f.state().balance);
  assert.throws(() => f.service.workflowControl(f.token, flow.id, 'rollback'), { code: 'ROLLBACK_EXISTS' });
});

test('reversal needs a human decision; approval moves money back exactly once, rejection moves nothing', async () => {
  const f = fixture({ plan: [{ type: 'transfer', recipient: '王明', amount: '200' }] });
  await f.chat('给王明转200'); f.confirm();
  const receipt = f.state().tasks.find(t => t.status === 'SUCCEEDED').receipt.id;
  f.set([{ type: 'request_reversal', receiptId: receipt }]); await f.chat('刚才转错了，帮我撤回');
  const req = f.awaiting(); assert.equal(req.risk, 'yellow'); assert.match(req.title, /不保证成功/); f.confirm(req);
  assert.equal(f.state().balance, 1266000);
  const ticket = f.state().handoffs.find(c => c.kind === 'reversal');
  assert.throws(() => f.desk(ticket.id, 'approve_reversal'), { code: 'HANDOFF_NOT_CLAIMED' });
  f.desk(ticket.id, 'claim', { agent: '客服小周' });
  f.desk(ticket.id, 'approve_reversal', { note: '对方确认收错' });
  const after = f.state(); assert.equal(after.balance, 1286000); assert.equal(after.reversals[0].status, 'APPROVED');
  assert.ok(after.transactions.some(t => t.type === 'refund' && t.cents === 20000));
  assert.throws(() => f.desk(ticket.id, 'approve_reversal'), { code: 'HANDOFF_CLOSED' });
  f.set([{ type: 'request_reversal', receiptId: receipt }]); const again = await f.chat('再撤回一次');
  assert.ok(again.message.results.some(x => x.type === 'blocked' && x.code === 'REVERSAL_EXISTS'));
  // rejection path
  const g = fixture({ plan: [{ type: 'transfer', recipient: '李悦', amount: '50' }] }); await g.chat('给李悦转50'); g.confirm();
  g.set([{ type: 'request_reversal', receiptId: g.state().tasks.find(t => t.status === 'SUCCEEDED').receipt.id }]); await g.chat('撤回'); g.confirm();
  const c = g.state().handoffs.find(x => x.kind === 'reversal'); g.desk(c.id, 'claim'); g.desk(c.id, 'reject_reversal', { note: '对方不同意' });
  assert.equal(g.state().balance, 1286000 - 5000); assert.equal(g.state().reversals[0].status, 'REJECTED');
});

test('a draft handed to a person is not executed; the person can only return it as a fresh draft for the user', async () => {
  const f = fixture({ plan: [{ type: 'transfer', recipient: '李悦', amount: '1500' }] });
  await f.chat('给李悦转1500'); const draft = f.awaiting();
  const h = f.service.taskHandoff(f.token, draft.id);
  assert.equal(h.handoff.kind, 'task'); assert.equal(f.state().tasks.find(t => t.id === draft.id).status, 'SUPERSEDED');
  assert.throws(() => f.service.confirm(f.token, draft.id, { confirmed: true }), { code: 'TASK_NOT_ACTIONABLE' });
  f.desk(h.handoff.id, 'claim'); f.desk(h.handoff.id, 'note', { note: '已电话核实是本人操作' });
  const back = f.desk(h.handoff.id, 'return');
  const fresh = f.awaiting(); assert.notEqual(fresh.id, draft.id); assert.equal(fresh.risk, 'red'); assert.equal(f.state().balance, 1286000);
  assert.equal(back.handoff.status, 'RETURNED'); assert.equal(back.handoff.notes.length, 3); // claimed, note, returned
  // the desk has no way to confirm on the user's behalf
  assert.throws(() => f.desk(h.handoff.id, 'confirm'), { code: 'INVALID_HANDOFF_ACTION' });
});

test('chat can ask for a person; the ticket carries context and does not block queries', async () => {
  const f = fixture({ plan: [{ type: 'request_handoff', reason: '用户说有人在电话里让他转账' }] });
  const r = await f.chat('有人打电话让我转钱，我想找人工');
  const ticket = f.state().handoffs[0];
  assert.equal(ticket.kind, 'chat'); assert.match(ticket.reason, /电话/); assert.match(r.message.text, /不能替你确认/);
  f.set([{ type: 'balance' }]); const q = await f.chat('查余额'); assert.equal(q.message.results[0].type, 'balance');
});

test('behaviour monitor: transfers to many new people lock sensitive operations and open a risk ticket', async () => {
  const f = fixture();
  for (const [name, amount] of [['王明', '10'], ['李悦', '10'], ['陈晨3801', '10']]) { f.set([{ type: 'transfer', recipient: name, amount }]); await f.chat(`给${name}转${amount}`); f.confirm(); }
  assert.ok(!(f.state().lockedUntil > f.now()));
  f.service.store.transact(db => { const s = Object.values(db.sessions)[0]; s.contacts.push({ id: 'zhao', name: '赵雷', alias: ['赵雷'], last4: '5050', balance: 0 }); });
  f.set([{ type: 'transfer', recipient: '赵雷', amount: '10' }]); await f.chat('给赵雷转10'); f.confirm();
  const st = f.state(); assert.ok(st.lockedUntil > f.now()); assert.equal(st.riskLock.rule, 'MANY_RECIPIENTS');
  const ticket = st.handoffs.find(c => c.kind === 'risk'); assert.ok(ticket);
  f.set([{ type: 'transfer', recipient: '王明', amount: '10' }]); const blocked = await f.chat('再给王明转10');
  assert.ok(blocked.message.results.some(x => x.code === 'SAFETY_LOCKED'));
  f.set([{ type: 'balance' }]); assert.equal((await f.chat('查余额')).message.results[0].type, 'balance');
  f.desk(ticket.id, 'claim'); f.desk(ticket.id, 'unlock', { note: '已核实本人' });
  assert.ok(!(f.state().lockedUntil > f.now()));
  f.set([{ type: 'transfer', recipient: '王明', amount: '10' }]); await f.chat('给王明转10'); assert.ok(f.awaiting());
});

test('behaviour monitor: repeated refused requests (probing) trigger the breaker', async () => {
  const f = fixture({ plan: [{ type: 'transfer', recipient: '王明', amount: '9999999' }] }); // over the demo amount limit → refused
  for (let i = 0; i < 5; i++) await f.chat(`试探 ${i}`).catch(() => {});
  const st = f.state(); assert.ok(st.lockedUntil > f.now()); assert.equal(st.riskLock.rule, 'REPEATED_BLOCKED');
  assert.ok(st.audit.some(e => e.event === 'RISK_LOCKED'));
});

test('three wrong verification codes lock and open a risk ticket for a person', async () => {
  const f = fixture({ plan: [{ type: 'transfer', recipient: '李悦', amount: '1500' }] });
  await f.chat('给李悦转1500'); const t = f.awaiting();
  for (let i = 0; i < 3; i++) { f.service.challenge(f.token, t.id); f.service.confirm(f.token, t.id, { confirmed: true, code: '000000' }); }
  const st = f.state(); assert.ok(st.lockedUntil > f.now()); assert.ok(st.handoffs.some(c => c.kind === 'risk' && /验证失败/.test(c.reason)));
});

test('password change is red, the PIN never reaches the model, view or audit, and weak PINs are refused', async () => {
  const f = fixture({ plan: [{ type: 'change_password' }] });
  await f.chat('我要修改交易密码'); const t = f.awaiting(); assert.equal(t.risk, 'red');
  const code = f.service.challenge(f.token, t.id).demoCode;
  assert.throws(() => f.service.confirm(f.token, t.id, { confirmed: true, code, newPin: '123456' }), { code: 'WEAK_PIN' });
  assert.throws(() => f.service.confirm(f.token, t.id, { confirmed: true, code, newPin: '12ab' }), { code: 'NEW_PIN_REQUIRED' });
  assert.equal(f.service.confirm(f.token, t.id, { confirmed: true, newPin: '583920' }).error.code, 'VERIFICATION_REQUIRED');
  f.service.confirm(f.token, t.id, { confirmed: true, code, newPin: '583920' });
  const st = f.state(); assert.equal(st.tradePinSet, true);
  assert.ok(!JSON.stringify(st).includes('583920'));
  const raw = Object.values(f.service.store.read().sessions)[0]; assert.ok(!JSON.stringify(raw).includes('583920')); assert.equal(raw.tradePin.algorithm, 'scrypt');
});

test('bill report and life-event lookup are read-only and traceable to ledger rows', async () => {
  const f = fixture({ plan: [{ type: 'bill_report', period: 'this_month' }] });
  const r = await f.chat('这个月的账单报告'); const rep = r.message.results[0];
  assert.equal(rep.type, 'report'); assert.ok(rep.categories.length > 0); assert.ok(rep.highlights.length > 0);
  assert.ok(rep.alerts.some(a => a.kind === 'large_new_merchant')); assert.equal(f.state().tasks.length, 0);
  f.set([{ type: 'bill_report', period: 'next_month' }]); await assert.rejects(f.chat('下月报告'), { code: 'INVALID_AI_PLAN' });
  f.set([{ type: 'life_events' }]); const e = await f.chat('最近有什么重要日子'); assert.match(e.message.text, /爱人生日 2026-11-15/);
  const rule = fixture(); const svc = new BankService({ store: createBankStore(), planner: { configured: false }, now: () => START });
  const { token } = svc.create(); const viaRule = await svc.chat(token, { text: '上个月的账单报告' });
  assert.equal(viaRule.message.meta.mode, 'rule'); assert.equal(viaRule.message.results[0].type, 'report'); void rule;
});

test('model-written code is parsed by a strict grammar and compiled to an import-free module; nothing else gets through', () => {
  const wat = compile('(24000 - 6000) / 3');
  assert.match(wat, /^\(module \(func \(export "calculate"\)/); assert.ok(!/import|memory|call/.test(wat));
  for (const bad of ['process.exit()', 'require("fs")', '1;2', '2**8', 'a+1', '1e9', '', 'x'.repeat(201), '((((((((((((((((((1))))))))))))))))))'])
    assert.throws(() => compile(bad), { code: 'GENERATED_CODE_REJECTED' }, bad);
});

test('sandbox_calc goes through the sandbox, is audited with a code hash, and never touches money', async () => {
  const f = fixture({ plan: [{ type: 'sandbox_calc', expression: '24000/3', label: '三人 AA 每人' }] });
  const r = await f.chat('聚餐240三个人AA每人多少'); const c = r.message.results[0];
  assert.equal(c.type, 'sandbox_calc'); assert.equal(c.expression, '24000/3');
  assert.ok(f.state().audit.some(e => e.event === 'GENERATED_CODE_EXECUTED'));
  if (c.ok) { assert.equal(c.result, '8000'); assert.match(c.wat, /i64.div_s/); assert.match(c.codeHash, /^[0-9a-f]{64}$/); }
  else assert.ok(c.error?.code, 'when the runtime is missing the answer must say so instead of guessing');
  assert.equal(f.state().balance, 1286000); assert.equal(f.state().ledger.length, 0);
  f.set([{ type: 'sandbox_calc', expression: 'require("child_process")' }]); const bad = await f.chat('算一下');
  assert.equal(bad.message.results[0].ok, false); assert.match(bad.message.text, /没有给出任何数字/);
});

test('per-session AI cap stops one visitor from using the whole day\'s budget', async () => {
  const f = fixture({ plan: [{ type: 'balance' }], limits: { aiCallsPerSession: 2 } });
  await f.chat('一'); await f.chat('二');
  await assert.rejects(f.chat('三'), { code: 'AI_SESSION_LIMIT' });
  const other = f.service.create(); assert.equal((await f.service.chat(other.token, { text: '四' })).message.results[0].type, 'balance');
});

test('risk rules are explainable and can be switched off for unrelated tests', () => {
  const s = { riskEvents: [] }; const now = START;
  for (const id of ['a', 'b', 'c']) riskMonitor.record(s, 'transfer_executed', now, { recipientId: id });
  assert.equal(riskMonitor.evaluate(s, now), null);
  riskMonitor.record(s, 'transfer_executed', now, { recipientId: 'd' }); assert.equal(riskMonitor.evaluate(s, now).rule, 'MANY_RECIPIENTS');
  riskMonitor.record(s, 'risk_locked', now + 1); assert.equal(riskMonitor.evaluate(s, now + 2), null, 'evidence is not counted twice');
  const off = fixture({ riskRules: false }); assert.equal(off.service.riskRules, null);
});
