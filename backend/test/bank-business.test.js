const riskFixture = require('./risk-fixtures.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { seedSession } = require('../bank/seed');
const { BUSINESS_TYPES, ensureBusinessState, publicBusinessState, prepareBusiness, executeBusiness } = require('../bank/business');

function fixture() {
  let clock = Date.parse('2026-09-26T10:00:00Z'); let serial = 0;
  const s = seedSession(clock);
  const fail = (code, message, status = 400) => { throw Object.assign(new Error(message), { code, status }); };
  const tools = { fail, id: () => `test-${++serial}`, money: n => `¥${(n / 100).toFixed(2)}`,
    cents(value) {
      if (typeof value !== 'string' || !/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(value)) fail('INVALID_AMOUNT', 'invalid amount');
      const [whole, fraction = ''] = value.split('.'); const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
      if (!Number.isSafeInteger(result) || result <= 0 || result > 100000000) fail('INVALID_AMOUNT', 'invalid amount'); return result;
    },
    available: state => state.balance - (state.testReserved || 0),
    audit: (state, event, detail, now, taskId) => state.audit.push({ id: `audit-${++serial}`, event, detail, at: now, taskId }),
  };
  ensureBusinessState(s, clock);
  function prepare(action) { return prepareBusiness(s, action, clock, tools); }
  function task(action) {
    const p = prepare(action); assert.ok(p.action, 'write preparation must return an action');
    return { ...p, id: `task-${++serial}`, status: 'AWAITING_CONFIRMATION' };
  }
  function execute(t) { return executeBusiness(s, t, clock, tools); }
  return { s, tools, prepare, task, execute, run: a => execute(task(a)), now: () => clock, tick: ms => clock += ms,
    highRisk: () => execute(task({ type: 'risk_assessment', questionnaireVersion: riskFixture.VERSION, answers: riskFixture.HIGH })) };
}

test('business defaults leave legacy seed balances, cards and transactions unchanged', () => {
  const now = Date.parse('2026-09-26T10:00:00Z'); const s = seedSession(now); const before = structuredClone(s);
  ensureBusinessState(s, now); ensureBusinessState(s, now + 1);
  for (const key of Object.keys(before)) assert.deepEqual(s[key], before[key]);
  assert.equal(s.business.clearingBalance, 0); assert.equal(s.business.subscriptions.length, 3);
});
test('invalid existing business state is not silently reset', () => {
  const f = fixture(); f.s.business.version = 99; const before = structuredClone(f.s);
  assert.throws(() => ensureBusinessState(f.s, f.now()), { code: 'BUSINESS_STATE_INVALID' }); assert.deepEqual(f.s, before);
});
test('all declared business operations are explicit and no arbitrary network/shell tool exists', () => {
  assert.equal(BUSINESS_TYPES.length, 12); assert.equal(new Set(BUSINESS_TYPES).size, 12);
  const f = fixture(); assert.throws(() => f.prepare({ type: 'execute_shell' }), { code: 'UNSUPPORTED_ACTION' });
});
test('subscription records stay hidden before yellow confirmation and draft has no side effects', () => {
  const f = fixture(); const before = structuredClone(f.s);
  assert.deepEqual(publicBusinessState(f.s, f.now()).subscriptions, []);
  const t = f.task({ type: 'subscription_query' }); assert.equal(t.risk, 'yellow'); assert.deepEqual(f.s, before);
  const result = f.execute(t); assert.equal(result.subscriptions.length, 3);
  const view = publicBusinessState(f.s, f.now()); assert.equal(view.subscriptionsAuthorized, true); assert.equal(view.subscriptions.length, 3);
  assert.equal(f.s.balance, 1286000); assert.equal(f.s.ledger.length, 0);
});
test('subscription evidence distinguishes known authorization from a single inferred charge', () => {
  const f = fixture(); const r = f.run({ type: 'subscription_query' });
  const music = r.subscriptions.find(s => s.id === 'sub-music'); const video = r.subscriptions.find(s => s.id === 'sub-video');
  assert.equal(music.managed, true); assert.equal(music.sampleCount, 2); assert.equal(music.expectedRenewalDate, '2026-10-10');
  assert.equal(video.managed, false); assert.equal(video.bankMandateStatus, 'UNKNOWN'); assert.equal(video.sampleCount, 1);
  assert.equal(video.possiblePriceChange, null); assert.equal(video.renewalDateIsEstimate, true);
  assert.throws(() => f.prepare({ type: 'cancel_subscription', subscriptionId: 'sub-video', scope: 'bank_mandate' }), { code: 'SUBSCRIPTION_NOT_MANAGED' });
});
test('subscription cancel requires explicit scope and does not collapse merchant and bank state', () => {
  const f = fixture(); assert.throws(() => f.prepare({ type: 'cancel_subscription', subscriptionId: 'sub-music' }), { code: 'SUBSCRIPTION_SCOPE_REQUIRED' });
  const t = f.task({ type: 'cancel_subscription', subscriptionId: 'sub-music', scope: 'bank_mandate' }); assert.equal(t.risk, 'yellow');
  const r = f.execute(t); const sub = f.s.business.subscriptions[0];
  assert.equal(sub.bankMandateStatus, 'CANCELLED'); assert.equal(sub.merchantMembershipStatus, 'ACTIVE'); assert.match(r.text, /会员未被取消/);
  f.run({ type: 'cancel_subscription', subscriptionId: 'sub-music', scope: 'merchant_membership' });
  assert.equal(f.s.business.subscriptions[0].merchantMembershipStatus, 'CANCELLED');
  assert.equal(f.s.balance, 1286000); assert.equal(f.s.transactions.length, 19);
});
test('merchant-only cancellation leaves bank mandate and historical charge records intact', () => {
  const f = fixture(); const transactions = structuredClone(f.s.transactions);
  f.run({ type: 'cancel_subscription', subscriptionId: 'sub-cloud', scope: 'merchant_membership' });
  const sub = f.s.business.subscriptions[1]; assert.equal(sub.bankMandateStatus, 'ACTIVE'); assert.equal(sub.merchantMembershipStatus, 'CANCELLED');
  assert.deepEqual(f.s.transactions, transactions); assert.throws(() => f.prepare({ type: 'cancel_subscription', subscriptionId: sub.id, scope: 'merchant_membership' }), { code: 'SUBSCRIPTION_ALREADY_CANCELLED' });
});
test('subscription state changes invalidate prepared cancellation', () => {
  const f = fixture(); const stale = f.task({ type: 'cancel_subscription', subscriptionId: 'sub-cloud', scope: 'merchant_membership' });
  f.run({ type: 'cancel_subscription', subscriptionId: 'sub-cloud', scope: 'bank_mandate' }); const before = structuredClone(f.s);
  assert.throws(() => f.execute(stale), { code: 'SUBSCRIPTION_STATE_CHANGED' }); assert.deepEqual(f.s, before);
});
test('wealth catalogue is green, bounded and does not invent returns', () => {
  const f = fixture(); const before = structuredClone(f.s); const { returnResult: r } = f.prepare({ type: 'wealth_catalog' });
  assert.equal(r.risk, 'green'); assert.equal(r.products.length, 3); assert.match(r.text, /不保证/); assert.deepEqual(f.s, before);
  assert.equal(publicBusinessState(f.s, f.now()).returns, null);
});
test('risk questionnaire requires eleven explicit valid letter responses, is yellow and teaching-only', () => {
  const f = fixture();
  for (const answers of [null, [], [0, 1], [0, 1, 2, 0], ['0', 1, 2], [0, 1.5, 2], [-1, 1, 2], [0, 1, 3]]) {
    assert.throws(() => f.prepare({ type: 'risk_assessment', questionnaireVersion: riskFixture.VERSION, answers }), { code: 'INVALID_RISK_ANSWERS' });
  }
  const t = f.task({ type: 'risk_assessment', questionnaireVersion: riskFixture.VERSION, answers: riskFixture.LOW }); assert.equal(t.risk, 'yellow'); assert.equal(f.s.business.riskProfile, null);
  const result = f.execute(t); assert.equal(result.profile.riskLevel, 1); assert.equal(result.profile.teachingOnly, true); assert.match(result.text, /非|不是/);
});
test('risk profile changes invalidate earlier assessment and buy drafts', () => {
  const f = fixture(); f.highRisk();
  const staleAssessment = f.task({ type: 'risk_assessment', questionnaireVersion: riskFixture.VERSION, answers: riskFixture.HIGH });
  const buy = f.task({ type: 'wealth_buy', productId: 'demo-term7', amount: '500' });
  f.run({ type: 'risk_assessment', questionnaireVersion: riskFixture.VERSION, answers: riskFixture.LOW }); const before = structuredClone(f.s);
  assert.throws(() => f.execute(staleAssessment), { code: 'RISK_PROFILE_CHANGED' });
  assert.throws(() => f.execute(buy), { code: 'RISK_PROFILE_CHANGED' }); assert.deepEqual(f.s, before);
});
test('wealth buy rejects missing assessment, mismatch, unknown product, minimum and bad amount', () => {
  const f = fixture(); assert.throws(() => f.prepare({ type: 'wealth_buy', productId: 'demo-flex', amount: '100' }), { code: 'RISK_ASSESSMENT_REQUIRED' });
  f.run({ type: 'risk_assessment', questionnaireVersion: riskFixture.VERSION, answers: riskFixture.LOW });
  assert.throws(() => f.prepare({ type: 'wealth_buy', productId: 'demo-term30', amount: '1000' }), { code: 'RISK_MISMATCH' });
  assert.throws(() => f.prepare({ type: 'wealth_buy', productId: 'demo-flex', amount: '100' }), { code: 'RISK_MISMATCH' });
  f.highRisk();
  assert.throws(() => f.prepare({ type: 'wealth_buy', productId: 'made-up', amount: '100' }), { code: 'PRODUCT_NOT_FOUND' });
  assert.throws(() => f.prepare({ type: 'wealth_buy', productId: 'demo-flex', amount: '99.99' }), { code: 'BELOW_MINIMUM' });
  for (const amount of ['0', '-100', '1e3', '100.001', 'NaN', 100]) assert.throws(() => f.prepare({ type: 'wealth_buy', productId: 'demo-flex', amount }), { code: 'INVALID_AMOUNT' });
});
test('red wealth buy conserves money across owner, principal position, clearing and ledger', () => {
  const f = fixture(); f.highRisk(); const initial = f.s.balance;
  const t = f.task({ type: 'wealth_buy', productId: 'demo-flex', amount: '100.01' }); assert.equal(t.risk, 'red'); assert.equal(f.s.balance, initial);
  const r = f.execute(t); assert.equal(f.s.balance, initial - 10001); assert.equal(r.position.principalCents, 10001);
  assert.equal(f.s.business.clearingBalance, 10001); assert.equal(f.s.balance + f.s.business.clearingBalance, initial);
  assert.deepEqual({ debit: f.s.ledger[0].debitAccount, credit: f.s.ledger[0].creditAccount, cents: f.s.ledger[0].cents }, { debit: 'demo-owner', credit: 'demo-wealth-clearing', cents: 10001 });
  assert.equal(f.s.transactions.at(-1).type, 'investment_buy');
  assert.equal(t.status, 'AWAITING_CONFIRMATION', 'service, not extension, owns final receipt/status'); assert.equal(t.receipt, undefined);
});
test('questionnaire cannot average away unwillingness to lose principal or short liquidity needs', () => {
  const f = fixture(); f.run({ type: 'risk_assessment', questionnaireVersion: riskFixture.VERSION, answers: riskFixture.NO_LOSS });
  assert.throws(() => f.prepare({ type: 'wealth_buy', productId: 'demo-flex', amount: '100' }), { code: 'RISK_MISMATCH' });
  f.run({ type: 'risk_assessment', questionnaireVersion: riskFixture.VERSION, answers: riskFixture.SHORT });
  assert.equal(f.s.business.riskProfile.horizonDays, 0);
  assert.throws(() => f.prepare({ type: 'wealth_buy', productId: 'demo-term7', amount: '500' }), { code: 'RISK_MISMATCH' });
  assert.equal(f.prepare({ type: 'wealth_buy', productId: 'demo-flex', amount: '100' }).risk, 'red');
});
test('replaying an executed task is idempotent; same ID with changed action fails closed', () => {
  const f = fixture(); f.highRisk(); const t = f.task({ type: 'wealth_buy', productId: 'demo-flex', amount: '100' }); f.execute(t);
  const before = structuredClone(f.s); assert.equal(f.execute(t).idempotent, true); assert.deepEqual(f.s, before);
  assert.throws(() => f.execute({ ...t, action: { ...t.action, cents: 20000 } }), { code: 'BUSINESS_REPLAY_MISMATCH' }); assert.deepEqual(f.s, before);
});
test('buy checks reserved funds again at execution, with no partial updates on rejection', () => {
  const f = fixture(); f.highRisk(); const t = f.task({ type: 'wealth_buy', productId: 'demo-flex', amount: '100' });
  f.s.testReserved = f.s.balance - 9999; const before = structuredClone(f.s);
  assert.throws(() => f.execute(t), { code: 'INSUFFICIENT_FUNDS' }); assert.deepEqual(f.s, before);
  assert.throws(() => f.prepare({ type: 'wealth_buy', productId: 'demo-flex', amount: '100' }), { code: 'INSUFFICIENT_FUNDS' });
});
test('redeem requires actual position and maturity, and never credits fabricated returns', () => {
  const f = fixture(); f.highRisk(); const initial = f.s.balance;
  const buy = f.run({ type: 'wealth_buy', productId: 'demo-term7', amount: '500' });
  assert.throws(() => f.prepare({ type: 'wealth_redeem', positionId: buy.position.id, amount: '500' }), { code: 'POSITION_LOCKED' });
  assert.throws(() => f.prepare({ type: 'wealth_redeem', positionId: 'missing', amount: '1' }), { code: 'POSITION_NOT_FOUND' });
  f.tick(7 * 86400000 - 1); assert.throws(() => f.prepare({ type: 'wealth_redeem', positionId: buy.position.id, amount: '500' }), { code: 'POSITION_LOCKED' });
  f.tick(1); const t = f.task({ type: 'wealth_redeem', positionId: buy.position.id, amount: '500' }); assert.equal(t.risk, 'red'); f.execute(t);
  assert.equal(f.s.balance, initial); assert.equal(f.s.business.clearingBalance, 0); assert.equal(f.s.business.positions[0].status, 'CLOSED');
  assert.equal(f.s.ledger.at(-1).debitAccount, 'demo-wealth-clearing'); assert.equal(f.s.ledger.at(-1).creditAccount, 'demo-owner');
});
test('partial redemption increments position revision and invalidates stale redemption', () => {
  const f = fixture(); f.highRisk(); const p = f.run({ type: 'wealth_buy', productId: 'demo-flex', amount: '100' }).position;
  const stale = f.task({ type: 'wealth_redeem', positionId: p.id, amount: '100' });
  f.run({ type: 'wealth_redeem', positionId: p.id, amount: '20.25' });
  const before = structuredClone(f.s); assert.throws(() => f.execute(stale), { code: 'POSITION_STATE_CHANGED' }); assert.deepEqual(f.s, before);
  assert.equal(f.s.business.positions[0].principalCents, 7975); assert.equal(f.s.business.clearingBalance, 7975);
  assert.throws(() => f.prepare({ type: 'wealth_redeem', positionId: p.id, amount: '79.76' }), { code: 'INSUFFICIENT_POSITION' });
});
test('positions query returns exact recorded principal, and ledger mismatch stops operations', () => {
  const f = fixture(); f.highRisk(); f.run({ type: 'wealth_buy', productId: 'demo-flex', amount: '123.45' });
  const r = f.prepare({ type: 'wealth_positions' }).returnResult; assert.equal(r.risk, 'green'); assert.equal(r.principalTotal, 12345); assert.equal(r.returns, null);
  f.s.business.clearingBalance += 1; const before = structuredClone(f.s);
  assert.throws(() => f.prepare({ type: 'wealth_positions' }), { code: 'WEALTH_LEDGER_MISMATCH' }); assert.deepEqual(f.s, before);
});
test('virtual card application is yellow and yields only non-payable DEMO identifiers', () => {
  const f = fixture(); const t = f.task({ type: 'apply_virtual_card' }); assert.equal(t.risk, 'yellow'); assert.equal(f.s.cards.length, 2);
  const r = f.execute(t); assert.equal(f.s.cards.length, 3); assert.match(r.card.demoNumber, /^DEMO-VIRTUAL-\d{4}$/); assert.ok(!/\d{12,19}/.test(JSON.stringify(r.card)));
  assert.equal(r.card.virtual, true); assert.equal(r.card.sandbox, true); assert.equal(f.s.balance, 1286000);
});
test('virtual cards use unique local suffixes and a bounded record count', () => {
  const f = fixture(); for (let i = 0; i < 10; i++) f.run({ type: 'apply_virtual_card' });
  assert.equal(new Set(f.s.cards.map(c => c.last4)).size, 12); const before = structuredClone(f.s);
  assert.throws(() => f.prepare({ type: 'apply_virtual_card' }), { code: 'CARD_LIMIT_REACHED' }); assert.deepEqual(f.s, before);
});
test('temporary lock and unlock are red, distinct from lost-card FROZEN state', () => {
  const f = fixture(); const lock = f.task({ type: 'temporary_lock_card', cardLast4: '8806' }); assert.equal(lock.risk, 'red'); f.execute(lock);
  assert.equal(f.s.cards[0].status, 'LOCKED'); const unlock = f.task({ type: 'unlock_card', cardLast4: '8806' }); assert.equal(unlock.risk, 'red'); f.execute(unlock);
  assert.equal(f.s.cards[0].status, 'ACTIVE'); f.s.cards[0].status = 'FROZEN';
  assert.throws(() => f.prepare({ type: 'unlock_card', cardLast4: '8806' }), { code: 'CARD_REQUIRES_UNFREEZE' });
  assert.throws(() => f.prepare({ type: 'temporary_lock_card', cardLast4: '8806' }), { code: 'CARD_NOT_ACTIVE' });
});
test('card operations require unique explicit tail and re-check state after authorization', () => {
  const f = fixture(); assert.throws(() => f.prepare({ type: 'temporary_lock_card' }), { code: 'CARD_REQUIRED' });
  assert.throws(() => f.prepare({ type: 'temporary_lock_card', cardLast4: '9999' }), { code: 'CARD_NOT_FOUND' });
  const t = f.task({ type: 'temporary_lock_card', cardLast4: '8806' }); f.s.cards[0].status = 'FROZEN'; const before = structuredClone(f.s);
  assert.throws(() => f.execute(t), { code: 'CARD_STATE_CHANGED' }); assert.deepEqual(f.s, before);
});
test('card restriction validates channel/boolean, changes only its channel and invalidates stale plans', () => {
  const f = fixture();
  for (const bad of [{ channel: 'all', enabled: false }, { channel: 'online', enabled: 'false' }]) assert.throws(() => f.prepare({ type: 'card_restriction', cardLast4: '8806', ...bad }), { code: 'INVALID_CARD_RESTRICTION' });
  const stale = f.task({ type: 'card_restriction', cardLast4: '8806', channel: 'overseas', enabled: false });
  const change = f.task({ type: 'card_restriction', cardLast4: '8806', channel: 'online', enabled: false }); assert.equal(change.risk, 'red'); f.execute(change);
  assert.deepEqual(f.s.business.cardControls['card-8806'], { online: false, overseas: true, revision: 1 });
  const before = structuredClone(f.s); assert.throws(() => f.execute(stale), { code: 'CARD_STATE_CHANGED' }); assert.deepEqual(f.s, before);
  assert.throws(() => f.prepare({ type: 'card_restriction', cardLast4: '8806', channel: 'online', enabled: false }), { code: 'CARD_RESTRICTION_UNCHANGED' });
});
test('credit request is red and pending only; cannot award credit or change spending limit', () => {
  const f = fixture(); const before = { balance: f.s.balance, cards: structuredClone(f.s.cards) };
  const t = f.task({ type: 'card_credit_request', cardLast4: '6219', amount: '10000' }); assert.equal(t.risk, 'red'); const r = f.execute(t);
  assert.equal(r.application.requestedLimitCents, 1000000); assert.equal(r.application.status, 'PENDING_REVIEW');
  assert.equal(f.s.balance, before.balance); assert.deepEqual(f.s.cards, before.cards); assert.equal(f.s.ledger.length, 0);
});
test('executor rejects green/down-tier, cancelled and missing-task handoffs; service still owns real authentication', () => {
  const f = fixture(); const yellow = f.task({ type: 'subscription_query' }); const red = f.task({ type: 'temporary_lock_card', cardLast4: '8806' });
  const before = structuredClone(f.s);
  for (const t of [{ ...yellow, risk: 'green' }, { ...red, risk: 'yellow' }, { ...red, status: 'CANCELLED' }, { ...red, id: '' }])
    assert.throws(() => f.execute(t), { code: 'BUSINESS_AUTH_HANDOFF_INVALID' });
  assert.throws(() => f.execute({ id: 'read', action: { type: 'wealth_catalog' }, risk: 'green', status: 'AWAITING_CONFIRMATION' }), { code: 'NOT_EXECUTABLE_BUSINESS_ACTION' });
  assert.deepEqual(f.s, before);
});
test('failure during audit generation cannot leave half a monetary operation committed', () => {
  const f = fixture(); f.highRisk(); const t = f.task({ type: 'wealth_buy', productId: 'demo-flex', amount: '100' });
  const before = structuredClone(f.s); f.tools.audit = () => { throw new Error('injected audit failure'); };
  assert.throws(() => f.execute(t), /injected audit failure/); assert.deepEqual(f.s, before);
});
test('sessions and public snapshots cannot mutate another account or internal state', () => {
  const one = fixture(); const two = fixture(); one.highRisk(); one.run({ type: 'wealth_buy', productId: 'demo-flex', amount: '100' });
  assert.equal(two.s.business.positions.length, 0); assert.equal(two.s.balance, 1286000);
  const view = publicBusinessState(one.s, one.now()); view.positions[0].principalCents = 0; view.products[0].name = 'tampered';
  assert.equal(one.s.business.positions[0].principalCents, 10000); assert.notEqual(publicBusinessState(one.s, one.now()).products[0].name, 'tampered');
});
