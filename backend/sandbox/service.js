const crypto = require('crypto');

const FIXED_SANDBOX_TIME = '2026-09-07T10:00:00.000Z';
const QUOTE_TTL_MS = 5 * 60 * 1000;
const ARRIVAL_DELAY_MS = 30 * 60 * 1000;
const FEE_CNY_CENTS = 1000;
const RATE = { numerator: 1, denominator: 2 };
const RATE_SOURCE = 'UniTally Competition Sandbox FX v1 (deterministic, not a live market rate)';
const RECIPIENTS = {
  'xmu-malaysia': {
    id: 'xmu-malaysia',
    name: 'University Tuition Office',
    accountMasked: 'MYR •••• 4821',
  },
  'student-housing': {
    id: 'student-housing',
    name: 'Campus Housing Office',
    accountMasked: 'MYR •••• 6318',
  },
};

class DomainError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertIntegerCents(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError('INVALID_AMOUNT', `${name} must be a non-negative integer number of cents.`);
  }
}

function createUser(id, label, cnyCents = 1_000_000, myrCents = 200_000) {
  return {
    id,
    label,
    balances: { CNY: cnyCents, MYR: myrCents },
    recipients: Object.fromEntries(Object.keys(RECIPIENTS).map((key) => [key, 0])),
    quotes: {},
    confirmations: {},
    orders: {},
    receipts: {},
    ledger: [],
  };
}

class TuitionSandboxService {
  constructor({ store, clock = () => new Date(FIXED_SANDBOX_TIME), idFactory = () => crypto.randomUUID() }) {
    this.store = store;
    this.clock = clock;
    this.idFactory = idFactory;
  }

  now() {
    return new Date(this.clock());
  }

  createSession(label = 'Student sandbox') {
    return this.store.mutate((state) => {
      const userId = `usr_${this.idFactory()}`;
      const token = `sandbox_${this.idFactory()}`;
      state.users[userId] = createUser(userId, String(label).slice(0, 60));
      state.sessions[token] = { userId, createdAt: this.now().toISOString() };
      return { token, userId, label: state.users[userId].label };
    });
  }

  requireUser(token) {
    if (!token || !this.store.read().sessions[token]) {
      throw new DomainError('UNAUTHORIZED', 'A valid sandbox session is required.', 401);
    }
    const { userId } = this.store.read().sessions[token];
    const user = this.store.read().users[userId];
    if (!user) throw new DomainError('UNAUTHORIZED', 'Sandbox session owner no longer exists.', 401);
    return user;
  }

  publicState(user) {
    return {
      user: { id: user.id, label: user.label },
      balances: clone(user.balances),
      recipients: Object.values(RECIPIENTS).map((recipient) => ({
        ...recipient,
        balanceMyrCents: user.recipients[recipient.id] || 0,
      })),
      quotes: Object.values(user.quotes).map(clone),
      confirmations: Object.values(user.confirmations).map(clone),
      orders: Object.values(user.orders).map(clone),
      receipts: Object.values(user.receipts).map(clone),
      ledger: clone(user.ledger),
      sandboxClock: this.now().toISOString(),
      disclaimer: 'All balances, quotes and payments are fictional sandbox data. No real money moves.',
    };
  }

  getState(token) {
    return this.publicState(this.requireUser(token));
  }

  reset(token, { cnyCents = 1_000_000, myrCents = 200_000 } = {}) {
    assertIntegerCents(cnyCents, 'CNY balance');
    assertIntegerCents(myrCents, 'MYR balance');
    return this.store.mutate((state) => {
      const session = state.sessions[token];
      if (!session) throw new DomainError('UNAUTHORIZED', 'A valid sandbox session is required.', 401);
      const previous = state.users[session.userId];
      state.users[session.userId] = createUser(session.userId, previous?.label || 'Student sandbox', cnyCents, myrCents);
      return this.publicState(state.users[session.userId]);
    });
  }

