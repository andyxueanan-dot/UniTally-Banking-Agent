const { test } = require('node:test');
const assert = require('node:assert/strict');
const { seedSession } = require('../bank/seed');
const { analyzeLedger, ledgerDetails } = require('../bank/analytics');
const now = Date.parse('2026-09-26T07:00:00Z');
const seed = () => seedSession(now).transactions;
test('bill totals and category drivers reconcile exactly to source rows', () => {
  const r = analyzeLedger(seed(), { period: 'compare' }, now);
  assert.equal(r.total, 112500); assert.equal(r.previous, 51400);
  assert.equal(r.drivers.reduce((n, d) => n + d.deltaCents, 0), r.total - r.previous);
  assert.equal(r.categories.reduce((n, c) => n + c.cents, 0), r.total);
  assert.equal(r.drivers[0].name, '购物'); assert.equal(r.drivers[0].deltaCents, 34700);
});
test('duplicate evidence includes both source records and does not claim fraud', () => {
  const r = analyzeLedger(seed(), {}, now); assert.equal(r.anomalies.length, 1);
  assert.deepEqual(r.anomalies[0].rowIds, ['DEMO-C12', 'DEMO-C13']);
  assert.match(r.anomalies[0].assessment, /不能据此断言/);
});
test('category and merchant filters do not silently return unfiltered totals', () => {
  const r = analyzeLedger(seed(), { category: '餐饮', merchant: '咖啡' }, now);
  assert.equal(r.total, 10800); assert.equal(r.rows.length, 3);
  assert.throws(() => analyzeLedger(seed(), { category: 'fake' }, now), { code: 'INVALID_CATEGORY' });
});
test('annual reports state limited data coverage rather than inventing missing months', () => {
  const r = analyzeLedger(seed(), { period: 'this_year' }, now); assert.equal(r.total, 163900); assert.equal(r.coverage.sampleOnly, true);
  const empty = analyzeLedger(seed(), { period: 'last_year' }, now); assert.equal(empty.total, 0); assert.match(empty.text, /不代表/);
});
test('ledger details include transfers but expense reports never double count them', () => {
  const rows = [...seed(), { id: 'T1', date: '2026-09-26', merchant: '王明', cents: 20000, type: 'transfer', category: '转账' }];
  const r = ledgerDetails(rows, {}, now); assert.equal(r.rows.length, 15); assert.equal(r.expenseTotal, 112500); assert.equal(r.transferTotal, 20000);
  assert.equal(analyzeLedger(rows, {}, now).total, 112500);
});
test('month rollover does not relabel old data as current-month spending', () => {
  const r = analyzeLedger(seed(), {}, Date.parse('2026-10-01T00:00:00Z')); assert.equal(r.total, 0); assert.equal(r.period, '2026-10');
  const prev = analyzeLedger(seed(), { period: 'last_month' }, Date.parse('2026-10-01T00:00:00Z')); assert.equal(prev.total, 112500);
});
