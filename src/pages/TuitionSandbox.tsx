import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Clock3,
  FileCheck2,
  GraduationCap,
  Landmark,
  Languages,
  Loader2,
  LockKeyhole,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  WalletCards,
} from 'lucide-react';
import {
  getStoredSandboxToken,
  storeSandboxToken,
  tuitionApi,
  TuitionApiError,
  type TuitionConfirmation,
  type TuitionIntentInput,
  type TuitionOrder,
  type TuitionQuote,
  type TuitionState,
} from '@/lib/tuitionApi';

type Language = 'en' | 'zh';
type Scenario = 'standard' | 'insufficient' | 'timeout' | 'missing';

const copy = {
  en: {
    eyebrow: 'UNITALLY CROSS-BORDER STUDENT FINANCE',
    title: 'Pay tuition. Keep life funded.',
    subtitle: 'An auditable sandbox flow that turns balances and a deadline into a confirmed, reconciled tuition payment.',
    sandbox: 'SANDBOX · NO REAL MONEY',
    aiOff: 'AI not connected',
    aiOffDetail: 'The structured payment flow is live. No model response is being simulated.',
    session: 'Isolated demo session',
    newSession: 'New isolated session',
    balances: 'Your money, separated by currency',
    cnyAccount: 'CNY account',
    myrAccount: 'MYR account',
    schoolReceived: 'School received',
    reserve: 'Protected reserve',
    setup: '1 · Set the payment goal',
    setupHint: 'Load a preset or edit every value yourself.',
    standard: 'Standard success',
    insufficient: 'Insufficient funds',
    timeout: 'Processor timeout',
    missing: 'Missing quote',
    cnyBalance: 'Available CNY',
    myrBalance: 'Available MYR',
    tuition: 'Tuition due (MYR)',
    livingReserve: 'Keep for living (MYR)',
    recipient: 'Recipient',
    deadline: 'Must arrive by',
    load: 'Apply balances & clear this session',
    plan: '2 · Build a safe plan',
    planButton: 'Get auditable quote',
    noPlan: 'No quote yet. Your currencies will never be added together.',
    needed: 'Funding gap',
    convert: 'CNY to convert',
    fee: 'Service fee',
    debit: 'Total CNY debit',
    arrival: 'Estimated arrival',
    validUntil: 'Quote valid until',
    source: 'Quote source',
    ready: 'All checks passed',
    blocked: 'Plan blocked — no money can move',
    confirmTitle: '3 · Review and confirm',
    confirm: 'Confirm recipient, amount & quote',
    confirmed: 'Confirmation locked',
    changed: 'Details changed after confirmation. The backend will reject the old approval.',
    pay: '4 · Submit sandbox payment',
    payButton: 'Pay tuition in sandbox',
    retry: 'Submit same confirmation again',
    success: 'Payment reconciled',
    pending: 'Outcome unknown — do not retry as a new payment',
    receipt: 'Receipt & ledger proof',
    finalCny: 'Final CNY',
    finalMyr: 'Final MYR',
    recipientCredit: 'Recipient credit',
    ledger: 'Double-entry-style audit trail',
    assistant: 'Natural-language assistant entry',
    assistantHint: 'This surface is ready for an authorized model, but T001 has no provider or budget configured.',
    promptPlaceholder: 'e.g. Pay RM5,000 tuition and keep RM1,000 for living…',
    ask: 'Ask assistant',
    noAiResult: 'No answer generated. AI is not configured; the app did not fake one.',
    safety: 'Why this is safe',
    safetyItems: ['Explicit confirmation binding', 'Integer-cent accounting', 'Idempotent payment submission', 'Persistent local sandbox ledger'],
    fixedClock: 'Fixed demo clock',
  },
  zh: {
    eyebrow: 'UNITALLY 跨境留学生金融助手',
    title: '交完学费，也留够生活费。',
    subtitle: '把余额和截止时间变成可确认、可核账的学费沙箱支付，全程都有证据。',
    sandbox: '沙箱演示 · 不涉及真实资金',
    aiOff: 'AI 尚未接入',
    aiOffDetail: '结构化支付流程已可用；页面不会用规则回复冒充模型。',
    session: '隔离演示会话',
    newSession: '新建隔离会话',
    balances: '不同币种分开记账',
    cnyAccount: '人民币账户',
    myrAccount: '马币账户',
    schoolReceived: '学校已收',
    reserve: '受保护生活费',
    setup: '1 · 设置缴费目标',
    setupHint: '可载入固定案例，也可逐项修改。',
    standard: '标准成功',
    insufficient: '资金不足',
    timeout: '支付超时',
    missing: '报价缺失',
    cnyBalance: '可用人民币',
    myrBalance: '可用马币',
    tuition: '应付学费（MYR）',
    livingReserve: '保留生活费（MYR）',
    recipient: '收款方',
    deadline: '最晚到账时间',
    load: '应用余额并清空本会话',
    plan: '2 · 生成安全方案',
    planButton: '获取可审计报价',
    noPlan: '尚无报价。系统绝不会把人民币和马币直接相加。',
    needed: '资金缺口',
    convert: '需换人民币',
    fee: '服务费',
    debit: '人民币总扣款',
    arrival: '预计到账',
    validUntil: '报价有效期',
    source: '报价来源',
    ready: '检查全部通过',
    blocked: '方案被阻止——不会发生资金变动',
    confirmTitle: '3 · 复核并确认',
    confirm: '确认收款方、金额和报价',
    confirmed: '确认内容已锁定',
    changed: '确认后信息已改变，后端会拒绝复用旧授权。',
    pay: '4 · 提交沙箱付款',
    payButton: '在沙箱中支付学费',
    retry: '再次提交同一确认',
    success: '付款已完成并核账',
    pending: '结果未知——不要创建新付款重试',
    receipt: '回执与账本证据',
    finalCny: '最终人民币',
    finalMyr: '最终马币',
    recipientCredit: '收款方入账',
    ledger: '可审计资金流水',
    assistant: '自然语言助手入口',
    assistantHint: '接口已预留，但 T001 没有获准的模型服务或预算。',
    promptPlaceholder: '例如：帮我交 RM5,000 学费，并保留 RM1,000 生活费……',
    ask: '询问助手',
    noAiResult: '没有生成回答：AI 尚未配置，系统没有伪造模型结果。',
    safety: '为什么它更安全',
    safetyItems: ['确认内容与订单绑定', '金额使用整数分记账', '重复提交不会重复扣款', '本地沙箱账本可持久恢复'],
    fixedClock: '固定演示时钟',
  },
};