  createQuote(token, input) {
    const user = this.requireUser(token);
    const tuitionMyrCents = input.tuitionMyrCents;
    const reserveMyrCents = input.reserveMyrCents;
    assertIntegerCents(tuitionMyrCents, 'Tuition');
    assertIntegerCents(reserveMyrCents, 'Reserve');
    if (tuitionMyrCents === 0) throw new DomainError('INVALID_AMOUNT', 'Tuition must be greater than zero.');

    const recipient = RECIPIENTS[input.recipientId];
    if (!recipient) throw new DomainError('RECIPIENT_NOT_FOUND', 'The selected sandbox recipient is not approved.');
    if (input.quoteMode === 'missing') {
      throw new DomainError('QUOTE_UNAVAILABLE', 'No sandbox FX quote is available. Payment remains blocked.', 503);
    }

    const deadline = new Date(input.deadline);
    if (Number.isNaN(deadline.getTime())) throw new DomainError('INVALID_DEADLINE', 'A valid payment deadline is required.');

    const now = this.now();
    const myrGapCents = Math.max(0, tuitionMyrCents + reserveMyrCents - user.balances.MYR);
    const cnyConversionCents = Math.ceil((myrGapCents * RATE.denominator) / RATE.numerator);
    const totalCnyDebitCents = cnyConversionCents + (myrGapCents > 0 ? FEE_CNY_CENTS : 0);
    const arrivalAt = new Date(now.getTime() + ARRIVAL_DELAY_MS);
    const fundingSufficient = totalCnyDebitCents <= user.balances.CNY;
    const arrivesBeforeDeadline = arrivalAt.getTime() <= deadline.getTime();
    const executable = fundingSufficient && arrivesBeforeDeadline;
    const reasons = [];
    if (!fundingSufficient) reasons.push('INSUFFICIENT_CNY');
    if (!arrivesBeforeDeadline) reasons.push('MISSES_DEADLINE');

    const quote = {
      id: `q_${this.idFactory()}`,
      userId: user.id,
      recipient: clone(recipient),
      tuitionMyrCents,
      reserveMyrCents,
      currentMyrCents: user.balances.MYR,
      myrGapCents,
      cnyConversionCents,
      feeCnyCents: myrGapCents > 0 ? FEE_CNY_CENTS : 0,
      totalCnyDebitCents,
      rate: { from: 'CNY', to: 'MYR', value: 0.5, formula: '1 CNY = 0.5 MYR' },
      rateSource: RATE_SOURCE,
      quotedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + QUOTE_TTL_MS).toISOString(),
      arrivalAt: arrivalAt.toISOString(),
      deadline: deadline.toISOString(),
      executable,
      reasons,
      simulateOutcome: input.simulateOutcome === 'timeout' ? 'timeout' : 'success',
    };

