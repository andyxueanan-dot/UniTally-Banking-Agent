// 主动洞察 (learned from Erica / Capital One Eno / Cleo): the assistant speaks first when something in the
// ledger deserves attention. Rules only, every card names its evidence, and its button leads to an
// ordinary page or a draft that still needs confirmation. Nothing here moves money.
const { duplicates, alerts } = require('./analytics');
const DAY = 86400000;
const localDay = now => new Date(now + 8 * 3600000).toISOString().slice(0, 10);
const money = cents => `¥${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function buildInsights(s, now, { subscriptions = [], available = s.balance } = {}) {
  const out = []; const today = localDay(now); const soon = localDay(now + 3 * DAY); const week = localDay(now + 7 * DAY);
  // Only what has already happened: the last 30 days up to today (the demo ledger also holds later-dated rows).
  const from = localDay(now - 30 * DAY);
  const rows = s.transactions.filter(t => t.date > from && t.date <= today);
  for (const g of duplicates(rows).slice(0, 2))
    out.push({ id: `dup-${g.id}`, kind: 'duplicate_charge', priority: 1, title: `${g.merchant}同一天扣了 ${g.rows.length} 次 ${money(g.cents)}`,
      detail: `${g.date} 有 ${g.rows.length} 笔同商户同金额的消费，可能是重复扣款。`, action: { label: '看看明细', nav: 'bills' } });
  for (const sub of subscriptions) {
    if (sub.possiblePriceChange) out.push({ id: `price-${sub.id}`, kind: 'price_change', priority: 2, title: `${sub.merchant}扣费金额变了`,
      detail: `最近一次扣 ${money(sub.lastChargeCents || sub.expectedCents)}，和之前不一样。`, action: { label: '管理订阅', nav: 'services' } });
    if (sub.expectedRenewalDate && sub.expectedRenewalDate >= today && sub.expectedRenewalDate <= soon)
      out.push({ id: `renew-${sub.id}`, kind: 'renewal', priority: 3, title: `${sub.merchant} ${sub.expectedRenewalDate.slice(5)} 续费 ${money(sub.expectedCents)}`,
        detail: sub.managed ? '还在用吗？不用的话可以撤销代扣或取消会员。' : '这是从流水推测的订阅，未确认授权。', action: { label: '管理订阅', nav: 'services' } });
  }
  const upcoming = subscriptions.filter(x => x.expectedRenewalDate && x.expectedRenewalDate >= today && x.expectedRenewalDate <= week).reduce((n, x) => n + x.expectedCents, 0)
    + (s.advanced?.schedules || []).filter(x => x.status === 'SCHEDULED' && x.executeAt <= now + 7 * DAY).reduce((n, x) => n + x.cents, 0);
  if (upcoming && available < upcoming)
    out.push({ id: 'low-balance', kind: 'low_balance', priority: 0, title: '未来 7 天的扣款可能不够付', detail: `预计扣款 ${money(upcoming)}，可用余额 ${money(available)}。`, action: { label: '查看账户', nav: 'overview' } });
  for (const a of alerts(rows, s.transactions).filter(x => x.kind === 'large_new_merchant').slice(0, 1))
    out.push({ id: `new-${a.id}`, kind: 'large_new_merchant', priority: 4, title: `首次出现的商户：${a.merchant} ${money(a.cents)}`,
      detail: '如果不是你本人消费，可以挂失卡片或找人工。', action: { label: '看看明细', nav: 'bills' } });
  for (const r of (s.reversals || []).filter(x => x.status === 'APPROVED' && x.resolvedAt > now - 7 * DAY).slice(0, 1))
    out.push({ id: `refund-${r.id}`, kind: 'refund', priority: 5, title: `${r.counterpartyName}退回的 ${money(r.cents)} 已到账`, detail: `撤回申请 ${r.id} 已通过。`, action: { label: '看看明细', nav: 'bills' } });
  return out.sort((a, b) => a.priority - b.priority).slice(0, 3);
}
module.exports = { buildInsights };
