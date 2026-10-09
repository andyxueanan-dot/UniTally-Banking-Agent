import { ArrowRight, ArrowUpRight, CreditCard, Grid2X2, ReceiptText, Sparkles } from 'lucide-react';
import type { BankState } from '@/lib/bankApi';

// V3 bank-flavour home: a statement-like page. Balance first, one sentence to the assistant,
// plain text shortcuts and a ledger with dotted leaders. No tinted panels, no nested cards.
const money = (cents: number) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(cents / 100);
const split = (cents: number) => {
  const [int, dec] = (Math.abs(cents) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split('.');
  return { sign: cents < 0 ? '−' : '', int, dec };
};
const incoming = (type: string) => ['investment_redeem', 'aa_receipt'].includes(type);

export default function MobileHomeV3({ state, pending, busy, onNavigate, onTransfer }: {
  state: BankState; pending: number; busy: boolean; onNavigate: (tab: string) => void; onTransfer: () => void;
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
  const shortcuts = [
    { title: '转账汇款', icon: ArrowUpRight, action: onTransfer },
    { title: '账单查询', icon: ReceiptText, action: () => onNavigate('bills') },
    { title: '卡片管理', icon: CreditCard, action: () => onNavigate('cards') },
    { title: '更多服务', icon: Grid2X2, action: () => onNavigate('services') },
  ];
  return (
    <section className="v2-home bm-welcome" aria-label="账户概览">
      <p className="v2-kicker">活期账户余额<span>人民币 · 模拟资金</span></p>
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
      <p className="v3-greeting">{greeting}。</p>
      <button className="v2-ask" onClick={() => onNavigate('assistant')}>
        <Sparkles size={18} />
        <span>想办什么业务？告诉智能助手</span>
        <ArrowRight size={18} />
      </button>
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
      <p className="v3-notice"><span>公告</span>{noticeDate} · 演示系统，不接入真实银行与资金</p>
      <p className="v2-footnote">Orbit 演示银行 · 不关联真实银行或资金<br />客服热线 400-000-0000（虚构）· 本行不会索要验证码或密码</p>
    </section>
  );
}
