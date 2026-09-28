const fs = require('fs');
const path = require('path');

const baseUrl = process.argv[2] || 'http://127.0.0.1:5000';
const outputPath = process.argv[3];
const checks = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(apiPath, { method = 'GET', token, body, expect = 200 } = {}) {
  const response = await fetch(`${baseUrl}${apiPath}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (response.status !== expect) {
    throw new Error(`${method} ${apiPath}: expected ${expect}, got ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function session(label) {
  return request('/api/tuition/sessions', { method: 'POST', body: { label }, expect: 201 });
}

const intent = (overrides = {}) => ({
  recipientId: 'xmu-malaysia',
  tuitionMyr: 5000,
  reserveMyr: 1000,
  deadline: '2026-10-10T09:00:00.000Z',
  quoteMode: 'normal',
  simulateOutcome: 'success',
  ...overrides,
});

async function runCheck(id, title, work) {
  const startedAt = Date.now();
  try {
    const evidence = await work();
    checks.push({ id, title, passed: true, durationMs: Date.now() - startedAt, evidence });
  } catch (error) {
    checks.push({ id, title, passed: false, durationMs: Date.now() - startedAt, error: error.message });
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  let standardOrderId;

  await runCheck('normal-payment', 'Standard payment reaches the school and preserves living funds', async () => {
    const created = await session('API standard case');
    await request('/api/tuition/reset', { method: 'POST', token: created.token, body: { cnyBalance: 10000, myrBalance: 2000 } });
    const quote = await request('/api/tuition/quotes', { method: 'POST', token: created.token, body: intent(), expect: 201 });
    const confirmation = await request('/api/tuition/confirmations', { method: 'POST', token: created.token, body: { quoteId: quote.id }, expect: 201 });
    const first = await request('/api/tuition/payments', { method: 'POST', token: created.token, body: { confirmationId: confirmation.id, intent: intent() }, expect: 201 });
    const second = await request('/api/tuition/payments', { method: 'POST', token: created.token, body: { confirmationId: confirmation.id, intent: intent() }, expect: 201 });
    const state = await request('/api/tuition/state', { token: created.token });
    standardOrderId = first.id;
    assert(quote.myrGapCents === 400000, 'Expected MYR 4,000 gap');
    assert(quote.totalCnyDebitCents === 801000, 'Expected CNY 8,010 total debit');
    assert(first.status === 'SUCCEEDED', 'Payment did not succeed');
    assert(second.id === first.id, 'Duplicate submission created another order');
    assert(state.orders.length === 1 && state.receipts.length === 1, 'Expected one order and one receipt');
    assert(state.balances.CNY === 199000 && state.balances.MYR === 100000, 'Final student balances do not match');
    assert(state.recipients.find((item) => item.id === 'xmu-malaysia').balanceMyrCents === 500000, 'Recipient was not credited');
    assert(state.ledger.length === 5, 'Expected five audit entries');
    return {
      quote: {
        myrGapCents: quote.myrGapCents,
        cnyConversionCents: quote.cnyConversionCents,
        feeCnyCents: quote.feeCnyCents,
        totalCnyDebitCents: quote.totalCnyDebitCents,
        rate: quote.rate,
        rateSource: quote.rateSource,
      },
      orderId: first.id,
      duplicateReturnedOrderId: second.id,
      receiptId: first.receiptId,
      finalBalances: state.balances,
      recipientBalanceMyrCents: state.recipients.find((item) => item.id === 'xmu-malaysia').balanceMyrCents,
      ledger: state.ledger,
    };
  });

  await runCheck('insufficient-funds', 'Insufficient funding is blocked without mutation', async () => {
    const created = await session('API insufficient case');
    await request('/api/tuition/reset', { method: 'POST', token: created.token, body: { cnyBalance: 1000, myrBalance: 2000 } });
    const quote = await request('/api/tuition/quotes', { method: 'POST', token: created.token, body: intent(), expect: 201 });
    const blocked = await request('/api/tuition/confirmations', { method: 'POST', token: created.token, body: { quoteId: quote.id }, expect: 409 });
    const state = await request('/api/tuition/state', { token: created.token });
    assert(quote.executable === false && quote.reasons.includes('INSUFFICIENT_CNY'), 'Insufficient reason missing');
    assert(blocked.error === 'PLAN_NOT_EXECUTABLE', 'Confirmation was not blocked');
    assert(state.balances.CNY === 100000 && state.balances.MYR === 200000, 'Funds changed on blocked plan');
    assert(state.ledger.length === 0, 'Ledger changed on blocked plan');
    return { quoteExecutable: quote.executable, reasons: quote.reasons, balances: state.balances, ledgerCount: state.ledger.length };
  });

  await runCheck('confirmation-guards', 'Unconfirmed and changed payment intents are rejected', async () => {
    const created = await session('API confirmation guard');
    const unconfirmed = await request('/api/tuition/payments', {
      method: 'POST', token: created.token, body: { confirmationId: 'missing', intent: intent() }, expect: 403,
    });
    const quote = await request('/api/tuition/quotes', { method: 'POST', token: created.token, body: intent(), expect: 201 });
    const confirmation = await request('/api/tuition/confirmations', { method: 'POST', token: created.token, body: { quoteId: quote.id }, expect: 201 });
    const changedRecipient = await request('/api/tuition/payments', {
      method: 'POST', token: created.token,
      body: { confirmationId: confirmation.id, intent: intent({ recipientId: 'student-housing' }) }, expect: 409,
    });
    const changedAmount = await request('/api/tuition/payments', {
      method: 'POST', token: created.token,
      body: { confirmationId: confirmation.id, intent: intent({ tuitionMyr: 4999 }) }, expect: 409,
    });
    const state = await request('/api/tuition/state', { token: created.token });
    assert(unconfirmed.error === 'CONFIRMATION_REQUIRED', 'Unconfirmed call was not rejected');
    assert(changedRecipient.error === 'CONFIRMATION_MISMATCH', 'Changed recipient was not rejected');
    assert(changedAmount.error === 'CONFIRMATION_MISMATCH', 'Changed amount was not rejected');
    assert(state.orders.length === 0 && state.ledger.length === 0, 'Guard failures moved funds');
    return { unconfirmed: unconfirmed.error, changedRecipient: changedRecipient.error, changedAmount: changedAmount.error, balances: state.balances };
  });

  await runCheck('missing-quote', 'Unavailable FX quote never defaults to 1:1', async () => {
    const created = await session('API missing quote');
    const result = await request('/api/tuition/quotes', { method: 'POST', token: created.token, body: intent({ quoteMode: 'missing' }), expect: 503 });
    const state = await request('/api/tuition/state', { token: created.token });
    assert(result.error === 'QUOTE_UNAVAILABLE', 'Missing quote was not explicit');
    assert(state.quotes.length === 0 && state.ledger.length === 0, 'Missing quote created financial state');
    return { error: result.error, message: result.message, quotes: state.quotes.length, ledgerCount: state.ledger.length };
  });

  await runCheck('timeout-idempotency', 'Processor timeout remains unknown and cannot double pay', async () => {
    const created = await session('API timeout case');
    const timeoutIntent = intent({ simulateOutcome: 'timeout' });
    const quote = await request('/api/tuition/quotes', { method: 'POST', token: created.token, body: timeoutIntent, expect: 201 });
    const confirmation = await request('/api/tuition/confirmations', { method: 'POST', token: created.token, body: { quoteId: quote.id }, expect: 201 });
    const first = await request('/api/tuition/payments', { method: 'POST', token: created.token, body: { confirmationId: confirmation.id, intent: timeoutIntent }, expect: 201 });
    const second = await request('/api/tuition/payments', { method: 'POST', token: created.token, body: { confirmationId: confirmation.id, intent: timeoutIntent }, expect: 201 });
    const state = await request('/api/tuition/state', { token: created.token });
    assert(first.status === 'PENDING_RECONCILIATION', 'Timeout incorrectly reported success');
    assert(second.id === first.id && state.orders.length === 1, 'Timeout retry duplicated order');
    assert(state.receipts.length === 0 && state.ledger.length === 0, 'Timeout produced success evidence');
    assert(state.balances.CNY === 1000000 && state.balances.MYR === 200000, 'Timeout mutated balances');
    return { orderId: first.id, retryOrderId: second.id, status: first.status, balances: state.balances, receipts: state.receipts.length };
  });

  await runCheck('session-isolation', 'A second session cannot read the first session order', async () => {
    const second = await session('API isolated session');
    const denied = await request(`/api/tuition/orders/${standardOrderId}`, { token: second.token, expect: 404 });
    const secondState = await request('/api/tuition/state', { token: second.token });
    const invalid = await request('/api/tuition/state', { token: 'invalid-token', expect: 401 });
    assert(denied.error === 'ORDER_NOT_FOUND', 'Cross-session order was visible');
    assert(secondState.orders.length === 0, 'Second session inherited orders');
    assert(invalid.error === 'UNAUTHORIZED', 'Invalid token was accepted');
    return { crossSessionRead: denied.error, secondSessionOrders: secondState.orders.length, invalidToken: invalid.error };
  });

  await runCheck('ai-disclosure', 'AI interface truthfully reports no configured model', async () => {
    const status = await request('/api/tuition/ai/status');
    const plan = await request('/api/tuition/ai/plan', { method: 'POST', body: { prompt: 'Pay my tuition' }, expect: 503 });
    assert(status.connected === false && status.provider === null, 'AI status was not disconnected');
    assert(plan.error === 'AI_NOT_CONFIGURED', 'AI endpoint faked a response');
    return { status, planError: plan.error, planMessage: plan.message };
  });

  const result = {
    taskId: 'T001',
    kind: 'live-http-api-acceptance',
    baseUrl,
    startedAt,
    completedAt: new Date().toISOString(),
    passed: checks.filter((item) => item.passed).length,
    total: checks.length,
    allPassed: checks.every((item) => item.passed),
    checks,
  };

  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (outputPath) {
    fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
    fs.writeFileSync(path.resolve(outputPath), serialized, 'utf8');
  }
  process.stdout.write(serialized);
  if (!result.allPassed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
