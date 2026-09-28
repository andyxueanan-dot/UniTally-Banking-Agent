const { resolveRecipient } = require('./recipient');

const ADVANCED_TYPES = Object.freeze(['aa_request', 'simulate_aa_payment', 'schedule_transfer', 'cancel_schedule',
  'due_schedule', 'reserve_budget', 'release_budget', 'merchant_catalog', 'prepare_merchant_order', 'pay_merchant_order', 'cancel_merchant_order']);
const RED = new Set(['schedule_transfer', 'pay_merchant_order']);
const READS = new Set(['due_schedule', 'merchant_catalog']);
const DAY = 86400000;
const INITIAL_AA_POOL = 100000000;
const PRODUCTS = Object.freeze([
  Object.freeze({ id: 'flower-demo', name: '生日鲜花（虚构报价）', merchantId: 'demo-flower-shop', merchantName: '演示花店', cents: 19900, category: '购物' }),
  Object.freeze({ id: 'cake-demo', name: '生日蛋糕（虚构报价）', merchantId: 'demo-cake-shop', merchantName: '演示蛋糕店', cents: 26900, category: '餐饮' }),
]);
const clone = value => structuredClone(value);
const reject = (tools, code, text, status = 400) => tools.fail(code, text, status);
const dayKey = now => new Date(now + 8 * 3600000).toISOString().slice(0, 10);
const amountString = cents => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
const natural = value => Number.isSafeInteger(value) && value >= 0;
function stateError() { throw Object.assign(new Error('扩展业务状态异常，已停止操作；不会重置预算或历史账务。'), { code: 'ADVANCED_STATE_INVALID', status: 503 }); }
function heldCents(s) {
  if (!s.advanced) return 0;
  if (!Array.isArray(s.advanced.budgets)) stateError();
  let sum = 0;
  for (const budget of s.advanced.budgets) {
    // This function is also used by ordinary transfers outside this module, so
    // it must fail closed on corrupt reserves without relying on ensure().
    if (!budget || !natural(budget.amountCents) || !natural(budget.remainingCents) || !natural(budget.spentCents) ||
        !natural(budget.releasedCents) || budget.amountCents !== budget.remainingCents + budget.spentCents + budget.releasedCents ||
        !['ACTIVE', 'CONSUMED', 'RELEASED'].includes(budget.status)) stateError();
    if (budget.status === 'ACTIVE') sum += budget.remainingCents;
    else if (budget.remainingCents !== 0) stateError();
  }
  if (!natural(sum)) stateError(); return sum;
}
function ensureAdvancedState(s, now) {
  if (!s.advanced) s.advanced = { version: 1, createdAt: s.createdAt || now, requests: [], schedules: [], budgets: [], orders: [], executions: [],
    aaSimulationPoolInitialCents: INITIAL_AA_POOL, aaSimulationPoolCents: INITIAL_AA_POOL,
    merchantBalances: { 'demo-flower-shop': 0, 'demo-cake-shop': 0 } };
  const a = s.advanced;
  if (a.version !== 1 || !['requests', 'schedules', 'budgets', 'orders', 'executions'].every(key => Array.isArray(a[key])) ||
      !natural(a.aaSimulationPoolInitialCents) || !natural(a.aaSimulationPoolCents) || !a.merchantBalances ||
      a.budgets.some(b => !b || typeof b.id !== 'string' || !natural(b.amountCents) || !natural(b.remainingCents) || !natural(b.spentCents) || !natural(b.releasedCents) ||
        b.amountCents !== b.remainingCents + b.spentCents + b.releasedCents || !natural(b.revision) || !['ACTIVE', 'CONSUMED', 'RELEASED'].includes(b.status)) ||
      a.requests.some(r => !r || !Array.isArray(r.shares) || !natural(r.totalCents) || !natural(r.collectedCents) ||
        r.shares.some(p => !p || !natural(p.cents)) || r.shares.reduce((total, p) => total + p.cents, 0) !== r.totalCents)) stateError();
  heldCents(s); return a;
}
function assertAccounting(s, tools) {
  const a = s.advanced;
  const paid = a.requests.reduce((sum, r) => sum + r.shares.filter(p => p.status === 'SIMULATED_PAID').reduce((n, p) => n + p.cents, 0), 0);
  if (!natural(s.balance) || a.aaSimulationPoolInitialCents - paid !== a.aaSimulationPoolCents ||
      a.requests.some(r => r.collectedCents !== r.shares.filter(p => p.status === 'SIMULATED_PAID').reduce((sum, p) => sum + p.cents, 0)))
    reject(tools, 'ADVANCED_LEDGER_MISMATCH', 'AA模拟清算池或收款记录不一致，已停止操作。', 503);
  for (const product of PRODUCTS) {
    const paidOrders = a.orders.filter(order => order.status === 'PAID' && order.merchantId === product.merchantId).reduce((sum, order) => sum + order.cents, 0);
    if (!natural(a.merchantBalances[product.merchantId]) || a.merchantBalances[product.merchantId] !== paidOrders)
      reject(tools, 'ADVANCED_LEDGER_MISMATCH', '模拟商户清算金额与已付款订单不一致。', 503);
  }
  for (const budget of a.budgets) {
    const orders = a.orders.filter(order => order.budgetId === budget.id);
    if (orders.filter(order => order.status === 'PAID').reduce((sum, order) => sum + order.cents, 0) !== budget.spentCents ||
        orders.filter(order => order.status === 'PREPARED').reduce((sum, order) => sum + order.cents, 0) > budget.remainingCents)
      reject(tools, 'ADVANCED_LEDGER_MISMATCH', '预算与关联订单不一致，已停止操作。', 503);
  }
}
function publicAdvancedState(s, now) {
  const a = ensureAdvancedState(s, now);
  return { sandbox: true, requests: clone(a.requests),
    schedules: a.schedules.map(schedule => ({ ...clone(schedule), effectiveStatus: schedule.status === 'SCHEDULED' && schedule.executeAt <= now ? 'DUE' : schedule.status,
      note: '到期仅提醒；不会后台自动转账，必须重新创建普通转账草案并确认。' })),
    budgets: clone(a.budgets), heldCents: heldCents(s),
    orders: a.orders.map(order => ({ ...clone(order), effectiveStatus: order.status === 'PREPARED' && order.deliveryAt <= now ? 'EXPIRED_UNPAID' : order.status })),
    merchantProducts: clone(PRODUCTS), merchantBalances: clone(a.merchantBalances),
    simulationPoolNote: 'AA显式模拟付款由独立虚构清算池出资，不代表联系人付款，不是用户可支配余额。',
    aaSimulationPoolCents: a.aaSimulationPoolCents,
    warning: '无真实资金、商户或配送服务；无后台定时模型调用。预留不是付款，订单草案不是下单成功。' };
}
function timestamp(value, now, tools, label, future = true) {
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/);
  if (!match) reject(tools, 'EXPLICIT_TIME_REQUIRED', `${label}必须为明确带时区的ISO时间，例如2026-10-01T09:00:00+08:00；不会改成立即执行。`);
  const [, y, m, d, h, min, sec = '00', zone] = match;
  const year = Number(y); const month = Number(m); const date = Number(d);
  const offset = zone === 'Z' ? [0, 0] : zone.slice(1).split(':').map(Number);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || date < 1 || date > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
      Number(h) > 23 || Number(min) > 59 || Number(sec) > 59 || offset[0] > 14 || offset[1] > 59 || (offset[0] === 14 && offset[1] !== 0))
    reject(tools, 'INVALID_SCHEDULE_TIME', `${label}日期或时区无效，未执行。`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || (future && parsed <= now) || parsed > now + 366 * DAY)
    reject(tools, 'INVALID_SCHEDULE_TIME', `${label}必须在未来366天内；过去时间不能当成立即执行。`);
  return parsed;
}
function person(s, selector, tools) {
  if (typeof selector !== 'string' || !selector.trim()) reject(tools, 'RECIPIENT_REQUIRED', '请明确联系人姓名或尾号。');
  const { matches, conflict } = resolveRecipient(selector, s.contacts);
  if (conflict || matches.length !== 1) reject(tools, 'RECIPIENT_AMBIGUOUS', '联系人不存在、同名或姓名尾号冲突，请明确唯一尾号，不能猜测。');
  return matches[0];
}
function cap(list, tools, limit, label) { if (list.length >= limit) reject(tools, 'ADVANCED_RESOURCE_LIMIT', `${label}记录已达本地演示上限；不会删除历史记录。`, 429); }
function integer(value, tools) { if (!Number.isSafeInteger(value) || value <= 0 || value > 100000000) reject(tools, 'INVALID_ADVANCED_AMOUNT', '金额必须为有效正整数分。'); return value; }
function needBudget(a, id, tools) {
  const budget = a.budgets.find(b => b.id === id);
  if (!budget) reject(tools, 'BUDGET_NOT_FOUND', '请指定已创建的预算ID。');
  if (budget.status !== 'ACTIVE') reject(tools, 'BUDGET_NOT_ACTIVE', '该预算已释放或用完，不能继续操作。', 409);
  return budget;
}
function productById(id, tools) {
  const product = PRODUCTS.find(p => p.id === id);
  if (!product) reject(tools, 'MERCHANT_PRODUCT_NOT_FOUND', '只支持flower-demo鲜花和cake-demo蛋糕的明确虚构报价。'); return product;
}
function orderById(a, id, tools) {
  const order = a.orders.find(item => item.id === id);
  if (!order) reject(tools, 'ORDER_NOT_FOUND', '请指定本演示中已创建的订单草案ID。');
  if (order.status === 'PAID') reject(tools, 'ORDER_ALREADY_PAID', '此模拟订单已付款；不能当作未执行撤回，退款是另一个尚未实现的流程。', 409);
  if (order.status !== 'PREPARED') reject(tools, 'ORDER_NOT_ACTIONABLE', '订单已取消，不能继续执行。', 409); return order;
}
function unallocated(a, budget) { return budget.remainingCents - a.orders.filter(order => order.budgetId === budget.id && order.status === 'PREPARED').reduce((sum, order) => sum + order.cents, 0); }

