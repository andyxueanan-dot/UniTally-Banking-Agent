// Explicit manual sandbox purchase: never a claim that a real merchant charged a card.
const day = now => new Date(now + 8 * 3600000).toISOString().slice(0, 10);
function validateCardPurchase(a) {
  if (!a || a.type !== 'card_purchase' || Object.keys(a).some(k => !['type', 'cardLast4', 'amount', 'online', 'overseas'].includes(k)) ||
      typeof a.cardLast4 !== 'string' || !/^\d{4}$/.test(a.cardLast4) || typeof a.amount !== 'string' ||
      typeof a.online !== 'boolean' || typeof a.overseas !== 'boolean') {
    throw Object.assign(new Error('模拟卡消费需明确卡片尾号、金额、线上/线下及境内/境外，不接受授权字段。'), { code: 'INVALID_CARD_PURCHASE', status: 400 });
  }
}
function check(s, a, now, tools) {
  const matches = s.cards.filter(c => c.last4 === a.cardLast4);
  if (matches.length !== 1) tools.fail('CARD_NOT_FOUND', '找不到唯一的模拟卡片。');
  const card = matches[0];
  if (card.status !== 'ACTIVE') tools.fail('CARD_NOT_ACTIVE', '卡片已锁定或挂失，模拟消费被拒绝，未扣款。');
  const controls = s.business?.cardControls[card.id] || { online: true, overseas: true, revision: 0 };
  if (a.online && !controls.online) tools.fail('ONLINE_PAYMENT_BLOCKED', '该卡已限制线上交易，模拟消费被拒绝，未扣款。');
  if (a.overseas && !controls.overseas) tools.fail('OVERSEAS_PAYMENT_BLOCKED', '该卡已限制境外交易，模拟消费被拒绝，未扣款。');
  const records = s.cardPayments?.receipts || [];
  const spent = records.filter(r => r.cardId === card.id && r.day === day(now)).reduce((sum, r) => sum + r.cents, 0);
  if (!Number.isSafeInteger(a.cents) || a.cents <= 0 || !Number.isSafeInteger(card.limit) || !Number.isSafeInteger(spent)) tools.fail('INVALID_CARD_PURCHASE', '模拟消费或限额数据无效。');
  if (spent + a.cents > card.limit) tools.fail('CARD_DAILY_LIMIT', `已达到此卡每日消费限额 ${tools.money(card.limit)}，今日模拟刷卡已用 ${tools.money(spent)}。未扣款。`);
  if (a.cents > tools.available(s)) tools.fail('INSUFFICIENT_FUNDS', '可用余额不足，不能占用其他任务或预算的预留资金。');
  if (records.length >= 200) tools.fail('CARD_RECEIPT_LIMIT', '本会话模拟刷卡记录已达上限。', 429);
  if (s.cardPayments && (s.cardPayments.clearingCents !== records.reduce((sum, r) => sum + r.cents, 0))) tools.fail('CARD_LEDGER_MISMATCH', '模拟刷卡清算记录不一致，停止操作。', 503);
  return { card, controls };
}
function prepareCardPurchase(s, request, now, tools) {
  validateCardPurchase(request);
  const action = { type: 'card_purchase', cardLast4: request.cardLast4, cents: tools.cents(request.amount), online: request.online, overseas: request.overseas };
  const { card, controls } = check(s, action, now, tools);
  return { action: { ...action, cardId: card.id, expectedRevision: controls.revision, expectedLimit: card.limit },
    title: `模拟刷卡 ${tools.money(action.cents)} · 尾号${card.last4} · ${action.online ? '线上' : '线下'} / ${action.overseas ? '境外' : '境内'}（仅模拟资金）` };
}
function executeCardPurchase(s, task, now, tools) {
  if (task.status !== 'AWAITING_CONFIRMATION' || task.risk !== 'red') tools.fail('CARD_AUTH_REQUIRED', '模拟刷卡必须逐项确认并验证，不能直接执行。', 403);
  const a = task.action;
  const { card, controls } = check(s, a, now, tools);
  if (card.id !== a.cardId || controls.revision !== a.expectedRevision || card.limit !== a.expectedLimit) tools.fail('CARD_STATE_CHANGED', '卡片限制或限额已变化，请重新准备并确认消费。', 409);
  const payments = s.cardPayments || { clearingCents: 0, receipts: [] };
  if (payments.receipts.some(r => r.taskId === task.id)) tools.fail('CARD_ALREADY_SETTLED', '此笔模拟刷卡已有回执，不会再次扣款。', 409);
  const receipt = { id: tools.id(), taskId: task.id, cardId: card.id, cardLast4: card.last4, cents: a.cents, online: a.online, overseas: a.overseas, day: day(now), at: now };
  s.balance -= a.cents;
  payments.clearingCents += a.cents; payments.receipts.push(receipt); s.cardPayments = payments;
  s.ledger.push({ id: receipt.id, taskId: task.id, at: now, debitAccount: 'demo-owner', creditAccount: 'demo-card-clearing', cents: a.cents });
  s.transactions.push({ id: `TX-${task.id}`, date: day(now), merchant: '模拟卡消费', category: '购物', cents: a.cents, type: 'expense', source: '经卡状态、渠道及日限额校验的模拟刷卡' });
  tools.audit(s, 'CARD_PAYMENT_SETTLED', `模拟刷卡回执 ${receipt.id}；尾号${card.last4}；${tools.money(a.cents)}；没有接入商户或真实银行。`, now, task.id);
  return { type: 'card_purchase', receiptId: receipt.id, text: `模拟刷卡完成 ${tools.money(a.cents)}，尾号${card.last4}，已核验卡状态、渠道限制和日限额。模拟余额及回执已更新，未发生真实交易。` };
}
module.exports = { validateCardPurchase, prepareCardPurchase, executeCardPurchase };
