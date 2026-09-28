const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { TuitionSandboxService, DomainError } = require('../sandbox/service');
const { createFileStore, createMemoryStore } = require('../sandbox/store');

function deterministicIds(prefix = 'id') {
  let index = 0;
  return () => `${prefix}${++index}`;
}

function makeService(options = {}) {
  return new TuitionSandboxService({
    store: options.store || createMemoryStore(),
    clock: options.clock || (() => new Date('2026-09-07T10:00:00.000Z')),
    idFactory: options.idFactory || deterministicIds(),
  });
}

function standardIntent(overrides = {}) {
  return {
    recipientId: 'xmu-malaysia',
    tuitionMyrCents: 500_000,
    reserveMyrCents: 100_000,
    deadline: '2026-10-10T09:00:00.000Z',
    simulateOutcome: 'success',
    ...overrides,
  };
}

function expectDomainError(fn, code) {
  assert.throws(fn, (error) => error instanceof DomainError && error.code === code);
}

test('standard tuition payment preserves reserve and reconciles both sides', () => {
  const service = makeService();
  const { token } = service.createSession('Standard student');
  const quote = service.createQuote(token, standardIntent());

  assert.equal(quote.myrGapCents, 400_000);
  assert.equal(quote.cnyConversionCents, 800_000);
  assert.equal(quote.feeCnyCents, 1_000);
  assert.equal(quote.totalCnyDebitCents, 801_000);
  assert.equal(quote.executable, true);

  const confirmation = service.confirm(token, quote.id);
  const order = service.pay(token, confirmation.id, standardIntent());
  const state = service.getState(token);
  const receipt = state.receipts.find((item) => item.id === order.receiptId);

  assert.equal(order.status, 'SUCCEEDED');
  assert.deepEqual(state.balances, { CNY: 199_000, MYR: 100_000 });
  assert.equal(state.recipients.find((item) => item.id === 'xmu-malaysia').balanceMyrCents, 500_000);
  assert.equal(state.ledger.length, 5);
  assert.deepEqual(receipt.finalBalances, { CNY: 199_000, MYR: 100_000 });
  assert.equal(receipt.feeCnyCents, 1_000);
});

test('insufficient CNY produces a blocked plan and moves no funds', () => {
  const service = makeService();
  const { token } = service.createSession('Low funds');
  service.reset(token, { cnyCents: 100_000, myrCents: 200_000 });
  const before = service.getState(token);
  const quote = service.createQuote(token, standardIntent());

  assert.equal(quote.executable, false);
  assert.deepEqual(quote.reasons, ['INSUFFICIENT_CNY']);
  expectDomainError(() => service.confirm(token, quote.id), 'PLAN_NOT_EXECUTABLE');
  const after = service.getState(token);
  assert.deepEqual(after.balances, before.balances);
  assert.deepEqual(after.ledger, []);
});

test('zero tuition is rejected as an invalid financial intent', () => {
  const service = makeService();
  const { token } = service.createSession('Invalid amount');
  expectDomainError(() => service.createQuote(token, standardIntent({ tuitionMyrCents: 0 })), 'INVALID_AMOUNT');
  assert.equal(service.getState(token).quotes.length, 0);
});

test('duplicate payment submission returns one order and moves funds once', () => {
  const service = makeService();
  const { token } = service.createSession('Retry student');
  const quote = service.createQuote(token, standardIntent());
  const confirmation = service.confirm(token, quote.id);
  const first = service.pay(token, confirmation.id, standardIntent());
  const second = service.pay(token, confirmation.id, standardIntent());
  const state = service.getState(token);

  assert.equal(second.id, first.id);
  assert.equal(state.orders.length, 1);
  assert.equal(state.receipts.length, 1);
  assert.equal(state.ledger.length, 5);
  assert.deepEqual(state.balances, { CNY: 199_000, MYR: 100_000 });
});

