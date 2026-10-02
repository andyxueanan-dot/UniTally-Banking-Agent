import { ArrowRight, ArrowUpRight, CreditCard, Grid2X2, ReceiptText, ShieldCheck, Sparkles } from 'lucide-react';
import type { BankState } from '@/lib/bankApi';
const money = (cents: number) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(cents / 100);
export default function MobileHome({ state, pending, busy, onNavigate, onTransfer }: {
  state: BankState; pending: number; busy: boolean; onNavigate: (tab: string) => void; onTransfer: () => void;
}) {
  const recent = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  return <section className="bm-home bm-welcome" aria-label="账户概览">
    <div className="bm-home-title"><h1>你好，今天想办什么？</h1><p>查询随时办，支出先确认。</p></div>
    <section className="bm-account" aria-label="模拟账户余额">
      <span>账户余额 <small>人民币 · 模拟</small></span><strong data-testid="balance">{money(state.balance)}</strong>
      <p>可用 {money(state.available)}{state.balance !== state.available && <span> · 已预留 {money(state.balance - state.available)}</span>}</p>
    </section>
    <button className="bm-ask" onClick={() => onNavigate('assistant')}><Sparkles size={20}/><span>告诉助手，你想办什么</span><ArrowRight size={18}/></button>
    <div className="bm-shortcuts">{[
      { title: '转一笔钱', icon: ArrowUpRight, action: onTransfer },
      { title: '查账单', icon: ReceiptText, action: () => onNavigate('bills') },
      { title: '管卡片', icon: CreditCard, action: () => onNavigate('cards') },
      { title: '更多服务', icon: Grid2X2, action: () => onNavigate('services') },
    ].map(item => <button key={item.title} onClick={item.action} disabled={busy}><span><item.icon size={21}/></span>{item.title}</button>)}</div>
    {pending > 0 && <button className="bm-pending-inline" onClick={() => onNavigate('audit')}><ShieldCheck size={18}/><span>{pending} 项操作等待你确认</span><ArrowRight size={16}/></button>}
    <section className="bm-recent" aria-label="最近账单"><header><h2>最近记录</h2><button onClick={() => onNavigate('bills')}>全部账单 <ArrowRight size={14}/></button></header>
      {recent.map(row => <div key={row.id}><span className="bm-recent-icon"><ReceiptText size={17}/></span><span><strong>{row.merchant}</strong><small>{row.date} · {row.category}</small></span><b>{['investment_redeem','aa_receipt'].includes(row.type) ? '+' : '−'}{money(row.cents)}</b></div>)}
      {!recent.length && <p>暂无模拟交易记录。</p>}
    </section>
    <p className="bm-home-note">演示账户，不关联真实银行或资金。</p>
  </section>;
}
