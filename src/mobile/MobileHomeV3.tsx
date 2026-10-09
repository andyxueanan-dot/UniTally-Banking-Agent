import { ArrowRight, ArrowUpRight, CreditCard, Grid2X2, ReceiptText, Sparkles } from 'lucide-react';
import type { BankState } from '@/lib/bankApi';

// V3 bank-flavour home: a statement-like page. Balance first, one sentence to the assistant,
// plain text shortcuts and a ledger with dotted leaders. No tinted panels, no nested cards.
const money = (cents: number) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(cents / 100);
const split = (cents: number) => {
  const [int, dec] = (Math.abs(cents) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split('.');
  return { sign: cents < 0 ? '−' : '', int, dec };
};
const incoming = (type: string) => ['investment_redeem', 'aa_receipt', 'refund'].includes(type);

const EXAMPLES = ['给小王转 200 元', '这个月钱都花在哪了', '下个月15号是我爱人生日'];

export default function MobileHomeV3({ state, pending, busy, onNavigate, onTransfer, onAsk, onPlanEvent }: {
  state: BankState; pending: number; busy: boolean; onNavigate: (tab: string) => void; onTransfer: () => void;
  onAsk: (text: string) => void; onPlanEvent: (label: string) => void;
}) {
  // The demo ledger is seeded with dates across the whole month, so some seeded rows carry a
  // day later than today. Clamp those to today and break ties by creation order (backend
  // appends new transactions), so a transfer made just now is the first row.
  const todayKey = new Date((state.serverNow || Date.now()) + 8 * 3600_000).toISOString().slice(0, 10);
  const recent = state.transactions
    .map((t, i) => ({ t, i, key: t.date > todayKey ? todayKey : t.date }))
    .sort((a, b) => b.key.localeCompare(a.key) || b.i - a.i)
    .slice(0, 5)
    .map(x => x.t);
  const balance = split(state.balance);
  // Bank-style greeting and dated notice (Beijing time), both plain text.
  const beijing = new Date((state.serverNow || Date.now()) + 8 * 3600_000);
  const hour = beijing.getUTCHours();
  const greeting = hour < 6 ? '夜深了' : hour < 11 ? '早上好' : hour < 13 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
  const noticeDate = todayKey.replace(/-/g, '.');
  const reserved = state.balance - state.available;
  // 跨场景"检测": an important date coming up, with a one-tap plan (each step still confirmed).
  const nextEvent = (state.upcomingEvents || [])[0];
  const planned = nextEvent && (state.workflows || []).some(f => f.kind === 'life_event' && f.event?.date === nextEvent.date && f.status !== 'CANCELLED');
  const shortcuts = [
    { title: '转账汇款', icon: ArrowUpRight, action: onTransfer },
    { title: '账单查询', icon: ReceiptText, action: () => onNavigate('bills') },
    { title: '卡片管理', icon: CreditCard, action: () => onNavigate('cards') },
    { title: '更多服务', icon: Grid2X2, action: () => onNavigate('services') },
  ];
  return (
    <section className="v2-home bm-welcome" aria-label="账户概览">
      {/* Conversation first: the assistant is the front door, the statement follows. */}
      <p className="v3-greeting">{greeting}，想办什么业务？</p>
      <button className="v2-ask" onClick={() => onNavigate('assistant')}>
        <Sparkles size={18} />
        <span>直接说，比如"给小王转 200"</span>
        <ArrowRight size={18} />
      </button>
      <ul className="v3-examples" aria-label="可以这样说">
        {EXAMPLES.map(text => <li key={text}><button onClick={() => onAsk(text)}>{text}</button></li>)}
      </ul>
      {nextEvent && (
        <div className="v3-upcoming">
          <span>即将到来</span>
          <p><strong>{nextEvent.label}</strong> {nextEvent.date.slice(5).replace('-', '月')}日 · 还有 {nextEvent.daysLeft} 天</p>
          {planned ? <button onClick={() => onNavigate('audit')}>已安排，查看进度<ArrowRight size={14} /></button>
            : <button disabled={busy} onClick={() => onPlanEvent(nextEvent.label)}>锁定 ¥1,000 并安排鲜花蛋糕<ArrowRight size={14} /></button>}
        </div>
      )}
      <p className="v2-kicker">活期账户余额<span>人民币</span></p>
      <h1 className="v2-balance" data-testid="balance" aria-label={`活期账户余额 ${money(state.balance)}`}>
        <small>¥</small>{balance.sign}{balance.int}<small>.{balance.dec}</small>
      </h1>
      <p className="v2-balance-meta">
        可用 {money(state.available)}
        {reserved > 0 && <span> · 已预留 {money(reserved)}</span>}
      </p>
      <svg className="v2-rule" viewBox="0 0 320 8" preserveAspectRatio="none" aria-hidden="true">
        <path d="M1 4.5 C 40 2.5, 80 6, 120 4 S 200 2.5, 240 4.5 S 300 6, 319 3.5" />
      </svg>
      <nav className="v2-shortcuts" aria-label="常用入口">
        {shortcuts.map(item => (
          <button key={item.title} onClick={item.action} disabled={busy}>
            <item.icon size={20} />
            <span>{item.title}</span>
          </button>
        ))}
      </nav>
      {pending > 0 && (
        <button className="v2-pending" onClick={() => onNavigate('audit')}>
          <span>{pending} 项操作等待你核对确认</span>
          <ArrowRight size={16} />
        </button>
      )}
      <section className="v2-ledger" aria-label="最近账单">
        <header>
          <h2>交易明细</h2>
          <button onClick={() => onNavigate('bills')}>全部明细<ArrowRight size={14} /></button>
        </header>
        <ol>
          {recent.map(row => (
            <li key={row.id}>
              <span className="v2-ledger-main">
                <strong>{row.merchant}</strong>
                <small>{row.date} · {row.category}</small>
              </span>
              <i className="v2-leader" aria-hidden="true" />
              <b className={incoming(row.type) ? 'in' : ''}>{incoming(row.type) ? '+' : '−'}{money(row.cents)}</b>
            </li>
          ))}
        </ol>
        {!recent.length && <p className="v2-empty">暂无模拟交易记录。</p>}
      </section>
      <p className="v3-notice"><span>公告</span>{noticeDate} · 本行不会以任何理由索要验证码或交易密码</p>
      <p className="v2-footnote">Orbit 演示银行 · 虚构账户与资金，不接入真实银行<br />客服热线 400-000-0000（虚构）</p>
    </section>
  );
}
