// 回退 for operations that already happened. A bank cannot silently undo a completed transfer or
// payment: it files a recall / refund request that the counterparty or bank staff must accept.
// Requesting is a yellow task the user confirms; deciding happens in the human-takeover desk.
const { ensureAdvancedState } = require('./advanced-payments');
const DAY = 86400000;
const WINDOW_DAYS = 7;
const dayKey = now => new Date(now + 8 * 3600000).toISOString().slice(0, 10);

function ensureReversals(s) { if (!Array.isArray(s.reversals)) s.reversals = []; return s.reversals; }
function findOriginal(s, input) {
  const ref = typeof input.receiptId === 'string' ? input.receiptId : typeof input.taskId === 'string' ? input.taskId : '';
  if (!ref) return null;
  return s.tasks.find(t => t.receipt?.id === ref || t.id === ref) || null;
}
function prepareReversal(s, input, now, tools) {
  const original = findOriginal(s, input || {});
  if (!original) return { clarify: '请说明要撤回哪一笔：在待办事项里打开那条已完成的回执，点"申请撤回"，或告诉我回执编号。' };
  if (original.status !== 'SUCCEEDED') tools.fail('REVERSAL_NOT_APPLICABLE', '只有已完成的转账或订单付款才需要申请撤回；未执行的草案直接取消即可。', 409);
  if (!['transfer', 'pay_merchant_order'].includes(original.action.type))
    tools.fail('REVERSAL_NOT_APPLICABLE', '这类操作没有资金需要追回；卡片、订阅等请直接发起相反操作（例如解挂、重新开通）。', 409);
  if (now - (original.completedAt || 0) > WINDOW_DAYS * DAY) tools.fail('REVERSAL_WINDOW_PASSED', `超过 ${WINDOW_DAYS} 天的交易不能在线申请撤回，请联系人工客服。`, 409);
  if (ensureReversals(s).some(r => r.originalTaskId === original.id && ['REQUESTED', 'APPROVED'].includes(r.status)))
    tools.fail('REVERSAL_EXISTS', '这笔交易已经有撤回申请或已退回，不能重复申请。', 409);
  let action;
  if (original.action.type === 'transfer') {
    action = { type: 'request_reversal', originalTaskId: original.id, receiptId: original.receipt?.id || null, kind: 'transfer_recall',
      cents: original.action.cents, counterpartyId: original.action.recipientId, counterpartyName: original.action.recipientName };
  } else {
    const order = ensureAdvancedState(s, now).orders.find(o => o.id === original.action.orderId);
    if (!order || order.status !== 'PAID') tools.fail('REVERSAL_NOT_APPLICABLE', '订单状态已变化，不能申请退款。', 409);
    action = { type: 'request_reversal', originalTaskId: original.id, receiptId: original.receipt?.id || null, kind: 'merchant_refund',
      cents: order.cents, counterpartyId: order.merchantId, counterpartyName: order.merchantName, orderId: order.id };
  }
  const title = `申请撤回：${action.kind === 'transfer_recall' ? `向${action.counterpartyName}的转账` : `${action.counterpartyName}订单`} ${tools.money(action.cents)}（需对方或银行人工同意，不保证成功；提交前不会有资金变动）`;
  return { action, title };
}
function executeReversal(s, task, now, tools) {
  const a = task.action; const list = ensureReversals(s);
  if (list.some(r => r.originalTaskId === a.originalTaskId && ['REQUESTED', 'APPROVED'].includes(r.status)))
    tools.fail('REVERSAL_EXISTS', '这笔交易已经有撤回申请，未重复提交。', 409);
  const record = { id: `REV-${tools.id().slice(0, 10).toUpperCase()}`, originalTaskId: a.originalTaskId, receiptId: a.receiptId, kind: a.kind,
    cents: a.cents, counterpartyId: a.counterpartyId, counterpartyName: a.counterpartyName, orderId: a.orderId || null,
    status: 'REQUESTED', requestedAt: now, requestTaskId: task.id };
  list.push(record);
  return { type: 'request_reversal', reversal: structuredClone(record),
    text: `已提交撤回申请 ${record.id}（${tools.money(a.cents)}）。资金尚未退回；需要${a.kind === 'transfer_recall' ? '收款人' : '商户'}或银行人工受理，结果会出现在待办事项里。` };
}
/** Bank staff decision. Works on a draft and only commits when every balance check passes. */
function resolveReversal(s, reversalId, approve, now, tools, { by = '客服', reason = '' } = {}) {
  const record = ensureReversals(s).find(r => r.id === reversalId);
  if (!record) tools.fail('REVERSAL_NOT_FOUND', '找不到这项撤回申请。', 404);
  if (record.status !== 'REQUESTED') tools.fail('REVERSAL_NOT_PENDING', '这项撤回申请已经处理过。', 409);
  if (!approve) {
    record.status = 'REJECTED'; record.resolvedAt = now; record.resolvedBy = by; record.reason = String(reason || '对方或银行未同意撤回').slice(0, 200);
    return { reversal: structuredClone(record), text: `撤回申请 ${record.id} 未通过：${record.reason}。没有资金变动。` };
  }
  const draft = structuredClone(s); const r = draft.reversals.find(x => x.id === reversalId);
  if (r.kind === 'transfer_recall') {
    const contact = draft.contacts.find(c => c.id === r.counterpartyId);
    if (!contact || contact.balance < r.cents) tools.fail('COUNTERPARTY_FUNDS', '收款方模拟账户余额不足，无法退回，请改为人工协商。', 409);
    contact.balance -= r.cents;
    draft.ledger.push({ id: tools.id(), taskId: r.requestTaskId, at: now, debitAccount: contact.id, creditAccount: 'demo-owner', cents: r.cents, reversalId: r.id });
  } else {
    const a = ensureAdvancedState(draft, now); const order = a.orders.find(o => o.id === r.orderId);
    const budget = order && a.budgets.find(b => b.id === order.budgetId);
    if (!order || order.status !== 'PAID' || !budget || a.merchantBalances[order.merchantId] < r.cents) tools.fail('REVERSAL_STATE_CHANGED', '订单或预算状态已变化，无法退款。', 409);
    order.status = 'REFUNDED'; order.refundedAt = now; order.revision += 1;
    a.merchantBalances[order.merchantId] -= r.cents;
    budget.spentCents -= r.cents; budget.releasedCents += r.cents; budget.revision += 1;
    draft.ledger.push({ id: tools.id(), taskId: r.requestTaskId, at: now, debitAccount: order.merchantId, creditAccount: 'demo-owner', cents: r.cents, reversalId: r.id });
    ensureAdvancedState(draft, now);
  }
  draft.balance += r.cents;
  draft.transactions.push({ id: `TX-${r.id}`, date: dayKey(now), merchant: `${r.counterpartyName}（撤回退款）`, category: '转账', cents: r.cents, type: 'refund', source: `撤回申请 ${r.id}，${by}受理` });
  r.status = 'APPROVED'; r.resolvedAt = now; r.resolvedBy = by;
  tools.checkBalance(draft);
  for (const key of ['balance', 'contacts', 'ledger', 'transactions', 'reversals', 'advanced']) if (key in draft) s[key] = draft[key];
  return { reversal: structuredClone(r), text: `撤回申请 ${r.id} 已通过，${tools.money(r.cents)} 已退回你的账户。` };
}
module.exports = { ensureReversals, prepareReversal, executeReversal, resolveReversal, WINDOW_DAYS };
