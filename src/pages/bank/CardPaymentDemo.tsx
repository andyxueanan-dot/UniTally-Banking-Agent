import { useState } from 'react';
import type { BankState } from '@/lib/bankApi';
import type { ManualAction } from './BankServices';
export default function CardPaymentDemo({ state, busy, onPrepare }: { state: BankState; busy: boolean; onPrepare: (a: ManualAction) => void }) {
  const [cardLast4, setCardLast4] = useState(state.cards[0]?.last4 || '');
  const [amount, setAmount] = useState('');
  const [channel, setChannel] = useState('domestic-online');
  return <details className="ba-card-payment-demo ba-settings-disclosure"><summary>验证卡片限制 · 模拟刷卡</summary><div className="ba-panel">
    <h3>设置限制后，试一笔模拟消费</h3><p className="ba-service-intro">被锁定、渠道受限或超过日限额时，后台拒绝扣款。允许的交易仍须核对并完成额外验证；仅使用模拟余额。</p>
    <form className="ba-service-form" onSubmit={e => { e.preventDefault(); onPrepare({ type: 'card_purchase', cardLast4, amount, online: channel.endsWith('online'), overseas: channel.startsWith('overseas') }); }}>
      <label>模拟付款卡<select aria-label="模拟付款卡" value={cardLast4} onChange={e => setCardLast4(e.target.value)}>{state.cards.map(c => <option key={c.id} value={c.last4}>{c.name} · {c.last4}</option>)}</select></label>
      <label>消费金额（元）<input aria-label="模拟刷卡金额" inputMode="decimal" required pattern="[0-9]+(\.[0-9]{1,2})?" value={amount} onChange={e => setAmount(e.target.value)} placeholder="例如 20.00"/></label>
      <label>交易场景<select aria-label="模拟刷卡场景" value={channel} onChange={e => setChannel(e.target.value)}><option value="domestic-online">境内线上</option><option value="domestic-offline">境内线下</option><option value="overseas-online">境外线上</option><option value="overseas-offline">境外线下</option></select></label>
      <button className="ba-primary" disabled={busy || !amount || !cardLast4}>准备模拟刷卡</button>
    </form></div></details>;
}
