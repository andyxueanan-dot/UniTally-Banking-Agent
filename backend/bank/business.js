// Pure, offline business operations. Authentication, immutable task binding and
// confirmation/challenge verification belong to BankService, not to the model.
const BUSINESS_TYPES = Object.freeze([
  'subscription_query', 'cancel_subscription', 'wealth_catalog', 'risk_assessment',
  'wealth_buy', 'wealth_redeem', 'wealth_positions', 'apply_virtual_card',
  'temporary_lock_card', 'unlock_card', 'card_restriction', 'card_credit_request',
]);
const YELLOW = new Set(['subscription_query', 'cancel_subscription', 'risk_assessment', 'apply_virtual_card']);
const READ_ONLY = new Set(['wealth_catalog', 'wealth_positions']);
const DAY = 86400000;
const riskQuestionnaire = require('./risk-questionnaire');
const DISCLAIMER = '全部为虚构教学产品和模拟资金，不提供真实投资建议，不保证任何收益。';
const PRODUCTS = Object.freeze([
  Object.freeze({ id: 'demo-flex', name: '演示灵活计划', riskLevel: 1, minCents: 10000, lockDays: 0, description: '模拟低风险档；无锁定期，仅记录本金，不保证保本或收益。' }),
  Object.freeze({ id: 'demo-term7', name: '演示七日计划', riskLevel: 2, minCents: 50000, lockDays: 7, description: '演示指定R2中低风险；买入后满7×24小时才可赎回，只模拟本金，并非银行真实评级。' }),
  Object.freeze({ id: 'demo-term30', name: '演示三十日计划', riskLevel: 3, minCents: 100000, lockDays: 30, description: '演示指定R3中风险；买入后满30×24小时才可赎回，只模拟本金，并非银行真实评级。' }),
]);

