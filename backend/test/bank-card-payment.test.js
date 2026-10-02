const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BankService } = require('../bank/service');
const { createBankStore } = require('../bank/store');
const { validatePlan } = require('../bank/planner');
function fixture() {
  let now = Date.parse('2026-10-02T10:00:00+08:00');
  const store = createBankStore(); const service = new BankService({ store, planner: { configured: false }, now: () => now });
  const { token } = service.create();
  const prepare = async a => { const r = await service.prepareManual(token, a); const blocked = r.message.results.find(x => x.type === 'blocked'); if (blocked) { assert.equal(r.state.tasks.filter(t => t.status === 'AWAITING_CONFIRMATION').length, 0); throw Object.assign(new Error(blocked.text), { code: blocked.code }); } return r.state.tasks[0]; };
  const confirm = task => service.confirm(token, task.id, { confirmed: true, ...(task.risk === 'red' ? { code: service.challenge(token, task.id).demoCode } : {}) });
  return { service, store, token, prepare, confirm, get: () => service.get(token), run: async a => confirm(await prepare(a)), tick: ms => now += ms };
}
const purchase = (extra = {}) => ({ type: 'card_purchase', cardLast4: '8806', amount: '20.00', online: true, overseas: false, ...extra });
test('manual purchase requires red confirmation, settles once and produces matching ledger', async () => {
  const f = fixture(); const task = await f.prepare(purchase()); assert.equal(task.risk, 'red'); assert.equal(f.get().balance, 1286000);
  assert.throws(() => f.service.confirm(f.token, task.id, {}), { code: 'CONFIRMATION_REQUIRED' });
  const result = f.confirm(task); assert.equal(result.state.balance, 1284000); assert.equal(result.state.ledger.length, 1);
  assert.equal(result.state.transactions.at(-1).type, 'expense');
  f.service.confirm(f.token, task.id, { confirmed: true }); assert.equal(f.get().ledger.length, 1); assert.equal(f.get().balance, 1284000);
});
test('online restriction blocks online purchase but allows domestic offline', async () => {
  const f = fixture(); await f.run({ type: 'card_restriction', cardLast4: '8806', channel: 'online', enabled: false });
  await assert.rejects(() => f.prepare(purchase()), { code: 'ONLINE_PAYMENT_BLOCKED' }); assert.equal(f.get().balance, 1286000);
  await f.run(purchase({ online: false })); assert.equal(f.get().balance, 1284000);
});
test('overseas restriction applies independently to both online and offline', async () => {
  const f = fixture(); await f.run({ type: 'card_restriction', cardLast4: '8806', channel: 'overseas', enabled: false });
  for (const online of [false, true]) await assert.rejects(() => f.prepare(purchase({ online, overseas: true })), { code: 'OVERSEAS_PAYMENT_BLOCKED' });
  await f.run(purchase()); assert.equal(f.get().balance, 1284000);
});
test('locked and lost cards refuse payment; unlock restores eligibility', async () => {
  const f = fixture(); await f.run({ type: 'temporary_lock_card', cardLast4: '8806' });
  await assert.rejects(() => f.prepare(purchase()), { code: 'CARD_NOT_ACTIVE' });
  await f.run({ type: 'unlock_card', cardLast4: '8806' }); await f.run(purchase());
  await f.run({ type: 'freeze_card', cardLast4: '8806' }); await assert.rejects(() => f.prepare(purchase()), { code: 'CARD_NOT_ACTIVE' });
});
test('daily card spending is cumulative, exact boundary passes, next cent fails, next day resets', async () => {
  const f = fixture(); await f.run({ type: 'card_limit', cardLast4: '8806', limit: '40' });
  await f.run(purchase()); await f.run(purchase());
  await assert.rejects(() => f.prepare(purchase({ amount: '0.01' })), { code: 'CARD_DAILY_LIMIT' });
  f.tick(86400000); await f.run(purchase()); assert.equal(f.get().ledger.length, 3);
});
test('reserved budget cannot be spent by a card purchase', async () => {
  const f = fixture(); await f.run({ type: 'reserve_budget', amount: '12850', label: '测试生日预算', eventAt: '2026-10-10T10:00:00+08:00' });
  await assert.rejects(() => f.prepare(purchase()), { code: 'INSUFFICIENT_FUNDS' }); assert.equal(f.get().balance, 1286000);
});
test('confirmation rechecks changed card rules and preserves balance', async () => {
  const f = fixture(); const task = await f.prepare(purchase());
  f.store.transact(db => { const s = Object.values(db.sessions)[0]; s.business.cardControls[s.cards[0].id] = { online: false, overseas: true, revision: 1 }; });
  assert.throws(() => f.confirm(task), { code: 'ONLINE_PAYMENT_BLOCKED' }); assert.equal(f.get().balance, 1286000);
});
test('malformed fields, negative amounts and unknown cards are denied; model cannot create manual purchase', async () => {
  const f = fixture();
  for (const extra of [{ online: 'true' }, { overseas: undefined }, { confirmed: true }, { cardLast4: '1' }]) await assert.rejects(() => f.prepare(purchase(extra)), { code: 'INVALID_MANUAL_ACTION' });
  await assert.rejects(() => f.prepare(purchase({ amount: '-1' })), { code: 'INVALID_AMOUNT' });
  await assert.rejects(() => f.prepare(purchase({ cardLast4: '9999' })), { code: 'CARD_NOT_FOUND' });
  assert.throws(() => validatePlan({ actions: [purchase()], question: '' }), { code: 'INVALID_AI_PLAN' });
});