const money = (cents: number, currency: 'CNY' | 'MYR') =>
  new Intl.NumberFormat('en-MY', { style: 'currency', currency, minimumFractionDigits: 2 }).format(cents / 100);

const dateTime = (value: string) => new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kuala_Lumpur',
}).format(new Date(value));

const inputClass = 'mt-2 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100';

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[28px] border border-white/80 bg-white/80 p-5 shadow-[0_24px_80px_-34px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:p-7 ${className}`}>{children}</section>;
}

function Metric({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'indigo' | 'emerald' | 'amber' }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-900',
    indigo: 'bg-indigo-50 text-indigo-950',
    emerald: 'bg-emerald-50 text-emerald-950',
    amber: 'bg-amber-50 text-amber-950',
  };
  return (
    <div className={`rounded-2xl p-4 ${tones[tone]}`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-60">{label}</div>
      <div className="mt-2 text-xl font-black tracking-tight">{value}</div>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof TuitionApiError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return 'Unexpected sandbox error.';
}

export default function TuitionSandbox() {
  const [language, setLanguage] = useState<Language>('en');
  const t = copy[language];
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<TuitionState | null>(null);
  const [quote, setQuote] = useState<TuitionQuote | null>(null);
  const [confirmation, setConfirmation] = useState<TuitionConfirmation | null>(null);
  const [order, setOrder] = useState<TuitionOrder | null>(null);
  const [confirmedSignature, setConfirmedSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>('boot');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('Pay RM5,000 tuition and keep RM1,000 for living costs.');
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [scenario, setScenario] = useState<Scenario>('standard');
  const [form, setForm] = useState({
    cnyBalance: '10000',
    myrBalance: '2000',
    tuitionMyr: '5000',
    reserveMyr: '1000',
    recipientId: 'xmu-malaysia',
    deadline: '2026-10-10T17:00',
  });

  const refreshState = useCallback(async (activeToken: string) => {
    const next = await tuitionApi.getState(activeToken);
    setState(next);
    return next;
  }, []);

  const createFreshSession = useCallback(async () => {
    const session = await tuitionApi.createSession(`Competition demo ${new Date().toLocaleTimeString()}`);
    storeSandboxToken(session.token);
    setToken(session.token);
    const next = await refreshState(session.token);
    setQuote(null);
    setConfirmation(null);
    setOrder(null);
    setConfirmedSignature(null);
    return next;
  }, [refreshState]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const saved = getStoredSandboxToken();
        if (saved) {
          try {
            const next = await tuitionApi.getState(saved);
            if (!cancelled) {
              setToken(saved);
              setState(next);
              setOrder(next.orders.at(-1) || null);
            }
            return;
          } catch {
            // A stale browser token cannot authorize anything; create a new isolated backend session.
          }
        }
        if (!cancelled) await createFreshSession();
      } catch (bootError) {
        if (!cancelled) setError(getErrorMessage(bootError));
      } finally {
        if (!cancelled) setBusy(null);
      }
    }
    void boot();
    return () => { cancelled = true; };
  }, [createFreshSession]);

  const buildIntent = useCallback((): TuitionIntentInput => ({
    recipientId: form.recipientId,
    tuitionMyr: Number(form.tuitionMyr),
    reserveMyr: Number(form.reserveMyr),
    deadline: new Date(form.deadline).toISOString(),
    quoteMode: scenario === 'missing' ? 'missing' : 'normal',
    simulateOutcome: scenario === 'timeout' ? 'timeout' : 'success',
  }), [form, scenario]);

  const currentSignature = useMemo(() => {
    try {
      return JSON.stringify(buildIntent());
    } catch {
      return 'invalid';
    }
  }, [buildIntent]);
  const detailsChanged = Boolean(confirmation && confirmedSignature !== currentSignature);
  const receipt = state?.receipts.find((item) => item.id === order?.receiptId) || null;
  const recipient = state?.recipients.find((item) => item.id === form.recipientId);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    } finally {
      setBusy(null);
    }
  };

  const selectScenario = (next: Scenario) => {
    setScenario(next);
    setForm((previous) => ({
      ...previous,
      cnyBalance: next === 'insufficient' ? '1000' : '10000',
      myrBalance: '2000',
      tuitionMyr: '5000',
      reserveMyr: '1000',
      recipientId: 'xmu-malaysia',
      deadline: '2026-10-10T17:00',
    }));
    setQuote(null);
    setConfirmation(null);
    setOrder(null);
    setConfirmedSignature(null);
  };

  const applyBalances = () => token && run('reset', async () => {
    const next = await tuitionApi.reset(token, Number(form.cnyBalance), Number(form.myrBalance));
    setState(next);
    setQuote(null);
    setConfirmation(null);
    setOrder(null);
    setConfirmedSignature(null);
    setNotice(language === 'zh' ? '沙箱余额已应用，历史订单已清空。' : 'Sandbox balances applied and prior session orders cleared.');
  });

  const createQuote = () => token && run('quote', async () => {
    const nextQuote = await tuitionApi.quote(token, buildIntent());
    setQuote(nextQuote);
    setConfirmation(null);
    setOrder(null);
    setConfirmedSignature(null);
    await refreshState(token);
  });

  const confirmQuote = () => token && quote && run('confirm', async () => {
    const nextConfirmation = await tuitionApi.confirm(token, quote.id);
    setConfirmation(nextConfirmation);
    setConfirmedSignature(currentSignature);
  });

  const pay = () => token && confirmation && run('pay', async () => {
    const nextOrder = await tuitionApi.pay(token, confirmation.id, buildIntent());
    setOrder(nextOrder);
    const nextState = await refreshState(token);
    const suffix = nextState.orders.length === 1 ? '' : '';
    setNotice(nextOrder.status === 'SUCCEEDED'
      ? (language === 'zh' ? `支付已核账。${suffix}` : `Payment reconciled.${suffix}`)
      : (language === 'zh' ? '处理方超时：订单保持待核查，未宣称成功。' : 'Processor timeout: order remains pending; success is not claimed.'));
  });

  const askAi = () => run('ai', async () => {
    try {
      await tuitionApi.askAi(aiPrompt);
    } catch (aiError) {
      if (aiError instanceof TuitionApiError && aiError.code === 'AI_NOT_CONFIGURED') {
        setAiResult(t.noAiResult);
        return;
      }
      throw aiError;
    }
  });

  const steps = [
    { label: language === 'zh' ? '余额已加载' : 'Balances loaded', done: Boolean(state) },
    { label: language === 'zh' ? '方案已报价' : 'Quote prepared', done: Boolean(quote) },
    { label: language === 'zh' ? '用户已确认' : 'User confirmed', done: Boolean(confirmation) },
    { label: language === 'zh' ? '付款已核账' : 'Payment reconciled', done: order?.status === 'SUCCEEDED' },
  ];

  return (
    <div className="min-h-screen overflow-hidden bg-[#f4f6fb] text-slate-950">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-28 -top-28 h-96 w-96 rounded-full bg-indigo-300/30 blur-3xl" />
        <div className="absolute right-[-10rem] top-1/3 h-[30rem] w-[30rem] rounded-full bg-cyan-300/25 blur-3xl" />
        <div className="absolute bottom-[-16rem] left-1/3 h-[32rem] w-[32rem] rounded-full bg-emerald-200/30 blur-3xl" />
      </div>

      <header className="relative border-b border-white/80 bg-white/65 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg"><WalletCards className="h-5 w-5" /></div>
            <div><div className="text-lg font-black tracking-tight">UniTally</div><div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Borderless student finance</div></div>
          </div>
          <button onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold shadow-sm transition hover:-translate-y-0.5">
            <Languages className="h-4 w-4" /> {language === 'en' ? '中文' : 'English'}
          </button>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-8 grid items-end gap-8 lg:grid-cols-[1.25fr_0.75fr]">
          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-950 px-3 py-1.5 text-[10px] font-black tracking-[0.14em] text-white">{t.sandbox}</span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-black tracking-[0.14em] text-amber-800">{t.aiOff}</span>
            </div>
            <p className="text-xs font-black tracking-[0.2em] text-indigo-600">{t.eyebrow}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-black leading-[0.98] tracking-[-0.045em] sm:text-6xl">{t.title}</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">{t.subtitle}</p>
          </div>
          <div className="rounded-[28px] bg-slate-950 p-5 text-white shadow-2xl shadow-slate-300 sm:p-6">
            <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-400" /><div><div className="font-bold">{t.aiOff}</div><p className="mt-1 text-sm leading-6 text-slate-300">{t.aiOffDetail}</p></div></div>
            <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-400">
              <span>{t.session}</span>
              <button disabled={Boolean(busy)} onClick={() => void run('session', async () => { await createFreshSession(); })} className="font-bold text-white hover:text-cyan-300">{t.newSession}</button>
            </div>
            <div className="mt-1 truncate font-mono text-[10px] text-slate-500">{state?.user.id || 'creating…'}</div>
          </div>
        </div>

        {(error || notice) && (
          <div className={`mb-6 flex items-start gap-3 rounded-2xl border p-4 text-sm font-semibold ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
            {error ? <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />}
            <span>{error || notice}</span>
          </div>
        )}

        <Panel className="mb-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-xl font-black tracking-tight">{t.balances}</h2><p className="mt-1 text-xs text-slate-500">{t.fixedClock}: {state ? dateTime(state.sandboxClock) : '—'} (MYT)</p></div>
            {busy === 'boot' && <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label={t.cnyAccount} value={money(state?.balances.CNY || 0, 'CNY')} tone="indigo" />
            <Metric label={t.myrAccount} value={money(state?.balances.MYR || 0, 'MYR')} tone="emerald" />
            <Metric label={t.schoolReceived} value={money(recipient?.balanceMyrCents || 0, 'MYR')} tone="amber" />
            <Metric label={t.reserve} value={money(Number(form.reserveMyr || 0) * 100, 'MYR')} />
          </div>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="space-y-6">
            <Panel>
              <h2 className="text-xl font-black tracking-tight">{t.setup}</h2>
              <p className="mt-1 text-sm text-slate-500">{t.setupHint}</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                {([
                  ['standard', t.standard], ['insufficient', t.insufficient], ['timeout', t.timeout], ['missing', t.missing],
                ] as [Scenario, string][]).map(([key, label]) => (
                  <button key={key} onClick={() => selectScenario(key)} className={`rounded-2xl border px-3 py-2.5 text-xs font-black transition ${scenario === key ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`}>{label}</button>
                ))}
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-600">{t.cnyBalance}<input className={inputClass} type="number" min="0" step="0.01" value={form.cnyBalance} onChange={(event) => setForm({ ...form, cnyBalance: event.target.value })} /></label>
                <label className="text-xs font-bold text-slate-600">{t.myrBalance}<input className={inputClass} type="number" min="0" step="0.01" value={form.myrBalance} onChange={(event) => setForm({ ...form, myrBalance: event.target.value })} /></label>
                <label className="text-xs font-bold text-slate-600">{t.tuition}<input className={inputClass} type="number" min="0" step="0.01" value={form.tuitionMyr} onChange={(event) => setForm({ ...form, tuitionMyr: event.target.value })} /></label>
                <label className="text-xs font-bold text-slate-600">{t.livingReserve}<input className={inputClass} type="number" min="0" step="0.01" value={form.reserveMyr} onChange={(event) => setForm({ ...form, reserveMyr: event.target.value })} /></label>
                <label className="text-xs font-bold text-slate-600 sm:col-span-2">{t.recipient}<select className={inputClass} value={form.recipientId} onChange={(event) => setForm({ ...form, recipientId: event.target.value })}>{state?.recipients.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.accountMasked}</option>)}</select></label>
                <label className="text-xs font-bold text-slate-600 sm:col-span-2">{t.deadline}<input className={inputClass} type="datetime-local" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} /></label>
              </div>
              <button disabled={!token || Boolean(busy)} onClick={() => void applyBalances()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:border-slate-950 disabled:opacity-50">
                {busy === 'reset' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{t.load}
              </button>
            </Panel>

            <Panel>
              <div className="flex items-start gap-3"><Bot className="mt-1 h-5 w-5 text-indigo-600" /><div><h2 className="text-xl font-black tracking-tight">{t.assistant}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{t.assistantHint}</p></div></div>
              <textarea className={`${inputClass} min-h-24 resize-none`} value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder={t.promptPlaceholder} />
              <button disabled={Boolean(busy)} onClick={() => void askAi()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-100 px-4 py-3 text-sm font-black text-indigo-700 transition hover:bg-indigo-200 disabled:opacity-50"><Sparkles className="h-4 w-4" />{t.ask}</button>
              {aiResult && <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-800">{aiResult}</div>}
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel>
              <div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-black tracking-tight">{t.plan}</h2><p className="mt-1 text-sm text-slate-500">1 CNY and 1 MYR stay separate until the quoted conversion.</p></div><Landmark className="h-6 w-6 text-indigo-600" /></div>
              <button disabled={!token || Boolean(busy)} onClick={() => void createQuote()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-200 transition hover:-translate-y-0.5 hover:bg-indigo-700 disabled:opacity-50">
                {busy === 'quote' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{t.planButton}
              </button>
              {!quote ? <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">{t.noPlan}</div> : (
                <div className="mt-5 space-y-4">
                  <div className={`flex items-center gap-2 rounded-2xl p-4 text-sm font-black ${quote.executable ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{quote.executable ? <CheckCircle2 className="h-5 w-5" /> : <TriangleAlert className="h-5 w-5" />}{quote.executable ? t.ready : t.blocked}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <Metric label={t.needed} value={money(quote.myrGapCents, 'MYR')} tone="amber" />
                    <Metric label={t.convert} value={money(quote.cnyConversionCents, 'CNY')} tone="indigo" />
                    <Metric label={t.fee} value={money(quote.feeCnyCents, 'CNY')} />
                    <Metric label={t.debit} value={money(quote.totalCnyDebitCents, 'CNY')} tone="slate" />
                  </div>
                  <div className="space-y-2 rounded-2xl bg-slate-50 p-4 text-xs text-slate-600">
                    <div className="flex justify-between gap-4"><span>{t.arrival}</span><strong className="text-right text-slate-900">{dateTime(quote.arrivalAt)} MYT</strong></div>
                    <div className="flex justify-between gap-4"><span>{t.validUntil}</span><strong className="text-right text-slate-900">{dateTime(quote.expiresAt)} MYT</strong></div>
                    <div className="flex justify-between gap-4"><span>{t.source}</span><strong className="max-w-[65%] text-right text-slate-900">{quote.rateSource}</strong></div>
                    <div className="flex justify-between gap-4"><span>Rate</span><strong className="text-slate-900">{quote.rate.formula}</strong></div>
                  </div>
                  {!quote.executable && <div className="rounded-2xl bg-rose-50 p-4 text-xs font-bold text-rose-700">{quote.reasons.join(' · ')}</div>}
                </div>
              )}
            </Panel>

            <Panel>
              <h2 className="text-xl font-black tracking-tight">{t.confirmTitle}</h2>
              <div className="mt-5 flex items-start gap-3 rounded-2xl bg-slate-50 p-4"><LockKeyhole className="mt-0.5 h-5 w-5 text-slate-700" /><div className="text-sm leading-6 text-slate-600"><strong className="block text-slate-950">{recipient?.name || '—'} · {recipient?.accountMasked}</strong>{money(Number(form.tuitionMyr || 0) * 100, 'MYR')} · {form.deadline ? dateTime(new Date(form.deadline).toISOString()) : '—'} MYT</div></div>
              {detailsChanged && <div className="mt-3 flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-5 text-amber-800"><TriangleAlert className="h-4 w-4 shrink-0" />{t.changed}</div>}
              <button disabled={!quote?.executable || Boolean(busy)} onClick={() => void confirmQuote()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-black text-white transition hover:-translate-y-0.5 disabled:opacity-40">
                {busy === 'confirm' ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmation ? <Check className="h-4 w-4 text-emerald-400" /> : <FileCheck2 className="h-4 w-4" />}{confirmation ? t.confirmed : t.confirm}
              </button>
            </Panel>

            <Panel className={order?.status === 'SUCCEEDED' ? 'ring-2 ring-emerald-300' : ''}>
              <h2 className="text-xl font-black tracking-tight">{t.pay}</h2>
              <button disabled={!confirmation || detailsChanged || Boolean(busy)} onClick={() => void pay()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3.5 text-sm font-black text-emerald-950 shadow-lg shadow-emerald-100 transition hover:-translate-y-0.5 hover:bg-emerald-400 disabled:opacity-40">
                {busy === 'pay' ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-5 w-5" />}{order ? t.retry : t.payButton}
              </button>
              {order && <div className={`mt-4 rounded-2xl p-4 ${order.status === 'SUCCEEDED' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}><div className="flex items-center gap-2 font-black">{order.status === 'SUCCEEDED' ? <CheckCircle2 className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}{order.status === 'SUCCEEDED' ? t.success : t.pending}</div><div className="mt-2 break-all font-mono text-[10px] opacity-70">{order.id}</div><p className="mt-2 text-xs leading-5">{order.statusMessage}</p></div>}
            </Panel>

            {receipt && (
              <Panel className="border-emerald-200">
                <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><ReceiptText className="h-5 w-5" /></div><div><h2 className="text-xl font-black tracking-tight">{t.receipt}</h2><p className="font-mono text-[10px] text-slate-400">{receipt.id}</p></div></div>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  <Metric label={t.finalCny} value={money(receipt.finalBalances.CNY, 'CNY')} tone="indigo" />
                  <Metric label={t.finalMyr} value={money(receipt.finalBalances.MYR, 'MYR')} tone="emerald" />
                  <Metric label={t.recipientCredit} value={money(receipt.recipientBalanceMyrCents, 'MYR')} tone="amber" />
                </div>
                <div className="mt-5"><div className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-slate-400">{t.ledger}</div><div className="space-y-2">{state?.ledger.filter((entry) => entry.orderId === order?.id).map((entry) => <div key={entry.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs"><span className="font-bold text-slate-600">{entry.type.replaceAll('_', ' ')}</span><span className={`font-mono font-black ${entry.amountCents >= 0 ? 'text-emerald-600' : 'text-slate-900'}`}>{entry.amountCents >= 0 ? '+' : ''}{money(entry.amountCents, entry.currency)}</span></div>)}</div></div>
              </Panel>
            )}
          </div>
        </div>

        <Panel className="mt-6 bg-slate-950 text-white">
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr]">
            <div><div className="flex items-center gap-2 text-emerald-400"><ShieldCheck className="h-5 w-5" /><span className="text-xs font-black uppercase tracking-[0.16em]">{t.safety}</span></div><div className="mt-5 grid gap-2">{t.safetyItems.map((item) => <div key={item} className="flex items-center gap-2 text-sm text-slate-300"><Check className="h-4 w-4 text-emerald-400" />{item}</div>)}</div></div>
            <div className="grid grid-cols-4 gap-2">{steps.map((step, index) => <div key={step.label} className={`rounded-2xl border p-3 ${step.done ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-white/10 bg-white/5'}`}><div className={`grid h-7 w-7 place-items-center rounded-full text-xs font-black ${step.done ? 'bg-emerald-400 text-slate-950' : 'bg-white/10 text-slate-400'}`}>{step.done ? <Check className="h-4 w-4" /> : index + 1}</div><div className="mt-3 text-[11px] font-bold leading-4 text-slate-300">{step.label}</div></div>)}</div>
          </div>
        </Panel>
      </main>
    </div>
  );
}