function dayKey(now) { return new Date(now + 8 * 3600000).toISOString().slice(0, 10); }
function clone(value) { return structuredClone(value); }
function reject(tools, code, message, status = 400) { return tools.fail(code, message, status); }
function requireObject(value, tools) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject(tools, 'INVALID_BUSINESS_ACTION', '业务参数无效，未执行。');
}
function integer(value, tools, code = 'INVALID_BUSINESS_AMOUNT') {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 100000000) reject(tools, code, '金额必须是有效的正整数分，未执行。');
  return value;
}
function ensureBusinessState(s, now) {
  if (!s.business) {
    s.business = { version: 1, subscriptionsApprovedAt: null, riskProfile: null, positions: [],
      clearingBalance: 0, executions: [], creditApplications: [], cardControls: {}, nextVirtualCard: 9001,
      subscriptions: [
        { id: 'sub-music', merchant: '云音乐会员', expectedCents: 1800, billingDay: 10,
          bankMandateStatus: 'ACTIVE', merchantMembershipStatus: 'ACTIVE', managed: true, revision: 0,
          evidenceKind: 'known_demo_authorization', note: '虚构授权记录；有周期消费样本，预计续费日并非到账保证。' },
        { id: 'sub-cloud', merchant: '云盘会员', expectedCents: 2500, billingDay: 11,
          bankMandateStatus: 'ACTIVE', merchantMembershipStatus: 'ACTIVE', managed: true, revision: 0,
          evidenceKind: 'known_demo_authorization', note: '虚构授权记录；历史样本少，日期与金额仅为模拟合同设置。' },
        { id: 'sub-video', merchant: '视频网站会员', expectedCents: 2500, billingDay: 16,
          bankMandateStatus: 'UNKNOWN', merchantMembershipStatus: 'UNKNOWN', managed: false, revision: 0,
          evidenceKind: 'inferred_from_transaction', note: '仅从一笔订阅类消费推测；不能据此认定已签约或自动取消。' },
      ], createdAt: s.createdAt || now };
  }
  const b = s.business;
  if (b.version !== 1 || !Array.isArray(b.subscriptions) || !Array.isArray(b.positions) || !Array.isArray(b.executions) ||
      !Array.isArray(b.creditApplications) || !b.cardControls || typeof b.cardControls !== 'object' || Array.isArray(b.cardControls) ||
      !Number.isSafeInteger(b.clearingBalance) || b.clearingBalance < 0 || !Number.isSafeInteger(b.nextVirtualCard) ||
      b.nextVirtualCard < 9000 || b.nextVirtualCard > 10000 ||
      b.subscriptions.some(sub => !sub || typeof sub.id !== 'string' || !Number.isSafeInteger(sub.revision) || sub.revision < 0 ||
        !Number.isSafeInteger(sub.expectedCents) || sub.expectedCents <= 0 || !Number.isInteger(sub.billingDay) || sub.billingDay < 1 || sub.billingDay > 31) ||
      b.positions.some(position => !position || typeof position.id !== 'string' || !Number.isSafeInteger(position.principalCents) || position.principalCents < 0 ||
        !Number.isFinite(position.unlockAt) || !Number.isSafeInteger(position.revision) || position.revision < 0) ||
      !riskQuestionnaire.validStoredProfile(b.riskProfile)) {
    throw Object.assign(new Error('业务演示状态不受支持，已停止操作，不会自动重置。'), { code: 'BUSINESS_STATE_INVALID', status: 503 });
  }
  return b;
}
function nextBillingDate(billingDay, now) {
  const today = dayKey(now); const [year, month] = today.split('-').map(Number);
  for (let offset = 0; offset < 2; offset++) {
    const date = new Date(Date.UTC(year, month - 1 + offset, 1));
    const days = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    const result = `${date.toISOString().slice(0, 7)}-${String(Math.min(billingDay, days)).padStart(2, '0')}`;
    if (result >= today) return result;
  }
  return null;
}
function subscriptionsView(s, now) {
  return s.business.subscriptions.map(sub => {
    const rows = s.transactions.filter(row => row.type === 'expense' && row.merchant === sub.merchant).sort((a, b) => a.date.localeCompare(b.date));
    const amounts = rows.map(row => row.cents); const latest = rows.at(-1);
    return { ...clone(sub), sourceRowIds: rows.map(row => row.id), lastChargeDate: latest?.date || null,
      lastChargeCents: latest?.cents ?? null, possiblePriceChange: amounts.length >= 2 ? amounts.at(-1) !== amounts.at(-2) : null,
      expectedRenewalDate: sub.merchantMembershipStatus === 'CANCELLED' ? null : nextBillingDate(sub.billingDay, now),
      renewalDateIsEstimate: true, sampleCount: rows.length,
      warning: sub.managed ? '撤销银行代扣不等于终止商户会员；取消商户会员也不会冒称所有银行授权已撤销。' : '仅为疑似订阅，请先向商户核实；本演示未接入该商户或代扣授权。' };
  });
}
function publicBusinessState(s, now) {
  const b = ensureBusinessState(s, now);
  return { sandbox: true, disclaimer: DISCLAIMER, subscriptionsAuthorized: b.subscriptionsApprovedAt !== null,
    subscriptions: b.subscriptionsApprovedAt !== null ? subscriptionsView(s, now) : [],
    subscriptionNotice: b.subscriptionsApprovedAt !== null ? '已明确确认查询本演示账户的订阅信息。' : '按赛题黄色权限要求，先确认订阅查询才显示列表。',
    products: clone(PRODUCTS), questionnaire: riskQuestionnaire.publicQuestionnaire(), riskProfile: riskQuestionnaire.publicProfile(b.riskProfile, now),
    positions: clone(b.positions), principalTotal: b.positions.reduce((total, position) => total + position.principalCents, 0),
    returns: null, returnsNote: '本演示无净值或市场行情，不计算、不承诺投资收益。',
    cardControls: clone(b.cardControls), creditApplications: clone(b.creditApplications) };
}
function productById(id, tools) {
  const product = PRODUCTS.find(item => item.id === id);
  if (!product) reject(tools, 'PRODUCT_NOT_FOUND', '请指定虚构产品 demo-flex、demo-term7 或 demo-term30；不能编造产品。');
  return product;
}
function cardByLast4(s, last4, tools) {
  if (typeof last4 !== 'string' || !/^\d{4}$/.test(last4)) reject(tools, 'CARD_REQUIRED', '请明确要操作的四位卡片尾号。');
  const matches = s.cards.filter(card => card.last4 === last4);
  if (matches.length !== 1) reject(tools, 'CARD_NOT_FOUND', '卡片不存在或尾号不唯一，请核对后重新提出操作。');
  return matches[0];
}
function cardControl(b, id) { return b.cardControls[id] || { online: true, overseas: true, revision: 0 }; }
function assertCardOperation(card, type, tools) {
  if (type === 'unlock_card') {
    if (card.status === 'FROZEN') reject(tools, 'CARD_REQUIRES_UNFREEZE', '该卡已挂失；普通解锁不能解挂，请走红色解挂验证流程。');
    if (card.status !== 'LOCKED') reject(tools, 'CARD_NOT_LOCKED', '只有临时锁定的卡可以解锁。');
  } else if (card.status !== 'ACTIVE') reject(tools, 'CARD_NOT_ACTIVE', '卡片不是正常状态，不能执行这项操作。');
}
function scoreAnswers(answers, tools) {
  try { return riskQuestionnaire.scoreRisk(answers); } catch (e) { return reject(tools,e.code || 'INVALID_RISK_ANSWERS',e.message); }
}
function checkWealthInvariant(s, tools) {
  const b = s.business;
  if (b.positions.some(p => !Number.isSafeInteger(p.principalCents) || p.principalCents < 0) ||
      b.positions.reduce((sum, p) => sum + p.principalCents, 0) !== b.clearingBalance ||
      !Number.isSafeInteger(s.balance) || s.balance < 0) reject(tools, 'WEALTH_LEDGER_MISMATCH', '模拟持仓与对手资金不一致，已停止操作，请人工核对。', 503);
}