function prepareAdvanced(s, input, now, tools) {
  if (!input || typeof input !== 'object' || !ADVANCED_TYPES.includes(input.type)) reject(tools, 'UNSUPPORTED_ACTION', '不支持这个扩展业务。');
  const a = ensureAdvancedState(s, now); const type = input.type; let action = { type }; let title;
  if (type === 'merchant_catalog') return { returnResult: { type, risk: 'green', products: clone(PRODUCTS),
    text: `${PRODUCTS.map(p => `${p.id}：${p.name} ${tools.money(p.cents)}`).join('；')}。报价全部虚构，不接真实商户。先预留预算，再逐项创建未付款订单，最后逐项确认付款。` } };
  if (type === 'due_schedule') {
    const schedule = a.schedules.find(item => item.id === input.scheduleId);
    if (!schedule) reject(tools, 'SCHEDULE_NOT_FOUND', '找不到该定时计划。');
    const due = schedule.status === 'SCHEDULED' && schedule.executeAt <= now;
    return { returnResult: { type, risk: 'green', schedule: clone(schedule), due,
      ...(due ? { suggestedAction: { type: 'transfer', recipient: schedule.recipientLast4, amount: amountString(schedule.cents), scheduleId: schedule.id } } : {}),
      text: due ? `定时计划已到期，但没有自动转账。请重新发起向${schedule.recipientName}（${schedule.recipientLast4}）转${tools.money(schedule.cents)}的普通草案；余额、当日累计和授权都需重新核对。` : `计划${schedule.status === 'CANCELLED' ? '已取消' : schedule.status === 'COMPLETED' ? '已关联实际模拟转账回执完成' : '尚未到期'}，本次查询未执行新转账。` } };
  }
  if (type === 'aa_request') {
    cap(a.requests, tools, 100, 'AA请求');
    if (typeof input.includeSelf !== 'boolean') reject(tools, 'AA_SELF_REQUIRED', '请明确平摊人数是否包括你本人，不会猜测。');
    if (!Array.isArray(input.participants) || input.participants.length < 1 || input.participants.length > 8)
      reject(tools, 'AA_PARTICIPANTS_REQUIRED', '请明确1到8位其他参与人的姓名或尾号；本人由includeSelf单独指定。');
    const contacts = input.participants.map(selector => person(s, selector, tools));
    if (new Set(contacts.map(c => c.id)).size !== contacts.length) reject(tools, 'AA_DUPLICATE_PARTICIPANT', '同一联系人不能被重复计入AA人数。');
    const people = [...(input.includeSelf ? [{ id: 'demo-owner', name: '本人', last4: null }] : []), ...contacts];
    if (people.length < 2) reject(tools, 'AA_TOO_FEW_PARTICIPANTS', 'AA平摊至少需要两位参与人，请明确是否包括你本人。');
    const total = tools.cents(input.amount); const quotient = Math.floor(total / people.length); const remainder = total % people.length;
    action = { ...action, totalCents: total, includeSelf: input.includeSelf, shares: people.map((p, index) => ({ participantId: p.id, name: p.name, last4: p.last4,
      cents: quotient + (index < remainder ? 1 : 0), isSelf: p.id === 'demo-owner' })) };
    title = `创建AA收款请求：总额${tools.money(total)}，${people.length}人${input.includeSelf ? '含本人' : '不含本人'}；余分按显示顺序分配。只创建请求，不代表到账`;
  } else if (type === 'simulate_aa_payment') {
    if (input.simulation !== true) reject(tools, 'EXPLICIT_SIMULATION_REQUIRED', '仅允许用户明确选择演示付款；不能把聊天中声称已付款当到账。');
    const request = a.requests.find(r => r.id === input.requestId); const share = request?.shares.find(p => p.participantId === input.participantId && !p.isSelf);
    if (!request || !share || share.status !== 'REQUESTED' || share.cents <= 0) reject(tools, 'AA_PAYMENT_NOT_ACTIONABLE', '此参与者没有待模拟付款的AA请求。');
    if (share.cents > a.aaSimulationPoolCents) reject(tools, 'SIMULATION_POOL_EMPTY', '专用虚构清算池余额不足；不会无对手凭空入账。');
    action = { ...action, requestId: request.id, participantId: share.participantId, cents: share.cents, simulation: true };
    title = `显式模拟${share.name}支付AA ${tools.money(share.cents)}：从虚构测试清算池代付，绝非对方真实付款`;
  } else if (type === 'schedule_transfer') {
    cap(a.schedules, tools, 50, '定时计划'); const recipient = person(s, input.recipient, tools);
    action = { ...action, recipientId: recipient.id, recipientName: recipient.name, recipientLast4: recipient.last4,
      cents: tools.cents(input.amount), executeAt: timestamp(input.executeAt, now, tools, '计划时间'), executeAtIso: input.executeAt };
    title = `记录${input.executeAt}向${recipient.name}（${recipient.last4}）转${tools.money(action.cents)}的到期提醒；不预留、不自动扣款，到期重新确认`;
  } else if (type === 'cancel_schedule') {
    const schedule = a.schedules.find(item => item.id === input.scheduleId);
    if (!schedule || schedule.status !== 'SCHEDULED') reject(tools, 'SCHEDULE_NOT_ACTIONABLE', '计划不存在或已取消；不能撤回已完成的普通转账。');
    action = { ...action, scheduleId: schedule.id, expectedRevision: schedule.revision }; title = `取消定时提醒 ${schedule.id}，不涉及退款`;
  } else if (type === 'reserve_budget') {
    cap(a.budgets, tools, 50, '预算');
    if (typeof input.label !== 'string' || !input.label.trim() || input.label.trim().length > 80) reject(tools, 'BUDGET_LABEL_REQUIRED', '请提供1到80字的明确预算用途。');
    const amount = tools.cents(input.amount); if (amount > tools.available(s)) reject(tools, 'INSUFFICIENT_FUNDS', '可用余额不足以预留这笔预算。');
    action = { ...action, cents: amount, label: input.label.trim(), eventAt: timestamp(input.eventAt, now, tools, '预算目标时间'), eventAtIso: input.eventAt };
    title = `为“${action.label}”预留${tools.money(amount)}，目标${input.eventAt}；只减少可用余额，尚未付款`;
  } else if (type === 'release_budget') {
    const budget = needBudget(a, input.budgetId, tools);
    action = { ...action, budgetId: budget.id, expectedRevision: budget.revision };
    title = `释放“${budget.label}”剩余预留${tools.money(budget.remainingCents)}，并取消关联未付款订单；已付款不退款`;
  } else if (type === 'prepare_merchant_order') {
    cap(a.orders, tools, 100, '模拟订单'); const budget = needBudget(a, input.budgetId, tools); const product = productById(input.productId, tools);
    if (product.cents > unallocated(a, budget)) reject(tools, 'BUDGET_INSUFFICIENT', '预算剩余未分配金额不足，不能为多个订单重复占用同一预算。');
    action = { ...action, budgetId: budget.id, expectedBudgetRevision: budget.revision, productId: product.id, cents: product.cents,
      deliveryAt: timestamp(input.deliveryAt, now, tools, '模拟配送时间'), deliveryAtIso: input.deliveryAt };
    title = `准备未付款订单：${product.name} ${tools.money(product.cents)}，模拟配送${input.deliveryAt}；不代表付款或真实商户接单`;
  } else {
    const order = orderById(a, input.orderId, tools);
    action = { ...action, orderId: order.id, expectedRevision: order.revision };
    if (type === 'pay_merchant_order') {
      const budget = needBudget(a, order.budgetId, tools);
      if (order.deliveryAt <= now) reject(tools, 'ORDER_TIME_PASSED', '模拟配送时间已过，请取消并重新准备订单，不能静默改日期。');
      if (budget.remainingCents < order.cents || tools.available(s) < 0 || s.balance < order.cents) reject(tools, 'INSUFFICIENT_FUNDS', '预算或余额已变化，不能执行付款。');
      action.cents = order.cents; action.expectedBudgetRevision = budget.revision;
      title = `从已预留预算支付${order.productName} ${tools.money(order.cents)}（仅本地模拟，不含真实配送）`;
    } else title = `取消未付款订单 ${order.productName}；释放订单分配但预算仍保留，需要时另行释放预算`;
  }
  return { action, title, risk: RED.has(type) ? 'red' : 'yellow' };
}

