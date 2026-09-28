const { test } = require('node:test');
const assert = require('node:assert/strict');
const { seedSession } = require('../bank/seed');
const { ADVANCED_TYPES, ensureAdvancedState, publicAdvancedState, heldCents, prepareAdvanced, executeAdvanced } = require('../bank/advanced-payments');
const DAY = 86400000;

function fixture() {
  let now = Date.parse('2026-09-26T10:00:00Z'); let serial = 0;
  const s = seedSession(now); const fail = (code, message, status = 400) => { throw Object.assign(new Error(message), { code, status }); };
  const tools = { fail, id: () => `advanced-${++serial}`, money: value => `¥${(value / 100).toFixed(2)}`,
    cents(value) {
      if (typeof value !== 'string' || !/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(value)) fail('INVALID_AMOUNT', 'invalid');
      const [whole, fraction = ''] = value.split('.'); const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
      if (!Number.isSafeInteger(result) || result <= 0 || result > 100000000) fail('INVALID_AMOUNT', 'invalid'); return result;
    },
    available: state => state.balance - heldCents(state) - (state.testOtherHeld || 0),
    audit: (state, event, detail, time, taskId) => state.audit.push({ id: `audit-${++serial}`, event, detail, at: time, taskId }),
  };
  ensureAdvancedState(s, now);
  const prepare = action => prepareAdvanced(s, action, now, tools);
  const task = action => { const proposal = prepare(action); assert.ok(proposal.action); return { ...proposal, id: `TASK-${++serial}`, status: 'AWAITING_CONFIRMATION' }; };
  const execute = t => executeAdvanced(s, t, now, tools);
  const future = (days = 10) => new Date(now + days * DAY).toISOString();
  const run = action => execute(task(action));
  const budget = (amount = '1000') => run({ type: 'reserve_budget', amount, label: '生日礼物', eventAt: future(10) }).budget;
  const order = (budgetId, productId = 'flower-demo') => run({ type: 'prepare_merchant_order', budgetId, productId, deliveryAt: future(9) }).order;
  return { s, tools, prepare, task, execute, run, future, budget, order, now: () => now, tick: ms => { now += ms; } };
}
const split = { type: 'aa_request', amount: '240', participants: ['王明', '李悦'], includeSelf: true };