function prepareBusiness(s, a, now, tools) {
  requireObject(a, tools);
  if (!BUSINESS_TYPES.includes(a.type)) reject(tools, 'UNSUPPORTED_ACTION', '该业务不在白名单中。');
  const b = ensureBusinessState(s, now); let action = { type: a.type }; let title;
  if (a.type === 'wealth_catalog') return { returnResult: { type: 'wealth_catalog', risk: 'green', products: clone(PRODUCTS),
    questionnaire: riskQuestionnaire.publicQuestionnaire(), text: `${DISCLAIMER}\n${PRODUCTS.map(p => `${p.name}（${p.id}）：演示R${p.riskLevel}，起购${tools.money(p.minCents)}，锁定${p.lockDays}天。${p.description}`).join('\n')}` } };
  if (a.type === 'wealth_positions') {
    checkWealthInvariant(s, tools);
    return { returnResult: { type: 'wealth_positions', risk: 'green', positions: clone(b.positions), principalTotal: b.clearingBalance,
      returns: null, text: `模拟持仓本金合计 ${tools.money(b.clearingBalance)}。${b.positions.filter(p => p.principalCents > 0).length}笔未清空持仓。没有市场净值数据，不能编造收益。${DISCLAIMER}` } };
  }
  if (a.type === 'subscription_query') title = '确认查询本演示账户的订阅与代扣记录';
  else if (a.type === 'cancel_subscription') {
    const sub = b.subscriptions.find(item => item.id === a.subscriptionId);
    if (!sub) reject(tools, 'SUBSCRIPTION_NOT_FOUND', '请先查询并明确订阅ID，不会猜测要取消哪个服务。');
    if (!['bank_mandate', 'merchant_membership'].includes(a.scope)) reject(tools, 'SUBSCRIPTION_SCOPE_REQUIRED', '请明确撤销银行代扣授权，还是终止商户会员；这不是同一件事。');
    if (!sub.managed) reject(tools, 'SUBSCRIPTION_NOT_MANAGED', '这条记录只是疑似订阅，没有可执行的已知授权；请向商户核实，未执行取消。');
    const field = a.scope === 'bank_mandate' ? 'bankMandateStatus' : 'merchantMembershipStatus';
    if (sub[field] !== 'ACTIVE') reject(tools, 'SUBSCRIPTION_ALREADY_CANCELLED', '所选范围已取消或不可操作，无需重复执行。');
    action = { ...action, subscriptionId: sub.id, scope: a.scope, expectedRevision: sub.revision };
    title = `${a.scope === 'bank_mandate' ? '撤销银行代扣授权（不终止会员）' : '终止模拟商户会员（不替代撤销银行授权）'} · ${sub.merchant}`;
  } else if (a.type === 'risk_assessment') {
    if (a.questionnaireVersion !== riskQuestionnaire.VERSION) reject(tools,'QUESTIONNAIRE_VERSION_REQUIRED','请打开最新版11题问卷，旧测评和不明版本不能用于本次申购。');
    scoreAnswers(a.answers, tools); action = { ...action, answers: [...a.answers], expectedRevision: b.riskProfile?.revision || 0 };
    action.questionnaireVersion = riskQuestionnaire.VERSION;
    title = `确认11题模拟风险测评 · 参考苏州银行V.202308 · 答案 ${a.answers.join('/')}（非银行正式评估）`;
  } else if (a.type === 'wealth_buy') {
    const product = productById(a.productId, tools); const amount = tools.cents(a.amount);
    checkWealthInvariant(s, tools);
    if (!riskQuestionnaire.profileStatus(b.riskProfile,now).current) reject(tools, 'RISK_ASSESSMENT_REQUIRED', '请先完成并确认新版11题测评；旧版或已过期结果不能用于新申购。');
    const profile = { ...scoreAnswers(b.riskProfile.answers, tools), answers: b.riskProfile.answers };
    const days = riskQuestionnaire.purchaseDays(profile,a.availableDays,tools.fail);
    if (!profile.acceptsLoss || profile.riskLevel < product.riskLevel)
      reject(tools, 'RISK_MISMATCH', '产品与已确认问卷的损失意愿或C/R等级不适配；非保本模拟产品已被拦截，不会用总分覆盖关键回答。');
    if (days < product.lockDays) reject(tools,'RISK_MISMATCH','资金可锁定天数不足；“一年以下”不能自动解释为可锁定7天或30天。');
    if (amount < product.minCents) reject(tools, 'BELOW_MINIMUM', `该虚构产品起购金额为 ${tools.money(product.minCents)}。`);
    if (amount > tools.available(s)) reject(tools, 'INSUFFICIENT_FUNDS', '可用余额不足，不能占用其他任务预留资金。');
    if (b.positions.length >= 100) reject(tools, 'POSITION_LIMIT', '本演示持仓记录已达上限，不会删除历史记录。', 429);
    action = { ...action, productId: product.id, cents: amount, expectedRiskRevision: b.riskProfile.revision, ...(a.availableDays !== undefined ? { availableDays: a.availableDays } : {}) };
    title = `模拟申购 ${product.name} ${tools.money(amount)}，演示R${product.riskLevel}，锁定${product.lockDays}天${a.availableDays !== undefined ? `；你确认资金至少可不用${a.availableDays}天` : ''}；不保证收益`;
  } else if (a.type === 'wealth_redeem') {
    const position = b.positions.find(item => item.id === a.positionId); const amount = tools.cents(a.amount);
    checkWealthInvariant(s, tools);
    if (!position) reject(tools, 'POSITION_NOT_FOUND', '请明确实际模拟持仓ID，不能凭产品名猜测要赎回哪一笔。');
    if (amount > position.principalCents) reject(tools, 'INSUFFICIENT_POSITION', '赎回本金超过当前模拟持仓。');
    if (now < position.unlockAt) reject(tools, 'POSITION_LOCKED', '该模拟持仓尚未到解锁时间，未发起赎回。');
    action = { ...action, positionId: position.id, cents: amount, expectedRevision: position.revision };
    title = `赎回 ${position.productName} 的模拟本金 ${tools.money(amount)}（无虚构收益）`;
  } else if (a.type === 'apply_virtual_card') {
    if (s.cards.length >= 12) reject(tools, 'CARD_LIMIT_REACHED', '本演示最多保留12张模拟卡，不会删除原有卡片。', 429);
    title = '申请仅本地可用的DEMO虚拟卡（无真实支付卡号，不能付款）';
  } else {
    const card = cardByLast4(s, a.cardLast4, tools); assertCardOperation(card, a.type, tools);
    const controls = cardControl(b, card.id);
    action = { ...action, cardId: card.id, cardLast4: card.last4, expectedStatus: card.status, expectedControlRevision: controls.revision };
    if (a.type === 'card_restriction') {
      if (!['online', 'overseas'].includes(a.channel) || typeof a.enabled !== 'boolean') reject(tools, 'INVALID_CARD_RESTRICTION', '交易渠道必须为online或overseas，enabled必须为布尔值。');
      if (controls[a.channel] === a.enabled) reject(tools, 'CARD_RESTRICTION_UNCHANGED', '该渠道当前已是所选状态，无需重复设置。');
      action.channel = a.channel; action.enabled = a.enabled;
      title = `${a.enabled ? '允许' : '限制'}${a.channel === 'online' ? '线上' : '境外'}交易 · 尾号${card.last4}（仅模拟新卡交易，不取消订阅）`;
    } else if (a.type === 'card_credit_request') {
      if (b.creditApplications.length >= 100) reject(tools, 'CREDIT_REQUEST_LIMIT', '演示额度申请记录已达上限。', 429);
      action.cents = tools.cents(a.amount);
      title = `以尾号${card.last4}账户提交独立信用业务意向 ${tools.money(action.cents)}（借记卡本身无信用额度；仅待人工审核，不增加余额或消费限额）`;
    } else title = `${a.type === 'temporary_lock_card' ? '临时锁定' : '解除临时锁定'} · 尾号${card.last4}（不是挂失/解挂）`;
  }
  return { action, title, risk: YELLOW.has(a.type) ? 'yellow' : 'red' };
}

