export type BankRisk = "green" | "yellow" | "red";
export function passkeyLocalUrl(origin?: string) {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    return url.hostname === "localhost" &&
      url.protocol === "http:" &&
      url.origin === origin
      ? `${url.origin}/bank-agent`
      : null;
  } catch {
    return null;
  }
}
export interface BankTransaction {
  id: string;
  date: string;
  merchant: string;
  category: string;
  cents: number;
  type: string;
  source: string;
}
export interface BankCard {
  id: string;
  last4: string;
  name: string;
  status: string;
  limit: number;
  virtual?: boolean;
  demoNumber?: string;
}
export interface BankTask {
  id: string;
  title: string;
  action: {
    type: string;
    cents?: number;
    reserveCents?: number;
    recipientName?: string;
    recipientLast4?: string;
    cardLast4?: string;
    totalCents?: number;
    includeSelf?: boolean;
    shares?: {
      participantId: string;
      name: string;
      last4: string | null;
      cents: number;
      isSelf: boolean;
    }[];
  };
  status: string;
  risk: BankRisk;
  createdAt: number;
  expiresAt: number;
  fault?: string;
  steps: { label: string; state: string }[];
  receipt?: {
    id: string;
    at: number;
    summary: string;
    balanceAfter: number;
    sandbox: boolean;
  };
  result?: {
    type: string;
    text: string;
    position?: BankPosition;
    card?: BankCard;
    application?: BankCreditApplication;
  };
  workflowId?: string;
  nodeId?: string;
}
export interface BankPosition {
  id: string;
  productId: string;
  productName: string;
  principalCents: number;
  unlockAt: number;
  status: string;
  riskLevel: number;
}
export interface BankCreditApplication {
  id: string;
  cardLast4: string;
  requestedLimitCents: number;
  status: string;
  createdAt: number;
}
export interface BankBusiness {
  disclaimer: string;
  subscriptionsAuthorized: boolean;
  subscriptionNotice: string;
  subscriptions: {
    id: string;
    merchant: string;
    expectedCents: number;
    bankMandateStatus: string;
    merchantMembershipStatus: string;
    managed: boolean;
    expectedRenewalDate: string | null;
    warning: string;
    note: string;
    sourceRowIds: string[];
    sampleCount: number;
    possiblePriceChange: boolean | null;
  }[];
  products: {
    id: string;
    name: string;
    riskLevel: number;
    minCents: number;
    lockDays: number;
    description: string;
  }[];
  questionnaire: string[];
  riskProfile: {
    answers: number[];
    riskLevel: number;
    acceptsLoss: boolean;
    horizonDays: number;
    disclaimer: string;
  } | null;
  positions: BankPosition[];
  principalTotal: number;
  returnsNote: string;
  cardControls: Record<
    string,
    { online: boolean; overseas: boolean; revision: number }
  >;
  creditApplications: BankCreditApplication[];
}
export interface BankWorkflow {
  id: string;
  goal: string;
  status: string;
  nodes: {
    id: string;
    action: { type: string };
    dependsOn: string[];
    status: string;
    taskId?: string;
    receiptId?: string;
    error?: string;
    result?: { text?: string };
  }[];
  handoff?: { note: string; status: string };
}
export interface BankResult {
  type: string;
  text: string;
  taskId?: string;
  period?: string;
  total?: number;
  previous?: number;
  categories?: { name: string; cents: number }[];
  anomalyIds?: string[];
  rows?: BankTransaction[];
  anomalies?: {
    id: string;
    kind: string;
    merchant: string;
    date: string;
    cents: number;
    rowIds: string[];
    rows: BankTransaction[];
    assessment: string;
  }[];
  drivers?: {
    name: string;
    currentCents: number;
    previousCents: number;
    deltaCents: number;
    rowIds: string[];
    previousRowIds: string[];
  }[];
  sourceRowIds?: string[];
  expenseTotal?: number;
  transferTotal?: number;
}
export interface BankMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: number;
  results?: BankResult[];
  meta?: {
    mode: string;
    provider: string;
    model?: string;
    latencyMs: number;
    totalTokens: number;
  };
}
export interface BankState {
  advanced?: BankAdvanced;
  auth?: { mode: "demo_otp" | "passkey"; canRegister: boolean; origin: string };
  referenceMonth: string;
  balance: number;
  available: number;
  dailyTransferred: number;
  contacts: { id: string; name: string; last4: string }[];
  cards: BankCard[];
  transactions: BankTransaction[];
  tasks: BankTask[];
  history: BankMessage[];
  audit: {
    id: string;
    at: number;
    event: string;
    detail: string;
    taskId?: string;
  }[];
  lockedUntil: number;
  serverNow?: number;
  ledger: { id: string; taskId: string; cents: number }[];
  business?: BankBusiness;
  workflows?: BankWorkflow[];
}
export interface BankAdvanced {
  requests: {
    id: string;
    totalCents: number;
    includeSelf: boolean;
    receivableCents: number;
    collectedCents: number;
    status: string;
    shares: {
      participantId: string;
      name: string;
      last4: string | null;
      cents: number;
      isSelf: boolean;
      status: string;
    }[];
  }[];
  schedules: {
    id: string;
    recipientName: string;
    recipientLast4: string;
    cents: number;
    executeAt: number;
    executeAtIso: string;
    status: string;
    effectiveStatus: string;
    note: string;
  }[];
  budgets: {
    id: string;
    label: string;
    amountCents: number;
    remainingCents: number;
    spentCents: number;
    releasedCents: number;
    eventAt: number;
    status: string;
  }[];
  heldCents: number;
  orders: {
    id: string;
    budgetId: string;
    productName: string;
    merchantName: string;
    cents: number;
    deliveryAt: number;
    status: string;
    effectiveStatus: string;
  }[];
  merchantProducts: {
    id: string;
    name: string;
    merchantName: string;
    cents: number;
  }[];
  simulationPoolNote: string;
  warning: string;
}
export interface BankHealth {
  aiConfigured: boolean;
  provider: string;
  model: string;
  aiCallsToday: number;
  maxDailyCalls: number;
}
export interface BankResponse {
  state: BankState;
  message?: BankMessage;
  task?: BankTask;
  idempotent?: boolean;
}
export interface BankSandboxStatus {
  installed: boolean;
  runtime: string;
  version: string;
  trustedForLedger: false;
  statusNote?: string;
  installCommands?: string[];
  limits: {
    fuel: number;
    memoryBytes: number;
    deadlineMs: number;
    concurrent: number;
    watBytes: number;
  };
}
export interface BankCalculation {
  ok: boolean;
  result: string | null;
  error?: { code: string; message: string };
  metrics: {
    elapsedMs?: number;
    fuelConsumed?: number | null;
    fuelLimit?: number;
    memoryLimitBytes?: number;
    importsAllowed?: string[] | number;
    codeHash?: string;
    trustedForLedger: false;
  };
}
export interface BankSandboxResponse {
  calculation: BankCalculation;
  state: BankState;
}
const TOKEN_KEY = "unitally.bank.demo.session.v1";
export const storedBankToken = () => localStorage.getItem(TOKEN_KEY);
export const saveBankToken = (token: string) =>
  localStorage.setItem(TOKEN_KEY, token);
export class BankApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public state?: BankState,
  ) {
    super(message);
  }
}
export async function bankRequest<T>(
  route: string,
  token?: string | null,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/bank${route}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(65000),
    });
  } catch {
    throw new BankApiError(
      "NETWORK_ERROR",
      "未能连接本机后台。若刚才在确认操作，请先刷新核对任务状态，不要重复新建转账。",
    );
  }
  const result = await response.json();
  if (!response.ok)
    throw new BankApiError(result.code, result.message, result.state);
  return result;
}