test('extension leaves existing balances, contacts, cards and transactions unchanged', () => {
  const s = seedSession(1000); const before = structuredClone(s); assert.equal(heldCents(s), 0);
  ensureAdvancedState(s, 1000); ensureAdvancedState(s, 2000);
  for (const key of Object.keys(before)) assert.deepEqual(s[key], before[key]);
  assert.equal(s.advanced.aaSimulationPoolCents, 100000000); assert.equal(ADVANCED_TYPES.length, 11);
});
test('AA requires explicit self inclusion and unique, unambiguous other participants', () => {
  const f = fixture(); const missing = { ...split }; delete missing.includeSelf;
  assert.throws(() => f.prepare(missing), { code: 'AA_SELF_REQUIRED' });
  assert.throws(() => f.prepare({ ...split, participants: ['王明', '小王'] }), { code: 'AA_DUPLICATE_PARTICIPANT' });
  assert.throws(() => f.prepare({ ...split, participants: ['陈晨'] }), { code: 'RECIPIENT_AMBIGUOUS' });
  assert.throws(() => f.prepare({ ...split, participants: ['不存在'] }), { code: 'RECIPIENT_AMBIGUOUS' });
  assert.throws(() => f.prepare({ ...split, participants: [], includeSelf: true }), { code: 'AA_PARTICIPANTS_REQUIRED' });
  assert.throws(() => f.prepare({ ...split, participants: ['王明'], includeSelf: false }), { code: 'AA_TOO_FEW_PARTICIPANTS' });
});
test('AA creation is yellow, does not move money, and request is not receipt', () => {
  const f = fixture(); const before = structuredClone(f.s); const t = f.task(split);
  assert.equal(t.risk, 'yellow'); assert.deepEqual(f.s, before);
  const r = f.execute(t); assert.equal(r.request.totalCents, 24000); assert.equal(r.request.receivableCents, 16000);
  assert.deepEqual(r.request.shares.map(p => p.cents), [8000, 8000, 8000]); assert.equal(r.request.collectedCents, 0);
  assert.equal(r.request.status, 'REQUESTED'); assert.equal(f.s.balance, 1286000); assert.equal(f.s.ledger.length, 0); assert.match(r.text, /尚未到账/);
});
test('AA excludes owner only when explicitly requested and conserves odd cents', () => {
  const f = fixture(); const r = f.run({ ...split, amount: '10', includeSelf: false });
  assert.deepEqual(r.request.shares.map(p => p.cents), [500, 500]); assert.equal(r.request.receivableCents, 1000);
  const odd = f.run({ ...split, amount: '10' }).request;
  assert.deepEqual(odd.shares.map(p => p.cents), [334, 333, 333]); assert.equal(odd.shares.reduce((s, p) => s + p.cents, 0), 1000);
});
test('tiny AA amount can have zero shares without inventing a payment', () => {
  const f = fixture(); const r = f.run({ ...split, amount: '0.01' }).request;
  assert.deepEqual(r.shares.map(p => p.cents), [1, 0, 0]); assert.equal(r.status, 'NO_COLLECTION_REQUIRED');
  assert.throws(() => f.prepare({ type: 'simulate_aa_payment', requestId: r.id, participantId: 'wang', simulation: true }), { code: 'AA_PAYMENT_NOT_ACTIONABLE' });
});
test('AA settlement requires explicit mock action and conserves user plus simulation pool', () => {
  const f = fixture(); const request = f.run(split).request; const sum = f.s.balance + f.s.advanced.aaSimulationPoolCents;
  assert.throws(() => f.prepare({ type: 'simulate_aa_payment', requestId: request.id, participantId: 'wang' }), { code: 'EXPLICIT_SIMULATION_REQUIRED' });
  const t = f.task({ type: 'simulate_aa_payment', requestId: request.id, participantId: 'wang', simulation: true }); assert.equal(t.risk, 'yellow');
  const r = f.execute(t); assert.equal(f.s.balance, 1294000); assert.equal(f.s.advanced.aaSimulationPoolCents, 99992000);
  assert.equal(f.s.balance + f.s.advanced.aaSimulationPoolCents, sum); assert.equal(r.request.collectedCents, 8000); assert.equal(r.request.status, 'PARTIALLY_SIMULATED_PAID');
  assert.equal(f.s.ledger[0].debitAccount, 'demo-aa-simulation-pool'); assert.equal(f.s.ledger[0].creditAccount, 'demo-owner');
  assert.equal(f.s.contacts[0].balance, 0); assert.equal(f.s.transactions.at(-1).type, 'aa_receipt'); assert.match(r.text, /绝非对方真实付款/);
  f.run({ type: 'simulate_aa_payment', requestId: request.id, participantId: 'li', simulation: true });
  assert.equal(f.s.advanced.requests[0].status, 'SIMULATED_SETTLED');
});
test('duplicate AA settlements are idempotent and changed task payload cannot replay', () => {
  const f = fixture(); const r = f.run(split).request;
  const t = f.task({ type: 'simulate_aa_payment', requestId: r.id, participantId: 'wang', simulation: true }); f.execute(t);
  const before = structuredClone(f.s); assert.equal(f.execute(t).idempotent, true); assert.deepEqual(f.s, before);
  assert.throws(() => f.execute({ ...t, action: { ...t.action, cents: 1 } }), { code: 'ADVANCED_REPLAY_MISMATCH' }); assert.deepEqual(f.s, before);
  assert.throws(() => f.prepare({ type: 'simulate_aa_payment', requestId: r.id, participantId: 'wang', simulation: true }), { code: 'AA_PAYMENT_NOT_ACTIONABLE' });
});
test('stale settlement for already-paid participant cannot double credit', () => {
  const f = fixture(); const request = f.run(split).request;
  const action = { type: 'simulate_aa_payment', requestId: request.id, participantId: 'wang', simulation: true };
  const stale = f.task(action); f.run(action); const before = structuredClone(f.s);
  assert.throws(() => f.execute(stale), { code: 'AA_PAYMENT_NOT_ACTIONABLE' }); assert.deepEqual(f.s, before);
});
test('AA rejects malformed split and unknown side effects before any mutation', () => {
  const f = fixture(); const t = f.task(split); t.action.shares[1].cents += 1; const before = structuredClone(f.s);
  assert.throws(() => f.execute(t), { code: 'INVALID_AA_SPLIT' }); assert.deepEqual(f.s, before);
  assert.throws(() => f.prepare({ type: 'send_real_message' }), { code: 'UNSUPPORTED_ACTION' });
});
test('schedule requires explicit timezone, valid date and future time; never silently runs now', () => {
  const f = fixture();
  for (const executeAt of [undefined, '明天九点', '2026-10-01T09:00:00', '2026-02-30T09:00:00+08:00', '2026-10-01T24:00:00Z', '2026-10-01T09:00:00+15:00', '2026-09-01T09:00:00Z', '2028-01-01T09:00:00Z'])
    assert.throws(() => f.prepare({ type: 'schedule_transfer', recipient: '王明', amount: '100', executeAt }));
  assert.equal(f.s.advanced.schedules.length, 0); assert.equal(f.s.balance, 1286000);
});
test('schedule creation is conservatively red, does not reserve or debit, due only returns a suggested draft', () => {
  const f = fixture(); const executeAt = f.future(1); const t = f.task({ type: 'schedule_transfer', recipient: '王明', amount: '200.01', executeAt });
  assert.equal(t.risk, 'red'); const r = f.execute(t); assert.equal(r.schedule.automaticExecution, false);
  assert.equal(f.s.balance, 1286000); assert.equal(heldCents(f.s), 0); assert.equal(f.s.ledger.length, 0);
  const early = f.prepare({ type: 'due_schedule', scheduleId: r.schedule.id }).returnResult; assert.equal(early.due, false); assert.equal(early.suggestedAction, undefined);
  f.tick(DAY); const before = structuredClone(f.s); const due = f.prepare({ type: 'due_schedule', scheduleId: r.schedule.id }).returnResult;
  assert.equal(due.due, true); assert.deepEqual(due.suggestedAction, { type: 'transfer', recipient: '1028', amount: '200.01', scheduleId: r.schedule.id }); assert.deepEqual(f.s, before);
  assert.equal(publicAdvancedState(f.s, f.now()).schedules[0].effectiveStatus, 'DUE'); assert.equal(f.s.balance, 1286000);
});
test('schedule can be cancelled even when due, but cannot reuse a stale cancellation', () => {
  const f = fixture(); const schedule = f.run({ type: 'schedule_transfer', recipient: '李悦', amount: '500', executeAt: f.future(1) }).schedule;
  const old = f.task({ type: 'cancel_schedule', scheduleId: schedule.id }); assert.equal(old.risk, 'yellow'); f.tick(DAY + 1);
  f.run({ type: 'cancel_schedule', scheduleId: schedule.id }); const before = structuredClone(f.s);
  assert.throws(() => f.execute(old), { code: 'SCHEDULE_STATE_CHANGED' }); assert.deepEqual(f.s, before);
  assert.equal(f.prepare({ type: 'due_schedule', scheduleId: schedule.id }).returnResult.due, false);
});
test('confirming a schedule after its timestamp has passed rejects instead of executing immediately', () => {
  const f = fixture(); const t = f.task({ type: 'schedule_transfer', recipient: '王明', amount: '100', executeAt: new Date(f.now() + 1000).toISOString() });
  f.tick(1001); const before = structuredClone(f.s); assert.throws(() => f.execute(t), { code: 'INVALID_SCHEDULE_TIME' }); assert.deepEqual(f.s, before);
});
test('budget reservation is yellow, reduces available only, and can be released without a fake refund', () => {
  const f = fixture(); const t = f.task({ type: 'reserve_budget', amount: '1000', label: '生日', eventAt: f.future() }); assert.equal(t.risk, 'yellow');
  const budget = f.execute(t).budget; assert.equal(heldCents(f.s), 100000); assert.equal(f.s.balance, 1286000); assert.equal(f.tools.available(f.s), 1186000); assert.equal(f.s.ledger.length, 0);
  const release = f.task({ type: 'release_budget', budgetId: budget.id }); assert.equal(release.risk, 'yellow'); f.execute(release);
  assert.equal(heldCents(f.s), 0); assert.equal(f.s.balance, 1286000); assert.equal(f.s.advanced.budgets[0].releasedCents, 100000);
});
test('budget does not consume another reservation and rechecks free funds on execution', () => {
  const f = fixture(); const stale = f.task({ type: 'reserve_budget', amount: '1000', label: '生日', eventAt: f.future() });
  f.s.testOtherHeld = 1286000 - 99999; const before = structuredClone(f.s);
  assert.throws(() => f.execute(stale), { code: 'INSUFFICIENT_FUNDS' }); assert.deepEqual(f.s, before);
  assert.throws(() => f.prepare({ type: 'reserve_budget', amount: '1000', label: '生日', eventAt: f.future() }), { code: 'INSUFFICIENT_FUNDS' });
});
test('merchant catalogue contains only explicit fictional quotes', () => {
  const f = fixture(); const before = structuredClone(f.s); const r = f.prepare({ type: 'merchant_catalog' }).returnResult;
  assert.equal(r.risk, 'green'); assert.deepEqual(r.products.map(p => [p.id, p.cents]), [['flower-demo', 19900], ['cake-demo', 26900]]);
  assert.match(r.text, /虚构/); assert.deepEqual(f.s, before);
});
test('merchant preparation creates unpaid order only and does not debit reserved budget', () => {
  const f = fixture(); const budget = f.budget(); const t = f.task({ type: 'prepare_merchant_order', budgetId: budget.id, productId: 'flower-demo', deliveryAt: f.future(9) });
  assert.equal(t.risk, 'yellow'); const r = f.execute(t); assert.equal(r.order.status, 'PREPARED'); assert.equal(r.order.realMerchantConnected, false);
  assert.equal(f.s.balance, 1286000); assert.equal(heldCents(f.s), 100000); assert.equal(f.s.advanced.budgets[0].spentCents, 0); assert.equal(f.s.ledger.length, 0);
});
test('merchant drafts cannot overallocate one budget or keep stale budget revision', () => {
  const f = fixture(); const budget = f.budget('300');
  const stale = f.task({ type: 'prepare_merchant_order', budgetId: budget.id, productId: 'cake-demo', deliveryAt: f.future(9) });
  f.order(budget.id); const before = structuredClone(f.s);
  assert.throws(() => f.execute(stale), { code: 'BUDGET_STATE_CHANGED' }); assert.deepEqual(f.s, before);
  assert.throws(() => f.prepare({ type: 'prepare_merchant_order', budgetId: budget.id, productId: 'cake-demo', deliveryAt: f.future(9) }), { code: 'BUDGET_INSUFFICIENT' });
});
test('merchant payment is red, uses reserved funds, and conserves owner plus merchant balances', () => {
  const f = fixture(); const budget = f.budget(); const order = f.order(budget.id); const beforeFree = f.tools.available(f.s);
  const task = f.task({ type: 'pay_merchant_order', orderId: order.id }); assert.equal(task.risk, 'red'); const r = f.execute(task);
  assert.equal(r.order.status, 'PAID'); assert.equal(f.s.balance, 1266100); assert.equal(heldCents(f.s), 80100); assert.equal(f.tools.available(f.s), beforeFree);
  assert.equal(f.s.advanced.merchantBalances['demo-flower-shop'], 19900); assert.equal(f.s.balance + f.s.advanced.merchantBalances['demo-flower-shop'], 1286000);
  assert.equal(f.s.ledger.at(-1).creditAccount, 'demo-flower-shop'); assert.equal(f.s.transactions.at(-1).type, 'expense'); assert.match(r.text, /不代表.*已配送/);
});
test('reserve exactly order cost leaves zero available but reserved payment still works', () => {
  const f = fixture(); f.s.balance = 19900; const budget = f.budget('199'); const order = f.order(budget.id);
  assert.equal(f.tools.available(f.s), 0); f.run({ type: 'pay_merchant_order', orderId: order.id });
  assert.equal(f.s.balance, 0); assert.equal(heldCents(f.s), 0); assert.equal(f.s.advanced.budgets[0].status, 'CONSUMED');
});
test('birthday flower and cake chain can pay each item and release unused budget', () => {
  const f = fixture(); const budget = f.budget(); const flower = f.order(budget.id); const cake = f.order(budget.id, 'cake-demo');
  f.run({ type: 'pay_merchant_order', orderId: flower.id }); f.run({ type: 'pay_merchant_order', orderId: cake.id });
  assert.equal(f.s.balance, 1286000 - 19900 - 26900); assert.equal(heldCents(f.s), 53200); assert.equal(f.s.advanced.budgets[0].spentCents, 46800);
  const r = f.run({ type: 'release_budget', budgetId: budget.id }); assert.equal(heldCents(f.s), 0); assert.equal(r.budget.releasedCents, 53200);
  assert.match(r.text, /已付款部分.*没有退款/); assert.equal(f.s.advanced.orders.every(o => o.status === 'PAID'), true);
});
test('paid merchant order cannot be cancelled as if money automatically returned', () => {
  const f = fixture(); const budget = f.budget(); const order = f.order(budget.id); const staleCancel = f.task({ type: 'cancel_merchant_order', orderId: order.id });
  f.run({ type: 'pay_merchant_order', orderId: order.id }); const before = structuredClone(f.s);
  assert.throws(() => f.prepare({ type: 'cancel_merchant_order', orderId: order.id }), { code: 'ORDER_ALREADY_PAID' });
  assert.throws(() => f.execute(staleCancel), { code: 'ORDER_ALREADY_PAID' }); assert.deepEqual(f.s, before);
});
test('unpaid cancellation releases allocation but not budget; budget release cancels remaining drafts', () => {
  const f = fixture(); const budget = f.budget(); const first = f.order(budget.id); f.run({ type: 'cancel_merchant_order', orderId: first.id });
  assert.equal(heldCents(f.s), 100000); const second = f.order(budget.id); const payment = f.task({ type: 'pay_merchant_order', orderId: second.id });
  f.run({ type: 'release_budget', budgetId: budget.id }); const before = structuredClone(f.s);
  assert.equal(heldCents(f.s), 0); assert.equal(f.s.advanced.orders[1].status, 'CANCELLED');
  assert.throws(() => f.execute(payment), { code: 'ORDER_NOT_ACTIONABLE' }); assert.deepEqual(f.s, before);
});
test('budget change invalidates old payment; past delivery time cannot silently become immediate', () => {
  const f = fixture(); const budget = f.budget(); const flower = f.order(budget.id); const old = f.task({ type: 'pay_merchant_order', orderId: flower.id });
  f.order(budget.id, 'cake-demo'); const before = structuredClone(f.s);
  assert.throws(() => f.execute(old), { code: 'ORDER_STATE_CHANGED' }); assert.deepEqual(f.s, before);
  const later = f.task({ type: 'pay_merchant_order', orderId: flower.id }); f.tick(9 * DAY);
  assert.throws(() => f.execute(later), { code: 'ORDER_TIME_PASSED' }); assert.equal(publicAdvancedState(f.s, f.now()).orders[0].effectiveStatus, 'EXPIRED_UNPAID');
});
test('payment blocks if another obligation makes available funds negative', () => {
  const f = fixture(); const budget = f.budget(); const order = f.order(budget.id); const payment = f.task({ type: 'pay_merchant_order', orderId: order.id });
  f.s.testOtherHeld = f.s.balance; const before = structuredClone(f.s);
  assert.throws(() => f.execute(payment), { code: 'INSUFFICIENT_FUNDS' }); assert.deepEqual(f.s, before);
});
test('merchant payment replay is idempotent with exactly one financial receipt row', () => {
  const f = fixture(); const budget = f.budget(); const order = f.order(budget.id); const payment = f.task({ type: 'pay_merchant_order', orderId: order.id }); f.execute(payment);
  const before = structuredClone(f.s); assert.equal(f.execute(payment).idempotent, true); assert.deepEqual(f.s, before); assert.equal(f.s.ledger.length, 1);
});
test('audit failure cannot leave half-committed budget or merchant payment', () => {
  const f = fixture(); const budget = f.budget(); const order = f.order(budget.id); const payment = f.task({ type: 'pay_merchant_order', orderId: order.id });
  const before = structuredClone(f.s); f.tools.audit = () => { throw new Error('audit fault'); };
  assert.throws(() => f.execute(payment), /audit fault/); assert.deepEqual(f.s, before);
});
test('wrong risk, cancelled task and direct green execution are rejected at handoff', () => {
  const f = fixture(); const red = f.task({ type: 'schedule_transfer', recipient: '王明', amount: '1', executeAt: f.future() }); const before = structuredClone(f.s);
  assert.throws(() => f.execute({ ...red, risk: 'yellow' }), { code: 'ADVANCED_AUTH_HANDOFF_INVALID' });
  assert.throws(() => f.execute({ ...red, status: 'CANCELLED' }), { code: 'ADVANCED_AUTH_HANDOFF_INVALID' });
  assert.throws(() => f.execute({ ...red, action: { type: 'merchant_catalog' } }), { code: 'NOT_EXECUTABLE_ADVANCED_ACTION' }); assert.deepEqual(f.s, before);
});
test('extension state remains independent per session and public snapshots are detached', () => {
  const one = fixture(); const two = fixture(); const budget = one.budget(); one.run(split);
  assert.equal(heldCents(two.s), 0); assert.equal(two.s.advanced.requests.length, 0);
  const snapshot = publicAdvancedState(one.s, one.now()); snapshot.budgets[0].remainingCents = 0; snapshot.requests[0].shares[0].cents = 0;
  assert.equal(heldCents(one.s), 100000); assert.equal(one.s.advanced.budgets[0].id, budget.id); assert.equal(one.s.advanced.requests[0].shares[0].cents, 8000);
});
test('invalid persisted budget and clearing invariants fail closed, without reseeding money', () => {
  const f = fixture(); f.budget(); f.s.advanced.budgets[0].remainingCents -= 1; const before = structuredClone(f.s);
  assert.throws(() => heldCents(f.s), { code: 'ADVANCED_STATE_INVALID' });
  assert.throws(() => ensureAdvancedState(f.s, f.now()), { code: 'ADVANCED_STATE_INVALID' }); assert.deepEqual(f.s, before);
  const g = fixture(); const task = g.task(split); g.s.advanced.aaSimulationPoolCents -= 1; const beforePool = structuredClone(g.s);
  assert.throws(() => g.execute(task), { code: 'ADVANCED_LEDGER_MISMATCH' }); assert.deepEqual(g.s, beforePool);
});
