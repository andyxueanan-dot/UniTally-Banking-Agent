export interface Recipient {
  id: string;
  name: string;
  accountMasked: string;
  balanceMyrCents: number;
}

export interface TuitionQuote {
  id: string;
  recipient: Recipient;
  tuitionMyrCents: number;
  reserveMyrCents: number;
  currentMyrCents: number;
  myrGapCents: number;
  cnyConversionCents: number;
  feeCnyCents: number;
  totalCnyDebitCents: number;
  rate: { from: string; to: string; value: number; formula: string };
  rateSource: string;
  quotedAt: string;
  expiresAt: string;
  arrivalAt: string;
  deadline: string;
  executable: boolean;
  reasons: string[];
  simulateOutcome: 'success' | 'timeout';
}

export interface TuitionConfirmation {
  id: string;
  quoteId: string;
  confirmedAt: string;
  boundIntent: {
    recipientId: string;
    tuitionMyrCents: number;
    reserveMyrCents: number;
    deadline: string;
  };
  orderId: string | null;
}

export interface TuitionOrder {
  id: string;
  confirmationId: string;
  quoteId: string;
  status: 'SUCCEEDED' | 'PENDING_RECONCILIATION';
  statusMessage: string;
  createdAt: string;
  completedAt?: string;
  receiptId: string | null;
  recipient: Recipient;
  tuitionMyrCents: number;
  feeCnyCents: number;
}

export interface TuitionReceipt {
  id: string;
  orderId: string;
  quoteId: string;
  issuedAt: string;
  recipient: Recipient;
  tuitionMyrCents: number;
  convertedMyrCents: number;
  cnyConversionCents: number;
  feeCnyCents: number;
  finalBalances: { CNY: number; MYR: number };
  recipientBalanceMyrCents: number;
  ledgerEntryIds: string[];
}

export interface LedgerEntry {
  id: string;
  type: 'FX_DEBIT' | 'FX_CREDIT' | 'SERVICE_FEE' | 'TUITION_PAYMENT' | 'RECIPIENT_CREDIT';
  currency: 'CNY' | 'MYR';
  amountCents: number;
  orderId: string;
  recipientId?: string;
  postedAt: string;
}

export interface TuitionState {
  user: { id: string; label: string };
  balances: { CNY: number; MYR: number };
  recipients: Recipient[];
  quotes: TuitionQuote[];
  confirmations: TuitionConfirmation[];
  orders: TuitionOrder[];
  receipts: TuitionReceipt[];
  ledger: LedgerEntry[];
  sandboxClock: string;
  disclaimer: string;
}

export interface TuitionIntentInput {
  recipientId: string;
  tuitionMyr: number;
  reserveMyr: number;
  deadline: string;
  quoteMode?: 'normal' | 'missing';
  simulateOutcome?: 'success' | 'timeout';
}

export class TuitionApiError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const TOKEN_KEY = 'unitally_tuition_sandbox_token';

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`/api/tuition${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new TuitionApiError(body.error || 'REQUEST_FAILED', body.message || `Request failed (${response.status})`, body.details);
  }
  return body as T;
}

export function getStoredSandboxToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function storeSandboxToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export const tuitionApi = {
  createSession: (label: string) => request<{ token: string; userId: string; label: string }>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ label }),
  }),
  getState: (token: string) => request<TuitionState>('/state', {}, token),
  reset: (token: string, cnyBalance: number, myrBalance: number) => request<TuitionState>('/reset', {
    method: 'POST',
    body: JSON.stringify({ cnyBalance, myrBalance }),
  }, token),
  quote: (token: string, intent: TuitionIntentInput) => request<TuitionQuote>('/quotes', {
    method: 'POST',
    body: JSON.stringify(intent),
  }, token),
  confirm: (token: string, quoteId: string) => request<TuitionConfirmation>('/confirmations', {
    method: 'POST',
    body: JSON.stringify({ quoteId }),
  }, token),
  pay: (token: string, confirmationId: string, intent: TuitionIntentInput) => request<TuitionOrder>('/payments', {
    method: 'POST',
    body: JSON.stringify({ confirmationId, intent }),
  }, token),
  aiStatus: () => request<{ connected: boolean; reason: string; structuredFlowAvailable: boolean }>('/ai/status'),
  askAi: (prompt: string) => request<never>('/ai/plan', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  }),
};