test('payment without confirmation and modified intent are rejected', () => {
  const service = makeService();
  const { token } = service.createSession('Protected student');
  expectDomainError(() => service.pay(token, 'missing', standardIntent()), 'CONFIRMATION_REQUIRED');

  const quote = service.createQuote(token, standardIntent());
  const confirmation = service.confirm(token, quote.id);
  expectDomainError(
    () => service.pay(token, confirmation.id, standardIntent({ recipientId: 'student-housing' })),
    'CONFIRMATION_MISMATCH'
  );
  expectDomainError(
    () => service.pay(token, confirmation.id, standardIntent({ tuitionMyrCents: 499_900 })),
    'CONFIRMATION_MISMATCH'
  );
  assert.deepEqual(service.getState(token).balances, { CNY: 1_000_000, MYR: 200_000 });
});

test('missing and expired quotes block confirmation without defaulting to 1:1', () => {
  let now = new Date('2026-09-07T10:00:00.000Z');
  const service = makeService({ clock: () => now });
  const { token } = service.createSession('Quote student');
  expectDomainError(
    () => service.createQuote(token, standardIntent({ quoteMode: 'missing' })),
    'QUOTE_UNAVAILABLE'
  );

  const quote = service.createQuote(token, standardIntent());
  assert.equal(quote.rate.value, 0.5);
  now = new Date('2026-09-07T10:06:00.000Z');
  expectDomainError(() => service.confirm(token, quote.id), 'QUOTE_EXPIRED');
  assert.deepEqual(service.getState(token).balances, { CNY: 1_000_000, MYR: 200_000 });
});

test('timeout remains pending, does not claim success and is idempotent', () => {
  const service = makeService();
  const { token } = service.createSession('Timeout student');
  const intent = standardIntent({ simulateOutcome: 'timeout' });
  const quote = service.createQuote(token, intent);
  const confirmation = service.confirm(token, quote.id);
  const first = service.pay(token, confirmation.id, intent);
  const second = service.pay(token, confirmation.id, intent);
  const state = service.getState(token);

  assert.equal(first.status, 'PENDING_RECONCILIATION');
  assert.equal(second.id, first.id);
  assert.equal(state.orders.length, 1);
  assert.equal(state.receipts.length, 0);
  assert.equal(state.ledger.length, 0);
  assert.deepEqual(state.balances, { CNY: 1_000_000, MYR: 200_000 });
});

test('file-backed state survives a service restart', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unitally-t001-'));
  t.after(() => {
    if (tempDir.startsWith(os.tmpdir())) fs.rmSync(tempDir, { recursive: true, force: true });
  });
  const filePath = path.join(tempDir, 'state.json');
  const first = makeService({ store: createFileStore(filePath), idFactory: deterministicIds('a') });
  const { token } = first.createSession('Persistent student');
  const quote = first.createQuote(token, standardIntent());
  const confirmation = first.confirm(token, quote.id);
  const order = first.pay(token, confirmation.id, standardIntent());

  const restarted = makeService({ store: createFileStore(filePath), idFactory: deterministicIds('b') });
  const state = restarted.getState(token);
  assert.equal(state.orders[0].id, order.id);
  assert.deepEqual(state.balances, { CNY: 199_000, MYR: 100_000 });
  assert.equal(state.receipts.length, 1);
});

test('opaque sessions isolate users and orders at the service boundary', () => {
  const service = makeService();
  const first = service.createSession('Student A');
  const second = service.createSession('Student B');
  const quote = service.createQuote(first.token, standardIntent());
  const confirmation = service.confirm(first.token, quote.id);
  const order = service.pay(first.token, confirmation.id, standardIntent());

  const secondState = service.getState(second.token);
  assert.deepEqual(secondState.balances, { CNY: 1_000_000, MYR: 200_000 });
  assert.equal(secondState.orders.length, 0);
  expectDomainError(() => service.getOrder(second.token, order.id), 'ORDER_NOT_FOUND');
  expectDomainError(() => service.getState('invalid-token'), 'UNAUTHORIZED');
});

test('AI endpoint contract reports the truthful disconnected state', () => {
  const status = makeService().getAiStatus();
  assert.equal(status.connected, false);
  assert.equal(status.provider, null);
  assert.equal(status.structuredFlowAvailable, true);
  assert.equal(status.toolInterface.confirmationRequired, true);
});