function executeAdvanced(s, task, now, tools) {
  const action = task?.action;
  if (!action || !ADVANCED_TYPES.includes(action.type) || READS.has(action.type)) reject(tools, 'NOT_EXECUTABLE_ADVANCED_ACTION', '这不是可执行的扩展业务操作。');
  const a = ensureAdvancedState(s, now); const previous = a.executions.find(record => record.taskId === task.id);
  if (previous) {
    if (JSON.stringify(previous.action) !== JSON.stringify(action)) reject(tools, 'ADVANCED_REPLAY_MISMATCH', '已执行任务内容被修改，拒绝重放。', 409);
    return { ...clone(previous.result), idempotent: true };
  }
  if (typeof task.id !== 'string' || !task.id || task.status !== 'AWAITING_CONFIRMATION' || task.risk !== (RED.has(action.type) ? 'red' : 'yellow'))
    reject(tools, 'ADVANCED_AUTH_HANDOFF_INVALID', '必须先由服务端完成对应等级的确认与验证，不能直接执行或降级。', 403);
  cap(a.executions, tools, 500, '扩展业务执行'); assertAccounting(s, tools);
  const draft = clone(s); const db = draft.advanced; const type = action.type; let result;
  if (type === 'aa_request') {
    cap(db.requests, tools, 100, 'AA请求'); integer(action.totalCents, tools);
    if (typeof action.includeSelf !== 'boolean' || !Array.isArray(action.shares) || action.shares.length < 2 || action.shares.length > 9 ||
        new Set(action.shares.map(p => p.participantId)).size !== action.shares.length ||
        action.shares.some(p => !natural(p.cents) || (p.isSelf ? p.participantId !== 'demo-owner' : !draft.contacts.some(c => c.id === p.participantId && c.last4 === p.last4))) ||
        action.shares.filter(p => p.isSelf).length !== (action.includeSelf ? 1 : 0) || action.shares.reduce((sum, p) => sum + p.cents, 0) !== action.totalCents)
      reject(tools, 'INVALID_AA_SPLIT', 'AA参与者或分币金额不一致，未创建请求。');
    const shares = action.shares.map(p => ({ ...clone(p), status: p.isSelf ? 'SELF_SHARE' : p.cents === 0 ? 'NO_PAYMENT_REQUIRED' : 'REQUESTED' }));
    const request = { id: `AA-${tools.id()}`, totalCents: action.totalCents, includeSelf: action.includeSelf, shares,
      receivableCents: shares.filter(p => !p.isSelf).reduce((sum, p) => sum + p.cents, 0), collectedCents: 0,
      status: shares.some(p => p.status === 'REQUESTED') ? 'REQUESTED' : 'NO_COLLECTION_REQUIRED', createdAt: now, sandbox: true };
    db.requests.push(request);
    result = { type, request: clone(request), text: `已创建模拟AA请求${request.id}：${shares.map(p => `${p.name}${tools.money(p.cents)}`).join('、')}。待收${tools.money(request.receivableCents)}，尚未到账；没有向真实联系人发消息，也没有从你的余额扣款。` };
  } else if (type === 'simulate_aa_payment') {
    const request = db.requests.find(item => item.id === action.requestId); const share = request?.shares.find(p => p.participantId === action.participantId && !p.isSelf);
    if (action.simulation !== true || !share || share.status !== 'REQUESTED' || share.cents !== action.cents || share.cents <= 0)
      reject(tools, 'AA_PAYMENT_NOT_ACTIONABLE', '该AA款项已经处理、发生变化或未获显式模拟选择，未入账。', 409);
    if (share.cents > db.aaSimulationPoolCents || !natural(draft.balance + share.cents)) reject(tools, 'SIMULATION_POOL_EMPTY', '虚构清算池不足或余额越界，未入账。');
    db.aaSimulationPoolCents -= share.cents; draft.balance += share.cents; share.status = 'SIMULATED_PAID'; share.paidAt = now;
    request.collectedCents += share.cents; request.status = request.shares.some(p => p.status === 'REQUESTED') ? 'PARTIALLY_SIMULATED_PAID' : 'SIMULATED_SETTLED';
    draft.ledger.push({ id: tools.id(), taskId: task.id, at: now, debitAccount: 'demo-aa-simulation-pool', creditAccount: 'demo-owner', cents: share.cents, simulatedPayerId: share.participantId });
    draft.transactions.push({ id: `TX-${task.id}`, date: dayKey(now), merchant: `${share.name}（AA显式模拟）`, category: '转账', cents: share.cents, type: 'aa_receipt', source: '专用虚构清算池模拟入账，非联系人真实付款' });
    result = { type, request: clone(request), text: `已由专用虚构清算池代${share.name}模拟入账${tools.money(share.cents)}；绝非对方真实付款，未访问对方账户。` };
  } else if (type === 'schedule_transfer') {
    cap(db.schedules, tools, 50, '定时计划'); integer(action.cents, tools);
    if (!draft.contacts.some(c => c.id === action.recipientId && c.last4 === action.recipientLast4)) reject(tools, 'RECIPIENT_CHANGED', '收款联系人发生变化，请重新准备计划。', 409);
    if (timestamp(action.executeAtIso, now, tools, '计划时间') !== action.executeAt) reject(tools, 'INVALID_SCHEDULE_TIME', '计划时间数据不一致。');
    const schedule = { id: `SCHEDULE-${tools.id()}`, recipientId: action.recipientId, recipientName: action.recipientName, recipientLast4: action.recipientLast4,
      cents: action.cents, executeAt: action.executeAt, executeAtIso: action.executeAtIso, status: 'SCHEDULED', revision: 0, createdAt: now, automaticExecution: false };
    db.schedules.push(schedule); result = { type, schedule: clone(schedule), text: `已记录定时提醒${schedule.id}。没有扣款或预留；到期仅显示DUE并要求重新确认普通转账，本原型不支持过期授权自动付款。` };
  } else if (type === 'cancel_schedule') {
    const schedule = db.schedules.find(item => item.id === action.scheduleId);
    if (!schedule || schedule.status !== 'SCHEDULED' || schedule.revision !== action.expectedRevision) reject(tools, 'SCHEDULE_STATE_CHANGED', '计划已变化或取消，未重复操作。', 409);
    schedule.status = 'CANCELLED'; schedule.revision += 1; schedule.cancelledAt = now;
    result = { type, schedule: clone(schedule), text: '已取消这项未执行的定时提醒；没有付款或退款，也不会撤销另行确认过的普通转账。' };
  } else if (type === 'reserve_budget') {
    cap(db.budgets, tools, 50, '预算'); integer(action.cents, tools);
    if (typeof action.label !== 'string' || !action.label.trim() || action.label.length > 80) reject(tools, 'BUDGET_LABEL_REQUIRED', '预算用途不明确。');
    if (timestamp(action.eventAtIso, now, tools, '预算时间') !== action.eventAt) reject(tools, 'INVALID_SCHEDULE_TIME', '预算时间不一致。');
    if (action.cents > tools.available(draft)) reject(tools, 'INSUFFICIENT_FUNDS', '可用余额已变化，不能重复预留同一笔资金。');
    const budget = { id: `BUDGET-${tools.id()}`, label: action.label, amountCents: action.cents, remainingCents: action.cents, spentCents: 0, releasedCents: 0,
      eventAt: action.eventAt, eventAtIso: action.eventAtIso, status: 'ACTIVE', revision: 0, createdAt: now };
    db.budgets.push(budget); result = { type, budget: clone(budget), text: `预算${budget.id}已预留${tools.money(action.cents)}，账面余额不变、可用余额相应减少。尚未付款或下单。` };
  } else if (type === 'release_budget') {
    const budget = needBudget(db, action.budgetId, tools);
    if (budget.revision !== action.expectedRevision) reject(tools, 'BUDGET_STATE_CHANGED', '预算已变化，请重新确认剩余释放金额。', 409);
    const amount = budget.remainingCents; budget.remainingCents = 0; budget.releasedCents += amount; budget.status = 'RELEASED'; budget.revision += 1;
    for (const order of db.orders) if (order.budgetId === budget.id && order.status === 'PREPARED') { order.status = 'CANCELLED'; order.revision += 1; order.cancelledAt = now; order.cancelReason = 'BUDGET_RELEASED'; }
    result = { type, budget: clone(budget), text: `已释放剩余预留${tools.money(amount)}，关联未付款订单已作废；已付款部分${tools.money(budget.spentCents)}没有退款。` };
  } else if (type === 'prepare_merchant_order') {
    cap(db.orders, tools, 100, '模拟订单'); const budget = needBudget(db, action.budgetId, tools); const product = productById(action.productId, tools);
    if (budget.revision !== action.expectedBudgetRevision || action.cents !== product.cents) reject(tools, 'BUDGET_STATE_CHANGED', '预算或虚构报价发生变化，请重新准备。', 409);
    if (timestamp(action.deliveryAtIso, now, tools, '模拟配送时间') !== action.deliveryAt) reject(tools, 'INVALID_SCHEDULE_TIME', '模拟配送时间不一致。');
    if (product.cents > unallocated(db, budget)) reject(tools, 'BUDGET_INSUFFICIENT', '预算已经分配给其他未付款订单，不能重复占用。');
    const order = { id: `ORDER-${tools.id()}`, budgetId: budget.id, productId: product.id, productName: product.name, merchantId: product.merchantId,
      merchantName: product.merchantName, cents: product.cents, deliveryAt: action.deliveryAt, deliveryAtIso: action.deliveryAtIso,
      status: 'PREPARED', revision: 0, createdAt: now, sandbox: true, realMerchantConnected: false };
    db.orders.push(order); budget.revision += 1;
    result = { type, order: clone(order), text: `已准备未付款模拟订单${order.id}：${product.name} ${tools.money(product.cents)}。没有扣款，未向真实商户发送订单；付款需要单独红色验证。` };
  } else if (type === 'cancel_merchant_order') {
    const order = orderById(db, action.orderId, tools);
    if (order.revision !== action.expectedRevision) reject(tools, 'ORDER_STATE_CHANGED', '订单已变化，请重新确认。', 409);
    order.status = 'CANCELLED'; order.revision += 1; order.cancelledAt = now;
    const budget = db.budgets.find(b => b.id === order.budgetId); if (budget) budget.revision += 1;
    result = { type, order: clone(order), text: '未付款订单已取消，订单分配已释放，但预算预留仍存在；如不再需要，请另外释放预算。没有产生退款。' };
  } else if (type === 'pay_merchant_order') {
    const order = orderById(db, action.orderId, tools); const budget = needBudget(db, order.budgetId, tools);
    if (order.revision !== action.expectedRevision || budget.revision !== action.expectedBudgetRevision || order.cents !== action.cents)
      reject(tools, 'ORDER_STATE_CHANGED', '订单或预算在确认期间发生变化，请重新确认付款。', 409);
    if (order.deliveryAt <= now) reject(tools, 'ORDER_TIME_PASSED', '配送时间已过，不能静默改为立即下单。');
    const free = tools.available(draft);
    if (!Number.isSafeInteger(free) || free < 0 || budget.remainingCents < order.cents || draft.balance < order.cents)
      reject(tools, 'INSUFFICIENT_FUNDS', '预算或账户资金不足，不能挪用其他任务的预留。');
    budget.remainingCents -= order.cents; budget.spentCents += order.cents; budget.revision += 1;
    if (!budget.remainingCents) budget.status = 'CONSUMED';
    draft.balance -= order.cents; db.merchantBalances[order.merchantId] += order.cents; order.status = 'PAID'; order.paidAt = now; order.revision += 1;
    const product = productById(order.productId, tools);
    draft.ledger.push({ id: tools.id(), taskId: task.id, at: now, debitAccount: 'demo-owner', creditAccount: order.merchantId, cents: order.cents });
    draft.transactions.push({ id: `TX-${task.id}`, date: dayKey(now), merchant: order.merchantName, category: product.category, cents: order.cents, type: 'expense', source: '本地模拟商户付款，无真实商户或配送' });
    result = { type, order: clone(order), budget: clone(budget), text: `本地模拟订单已支付${tools.money(order.cents)}，预算和余额已同步结算，虚构商户清算账户已记账。没有真实商户接入，不代表鲜花/蛋糕已配送。` };
  }
  ensureAdvancedState(draft, now); assertAccounting(draft, tools);
  db.executions.push({ taskId: task.id, action: clone(action), result: clone(result), completedAt: now });
  tools.audit(draft, 'ADVANCED_BUSINESS_EXECUTED', result.text, now, task.id);
  for (const key of ['advanced', 'balance', 'ledger', 'transactions', 'audit']) s[key] = draft[key];
  return result;
}

module.exports = { ADVANCED_TYPES, ensureAdvancedState, publicAdvancedState, heldCents, prepareAdvanced, executeAdvanced };