function executeBusiness(s, task, now, tools) {
  requireObject(task, tools); requireObject(task.action, tools);
  const a = task.action;
  if (!BUSINESS_TYPES.includes(a.type) || READ_ONLY.has(a.type)) reject(tools, 'NOT_EXECUTABLE_BUSINESS_ACTION', '这不是可确认执行的业务操作。');
  const b = ensureBusinessState(s, now);
  const previous = b.executions.find(item => item.taskId === task.id);
  if (previous) {
    if (JSON.stringify(previous.action) !== JSON.stringify(a)) reject(tools, 'BUSINESS_REPLAY_MISMATCH', '已执行任务的内容被改变，拒绝重放。', 409);
    return { ...clone(previous.result), idempotent: true };
  }
  if (typeof task.id !== 'string' || !task.id || task.status !== 'AWAITING_CONFIRMATION' || task.risk !== (YELLOW.has(a.type) ? 'yellow' : 'red'))
    reject(tools, 'BUSINESS_AUTH_HANDOFF_INVALID', '业务必须通过服务端对应等级的确认流程，不接受直接执行或权限降级。', 403);
  if (b.executions.length >= 500) reject(tools, 'BUSINESS_EXECUTION_LIMIT', '本会话业务执行记录已达上限，历史幂等记录不会删除。', 429);
  // Work on a private draft. All checks and audit generation precede commit;
  // failures do not leave partial balance, position, card or subscription changes.
  const draft = clone(s); const db = draft.business; let result;
  if (a.type === 'subscription_query') {
    db.subscriptionsApprovedAt = now;
    const subscriptions = subscriptionsView(draft, now);
    result = { type: a.type, subscriptions, text: `已获明确确认，查询到${subscriptions.length}条模拟记录：${subscriptions.map(item => `${item.merchant}（${item.id}，${item.managed ? '已知虚构授权' : '疑似订阅，未确认授权'}），预计${item.expectedRenewalDate || '无续费'}，${tools.money(item.expectedCents)}`).join('；')}。预计日期不是保证；取消会员与撤销代扣不同。` };
  } else if (a.type === 'cancel_subscription') {
    const sub = db.subscriptions.find(item => item.id === a.subscriptionId);
    if (!sub || !sub.managed || sub.revision !== a.expectedRevision) reject(tools, 'SUBSCRIPTION_STATE_CHANGED', '订阅状态已变化或无已知授权，请重新确认。', 409);
    if (!['bank_mandate', 'merchant_membership'].includes(a.scope)) reject(tools, 'SUBSCRIPTION_SCOPE_REQUIRED', '取消范围不明确，未执行。');
    const field = a.scope === 'bank_mandate' ? 'bankMandateStatus' : 'merchantMembershipStatus';
    if (sub[field] !== 'ACTIVE') reject(tools, 'SUBSCRIPTION_STATE_CHANGED', '所选授权或会员已不在可取消状态。', 409);
    sub[field] = 'CANCELLED'; sub.revision += 1;
    result = { type: a.type, subscriptionId: sub.id, scope: a.scope, text: a.scope === 'bank_mandate' ? `已撤销${sub.merchant}的模拟银行代扣授权；商户会员未被取消，请另外联系/操作商户。历史扣费不会退款。` : `已终止${sub.merchant}的模拟商户会员；未替代银行代扣授权撤销，不声称银行授权同时取消。历史扣费不会退款。` };
  } else if (a.type === 'risk_assessment') {
    if (a.questionnaireVersion !== riskQuestionnaire.VERSION) reject(tools,'QUESTIONNAIRE_VERSION_REQUIRED','旧问卷草案已失效，请重新填写新版问卷。',409);
    const scored = scoreAnswers(a.answers, tools);
    if ((db.riskProfile?.revision || 0) !== a.expectedRevision) reject(tools, 'RISK_PROFILE_CHANGED', '教学风险问卷已经更新，请重新确认。', 409);
    db.riskProfile = { answers: [...a.answers], ...scored, questionnaireVersion: riskQuestionnaire.VERSION, source: { ...riskQuestionnaire.SOURCE }, assessedAt: now, expiresAt: now + 365 * DAY, revision: a.expectedRevision + 1, teachingOnly: true,
      disclaimer: '仅参考苏州银行公开计分的独立模拟测评，非该行认证、非正式适当性评估。FinPilot另核验损失意愿与交易资金期限。' };
    result = { type: a.type, profile: riskQuestionnaire.publicProfile(db.riskProfile,now), text: `模拟测评已确认：${scored.riskLabel}。${!scored.acceptsLoss ? '你的回答体现不希望本金损失，当前非保本模拟产品仍不可申购。' : ''}${db.riskProfile.disclaimer}` };
  } else if (a.type === 'wealth_buy') {
    const product = productById(a.productId, tools); integer(a.cents, tools); checkWealthInvariant(draft, tools);
    const profile = riskQuestionnaire.profileStatus(db.riskProfile,now).current ? { ...scoreAnswers(db.riskProfile.answers, tools), answers: db.riskProfile.answers } : null;
    if (!profile || db.riskProfile.revision !== a.expectedRiskRevision || !profile.acceptsLoss || profile.riskLevel < product.riskLevel || riskQuestionnaire.purchaseDays(profile,a.availableDays,tools.fail) < product.lockDays)
      reject(tools, 'RISK_PROFILE_CHANGED', '已确认问卷发生变化或不适配该产品，未申购。', 409);
    if (a.cents < product.minCents) reject(tools, 'BELOW_MINIMUM', '申购低于虚构产品起购金额。');
    if (a.cents > tools.available(draft)) reject(tools, 'INSUFFICIENT_FUNDS', '可用资金已变化，不能使用其他任务的预留金额。');
    if (db.positions.length >= 100) reject(tools, 'POSITION_LIMIT', '模拟持仓记录已达上限。', 429);
    const position = { id: `POS-${tools.id()}`, productId: product.id, productName: product.name, principalCents: a.cents,
      purchasedPrincipalCents: a.cents, createdAt: now, unlockAt: now + product.lockDays * DAY, revision: 0, status: 'OPEN', riskLevel: product.riskLevel };
    draft.balance -= a.cents; db.clearingBalance += a.cents; db.positions.push(position);
    draft.ledger.push({ id: tools.id(), taskId: task.id, at: now, debitAccount: 'demo-owner', creditAccount: 'demo-wealth-clearing', cents: a.cents });
    draft.transactions.push({ id: `TX-${task.id}`, date: dayKey(now), merchant: product.name, category: '理财', cents: a.cents, type: 'investment_buy', source: '本地虚构理财本金划转' });
    result = { type: a.type, position: clone(position), text: `已模拟申购${product.name}，本金${tools.money(a.cents)}已从可用资金转入持仓。持仓ID：${position.id}。${DISCLAIMER}` };
  } else if (a.type === 'wealth_redeem') {
    integer(a.cents, tools); checkWealthInvariant(draft, tools);
    const position = db.positions.find(item => item.id === a.positionId);
    if (!position || position.revision !== a.expectedRevision) reject(tools, 'POSITION_STATE_CHANGED', '模拟持仓已变化，请重新确认赎回。', 409);
    if (a.cents > position.principalCents) reject(tools, 'INSUFFICIENT_POSITION', '模拟持仓不足。');
    if (now < position.unlockAt) reject(tools, 'POSITION_LOCKED', '模拟持仓尚未到解锁时间。');
    if (!Number.isSafeInteger(draft.balance + a.cents)) reject(tools, 'INVALID_BUSINESS_AMOUNT', '金额越界，未执行。');
    position.principalCents -= a.cents; position.revision += 1; position.status = position.principalCents ? 'OPEN' : 'CLOSED';
    db.clearingBalance -= a.cents; draft.balance += a.cents;
    draft.ledger.push({ id: tools.id(), taskId: task.id, at: now, debitAccount: 'demo-wealth-clearing', creditAccount: 'demo-owner', cents: a.cents });
    draft.transactions.push({ id: `TX-${task.id}`, date: dayKey(now), merchant: position.productName, category: '理财', cents: a.cents, type: 'investment_redeem', source: '本地虚构理财本金赎回' });
    result = { type: a.type, position: clone(position), text: `已在本地演示账户赎回本金${tools.money(a.cents)}，余额已更新；没有计算投资收益，不代表真实产品实时到账。` };
  } else if (a.type === 'apply_virtual_card') {
    if (draft.cards.length >= 12) reject(tools, 'CARD_LIMIT_REACHED', '模拟卡数量已达上限。', 429);
    while (db.nextVirtualCard <= 9999 && draft.cards.some(card => card.last4 === String(db.nextVirtualCard))) db.nextVirtualCard += 1;
    if (db.nextVirtualCard > 9999) reject(tools, 'CARD_NUMBER_EXHAUSTED', 'DEMO卡片尾号已用完。');
    const last4 = String(db.nextVirtualCard++); const card = { id: `demo-virtual-${tools.id()}`, last4, name: 'DEMO虚拟卡', status: 'ACTIVE', limit: 50000, virtual: true, sandbox: true, demoNumber: `DEMO-VIRTUAL-${last4}` };
    draft.cards.push(card); db.cardControls[card.id] = { online: true, overseas: false, revision: 0 };
    result = { type: a.type, card: clone(card), text: `已创建${card.demoNumber}，模拟消费限额${tools.money(card.limit)}。这不是银行卡PAN，没有真实支付能力。` };
  } else {
    const card = draft.cards.find(item => item.id === a.cardId); const controls = card && cardControl(db, card.id);
    if (!card || card.last4 !== a.cardLast4 || card.status !== a.expectedStatus || controls.revision !== a.expectedControlRevision) reject(tools, 'CARD_STATE_CHANGED', '卡片状态或交易限制已改变，请重新确认。', 409);
    assertCardOperation(card, a.type, tools);
    if (a.type === 'temporary_lock_card') { card.status = 'LOCKED'; result = { type: a.type, card: clone(card), text: `尾号${card.last4}已临时锁定；这不是挂失，也不声称取消现有订阅或代扣。` }; }
    else if (a.type === 'unlock_card') { card.status = 'ACTIVE'; result = { type: a.type, card: clone(card), text: `尾号${card.last4}已解除临时锁定；挂失卡不能通过此操作恢复。` }; }
    else if (a.type === 'card_restriction') {
      if (!['online', 'overseas'].includes(a.channel) || typeof a.enabled !== 'boolean') reject(tools, 'INVALID_CARD_RESTRICTION', '交易限制参数无效。');
      db.cardControls[card.id] = { ...controls, [a.channel]: a.enabled, revision: controls.revision + 1 };
      result = { type: a.type, cardId: card.id, controls: clone(db.cardControls[card.id]), text: `尾号${card.last4}的${a.channel === 'online' ? '线上' : '境外'}新卡交易已${a.enabled ? '允许' : '限制'}（仅模拟规则）；未改变历史交易、会员或代扣授权。` };
    } else if (a.type === 'card_credit_request') {
      integer(a.cents, tools);
      if (db.creditApplications.length >= 100) reject(tools, 'CREDIT_REQUEST_LIMIT', '模拟额度申请记录已达上限。', 429);
      const application = { id: `CREDIT-${tools.id()}`, cardId: card.id, cardLast4: card.last4, requestedLimitCents: a.cents, createdAt: now, status: 'PENDING_REVIEW', sandbox: true };
      db.creditApplications.push(application);
      result = { type: a.type, application: clone(application), text: `独立信用业务意向已记录为待人工审核；当前仍是不可透支的借记账户，没有授信、增加余额或修改消费限额，也没有真人银行审核接入。` };
    }
  }
  checkWealthInvariant(draft, tools);
  db.executions.push({ taskId: task.id, action: clone(a), result: clone(result), completedAt: now });
  tools.audit(draft, 'BUSINESS_EXECUTED', result.text, now, task.id);
  for (const key of ['business', 'balance', 'cards', 'ledger', 'transactions', 'audit']) s[key] = draft[key];
  return result;
}

module.exports = { BUSINESS_TYPES, ensureBusinessState, publicBusinessState, prepareBusiness, executeBusiness };