    this.store.mutate((state) => {
      state.users[user.id].quotes[quote.id] = quote;
    });
    return clone(quote);
  }

  confirm(token, quoteId) {
    const user = this.requireUser(token);
    const quote = user.quotes[quoteId];
    if (!quote) throw new DomainError('QUOTE_NOT_FOUND', 'Quote was not found for this session.', 404);
    if (this.now().getTime() > new Date(quote.expiresAt).getTime()) {
      throw new DomainError('QUOTE_EXPIRED', 'Quote expired. Request a new quote before confirming.', 409);
    }
    if (!quote.executable) {
      throw new DomainError('PLAN_NOT_EXECUTABLE', 'This plan cannot be confirmed because its funding or deadline checks failed.', 409, quote.reasons);
    }

    const existing = Object.values(user.confirmations).find((item) => item.quoteId === quoteId);
    if (existing) return clone(existing);

    const confirmation = {
      id: `cfm_${this.idFactory()}`,
      userId: user.id,
      quoteId,
      confirmedAt: this.now().toISOString(),
      boundIntent: {
        recipientId: quote.recipient.id,
        tuitionMyrCents: quote.tuitionMyrCents,
        reserveMyrCents: quote.reserveMyrCents,
        deadline: quote.deadline,
      },
      orderId: null,
    };
    this.store.mutate((state) => {
      state.users[user.id].confirmations[confirmation.id] = confirmation;
    });
    return clone(confirmation);
  }

  pay(token, confirmationId, suppliedIntent) {
    const user = this.requireUser(token);
    const confirmation = user.confirmations[confirmationId];
    if (!confirmation) throw new DomainError('CONFIRMATION_REQUIRED', 'Payment requires a valid confirmation from this session.', 403);
    const quote = user.quotes[confirmation.quoteId];
    if (!quote) throw new DomainError('QUOTE_NOT_FOUND', 'The confirmed quote no longer exists.', 404);

    let normalizedDeadline;
    try {
      normalizedDeadline = new Date(suppliedIntent.deadline).toISOString();
    } catch {
      throw new DomainError('CONFIRMATION_MISMATCH', 'Recipient, amount, reserve or deadline changed. Review and confirm a new quote.', 409);
    }
    const normalizedIntent = {
      recipientId: suppliedIntent.recipientId,
      tuitionMyrCents: suppliedIntent.tuitionMyrCents,
      reserveMyrCents: suppliedIntent.reserveMyrCents,
      deadline: normalizedDeadline,
    };
    if (JSON.stringify(normalizedIntent) !== JSON.stringify(confirmation.boundIntent)) {
      throw new DomainError('CONFIRMATION_MISMATCH', 'Recipient, amount, reserve or deadline changed. Review and confirm a new quote.', 409);
    }
    if (this.now().getTime() > new Date(quote.expiresAt).getTime()) {
      throw new DomainError('QUOTE_EXPIRED', 'The confirmed quote expired before payment. No funds were moved.', 409);
    }
    if (confirmation.orderId) return clone(user.orders[confirmation.orderId]);

    if (quote.totalCnyDebitCents > user.balances.CNY) {
      throw new DomainError('INSUFFICIENT_CNY', 'Balance changed and is no longer sufficient. No funds were moved.', 409);
    }

    const orderId = `ord_${this.idFactory()}`;
    const baseOrder = {
      id: orderId,
      userId: user.id,
      confirmationId,
      quoteId: quote.id,
      createdAt: this.now().toISOString(),
      recipient: clone(quote.recipient),
      tuitionMyrCents: quote.tuitionMyrCents,
      feeCnyCents: quote.feeCnyCents,
    };

    if (quote.simulateOutcome === 'timeout') {
      const order = {
        ...baseOrder,
        status: 'PENDING_RECONCILIATION',
        statusMessage: 'Processor timed out. No success is claimed; check this same order before retrying.',
        receiptId: null,
      };
      this.store.mutate((state) => {
        const liveUser = state.users[user.id];
        liveUser.orders[orderId] = order;
        liveUser.confirmations[confirmationId].orderId = orderId;
      });
      return clone(order);
    }

    const fxCreditMyrCents = quote.myrGapCents;
    const ledgerEntries = [
      { id: `led_${this.idFactory()}`, type: 'FX_DEBIT', currency: 'CNY', amountCents: -quote.cnyConversionCents, orderId },
      { id: `led_${this.idFactory()}`, type: 'FX_CREDIT', currency: 'MYR', amountCents: fxCreditMyrCents, orderId },
      { id: `led_${this.idFactory()}`, type: 'SERVICE_FEE', currency: 'CNY', amountCents: -quote.feeCnyCents, orderId },
      { id: `led_${this.idFactory()}`, type: 'TUITION_PAYMENT', currency: 'MYR', amountCents: -quote.tuitionMyrCents, orderId, recipientId: quote.recipient.id },
      { id: `led_${this.idFactory()}`, type: 'RECIPIENT_CREDIT', currency: 'MYR', amountCents: quote.tuitionMyrCents, orderId, recipientId: quote.recipient.id },
    ].map((entry) => ({ ...entry, postedAt: this.now().toISOString() }));

    const receiptId = `rcpt_${this.idFactory()}`;
    let completedOrder;
    this.store.mutate((state) => {
      const liveUser = state.users[user.id];
      liveUser.balances.CNY -= quote.totalCnyDebitCents;
      liveUser.balances.MYR += fxCreditMyrCents;
      liveUser.balances.MYR -= quote.tuitionMyrCents;
      liveUser.recipients[quote.recipient.id] += quote.tuitionMyrCents;
      liveUser.ledger.push(...ledgerEntries);

      completedOrder = {
        ...baseOrder,
        status: 'SUCCEEDED',
        statusMessage: 'Sandbox payment completed and reconciled.',
        completedAt: this.now().toISOString(),
        receiptId,
      };
      liveUser.orders[orderId] = completedOrder;
      liveUser.confirmations[confirmationId].orderId = orderId;
      liveUser.receipts[receiptId] = {
        id: receiptId,
        orderId,
        quoteId: quote.id,
        issuedAt: this.now().toISOString(),
        recipient: clone(quote.recipient),
        tuitionMyrCents: quote.tuitionMyrCents,
        convertedMyrCents: fxCreditMyrCents,
        cnyConversionCents: quote.cnyConversionCents,
        feeCnyCents: quote.feeCnyCents,
        finalBalances: clone(liveUser.balances),
        recipientBalanceMyrCents: liveUser.recipients[quote.recipient.id],
        ledgerEntryIds: ledgerEntries.map((entry) => entry.id),
      };
    });
    return clone(completedOrder);
  }

  getOrder(token, orderId) {
    const user = this.requireUser(token);
    const order = user.orders[orderId];
    if (!order) throw new DomainError('ORDER_NOT_FOUND', 'Order was not found for this session.', 404);
    return clone(order);
  }

  getAiStatus() {
    return {
      connected: false,
      provider: null,
      model: null,
      reason: 'No model provider, authorization or budget is configured for T001.',
      structuredFlowAvailable: true,
      toolInterface: {
        name: 'prepare_tuition_payment',
        required: ['recipientId', 'tuitionMyrCents', 'reserveMyrCents', 'deadline'],
        confirmationRequired: true,
      },
    };
  }
}

module.exports = {
  TuitionSandboxService,
  DomainError,
  FIXED_SANDBOX_TIME,
  RATE_SOURCE,
};
