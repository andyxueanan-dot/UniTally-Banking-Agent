const { randomBytes, randomInt, createHash } = require('node:crypto');
const { seedSession, monthKey } = require('./seed');
const { validatePlan, DEMOS } = require('./planner');
const { hasPrivateData, safeHistory, normalized } = require('./privacy');
const { resolveRecipient, replaceDemoPhones } = require('./recipient');
const { analyzeLedger, ledgerDetails } = require('./analytics');
const { createPasskey } = require('./passkey');
const workflow = require('./workflow');
const { BUSINESS_TYPES, publicBusinessState, prepareBusiness, executeBusiness } = require('./business');
const { ADVANCED_TYPES, publicAdvancedState, heldCents, prepareAdvanced, executeAdvanced } = require('./advanced-payments');
const { plannerContext } = require('./planner-context');
const { runWasmCalculation } = require('./code-sandbox');
const { validateCardPurchase, prepareCardPurchase, executeCardPurchase } = require('./card-payment');
const id = () => randomBytes(12).toString('hex');
const tokenKey = token => createHash('sha256').update(token).digest('hex');
const money = cents => `¥${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = now => new Date(now + 8 * 3600_000).toISOString().slice(0, 10);

class BankError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
function fail(code, message, status) { throw new BankError(code, message, status); }
function cents(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value)) fail('INVALID_AMOUNT', '金额必须为正数，最多两位小数；不支持科学计数法或负数。');
  const [whole, fraction = ''] = value.split('.');
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(n) || n <= 0 || n > 100000000) fail('INVALID_AMOUNT', '演示金额范围为 0.01～1,000,000 元。');
  return n;
}
function available(s) { return s.balance - heldCents(s) - s.tasks.filter(t => t.status === 'PENDING_REVIEW' && t.action.type === 'transfer').reduce((n, t) => n + t.action.cents, 0); }
function daily(s, now) {
  return s.tasks.filter(t => t.action.type === 'transfer' && ['SUCCEEDED', 'PENDING_REVIEW'].includes(t.status) && t.executionDay === day(now))
    .reduce((n, t) => n + t.action.cents, 0);
}
function level(s, action, now) {
  if (['subscription_query', 'cancel_subscription', 'risk_assessment', 'apply_virtual_card'].includes(action.type)) return 'yellow';
  if (ADVANCED_TYPES.includes(action.type)) return ['schedule_transfer', 'pay_merchant_order'].includes(action.type) ? 'red' : 'yellow';
  return action.type === 'transfer' && daily(s, now) + action.cents <= 100000 ? 'yellow' : 'red';
}
function audit(s, event, detail, now, taskId) {
  s.audit.push({ id: id(), at: now, event, detail, taskId: taskId || null });
}
function finishDraft(t, status, now) {
  t.status = status; t.endedAt = now; delete t.challenge; delete t.passkeyPending;
  const label = { CANCELLED: '用户已取消，未执行', SUPERSEDED: '已被新请求替代，未执行', EXPIRED: '确认已过期，未执行' }[status];
  t.steps = (t.steps || []).map((step, index) => index < 2 ? step : { label: index === 2 ? label : '未执行', state: 'stopped' });
}
function publicTask(t, now) {
  const { challenge, passkeyPending, ...safe } = structuredClone(t);
  if (safe.status === 'AWAITING_CONFIRMATION' && safe.expiresAt <= now) finishDraft(safe, 'EXPIRED', now);
  else if (['CANCELLED', 'SUPERSEDED', 'EXPIRED'].includes(safe.status)) finishDraft(safe, safe.status, safe.endedAt || now);
  return safe;
}
function view(s, now) {
  return { serverNow: now, intentVersion: s.intentVersion || 0, referenceMonth: monthKey(now), balance: s.balance, available: available(s), dailyTransferred: daily(s, now),
    auth: { mode: s.passkeyCredential ? 'passkey' : 'demo_otp', canRegister: !s.passkeyCredential, origin: s.passkeyOrigin || 'http://localhost:5091' },
    contacts: s.contacts.map(({ balance, ...c }) => c), cards: s.cards, transactions: s.transactions,
    tasks: s.tasks.map(t => publicTask(t, now)).reverse(), audit: s.audit.slice(-120).reverse(),
    history: s.history.slice(-40), workflows: s.workflows || [], business: publicBusinessState(s, now), advanced: publicAdvancedState(s, now), lockedUntil: s.lockedUntil, ledger: s.ledger.slice(-50), sandbox: true };
}

class BankService {
  constructor({ store, planner, now = Date.now, maxDailyCalls = 80, limits = {}, passkeySdk, passkeyOrigin = 'http://localhost:5091' }) {
    this.store = store; this.planner = planner; this.now = now; this.maxDailyCalls = maxDailyCalls;
    this.passkey = createPasskey({ sdk: passkeySdk, now, origin: passkeyOrigin });
    this.inFlight = new Set();
    this.limits = { maxSessions: 100, maxTasks: 300, maxCommands: 1000, commandsPerMinute: 20, sessionCreatesPerMinute: 10, maxConcurrentPlans: 4, challengesPerTask: 5, passkeyRegistrations: 5, ...limits };
    for (const [key, value] of Object.entries(this.limits)) if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`Invalid resource limit: ${key}`);
  }
  session(state, token) {
    if (typeof token !== 'string' || token.length !== 64) fail('SESSION_REQUIRED', '演示会话已失效，请创建新的演示账户。', 401);
    const s = state.sessions[tokenKey(token)];
    if (!s) fail('SESSION_REQUIRED', '找不到这个演示会话，请创建新的演示账户。', 401);
    s.passkeyOrigin = this.passkey.origin;
    return s;
  }
  create() {
    const token = randomBytes(32).toString('hex'); const now = this.now();
    const state = this.store.transact(db => {
      if (Object.keys(db.sessions).length >= this.limits.maxSessions) fail('SESSION_LIMIT', '本机演示会话数量已达上限；请继续使用已有会话，历史记录不会被自动删除。', 429);
      const recent = (db.sessionCreates || []).filter(at => at > now - 60000);
      if (recent.length >= this.limits.sessionCreatesPerMinute) fail('SESSION_RATE_LIMIT', '创建演示账户过于频繁，请一分钟后重试。', 429);
      db.sessionCreates = [...recent, now];
      const s = seedSession(now); s.intentVersion = 0; s.commandCount = 0; s.recentCommands = []; s.passkeyOrigin = this.passkey.origin;
      audit(s, 'SESSION_CREATED', '创建独立虚构账户；没有接入真实银行。', now); db.sessions[tokenKey(token)] = s; return view(s, now);
    });
    return { token, state };
  }
  get(token) { return view(this.session(this.store.read(), token), this.now()); }
  async compute(token, request) {
    this.store.transact(db => {
      const s = this.session(db, token); const now = this.now();
      const recent = (s.recentCalculations || []).filter(at => at > now - 60000);
      if (recent.length >= 8 || (s.calculationCount || 0) >= 100) fail('CALCULATION_LIMIT', '受限计算达到本会话配额（每分钟8次、累计100次）；账务业务不受影响。', 429);
      s.recentCalculations = [...recent, now]; s.calculationCount = (s.calculationCount || 0) + 1; return null;
    });
    const calculation = await runWasmCalculation(request);
    return this.store.transact(db => {
      const s = this.session(db, token); const now = this.now();
      audit(s, 'UNTRUSTED_CODE_CALCULATION', `隔离计算${calculation.ok ? '返回结果' : '拒绝/中止'}；代码SHA256=${calculation.metrics.codeHash || '无'}；${calculation.ok ? `结果=${calculation.result}` : calculation.error.code}；禁止直接用于账务或权限。`, now);
      return { calculation, state: view(s, now) };
    });
  }
  metadata() { return { serverNow: this.now(), aiConfigured: this.planner.configured, model: this.planner.model, provider: 'DeepSeek', sandbox: true, maxDailyCalls: this.maxDailyCalls, limits: this.limits,
    auth: { mode: 'session_required', canRegister: false, origin: this.passkey.origin },
    aiCallsToday: this.store.read().usage[day(this.now())] || 0 }; }
  prepareManual(token, action) {
    const simulatedPayment = action?.type === 'simulate_aa_payment';
    if (simulatedPayment && (action.simulation !== true || typeof action.requestId !== 'string' || typeof action.participantId !== 'string' ||
        action.requestId.length > 80 || action.participantId.length > 80 || Object.keys(action).some(k => !['type', 'requestId', 'participantId', 'simulation'].includes(k)))) fail('INVALID_MANUAL_ACTION', '模拟到账必须通过明确标注的专用操作，参数无效。');
    try { if (action?.type === 'card_purchase') validateCardPurchase(action); else if (!simulatedPayment) validatePlan({ actions: [action], question: '' }); }
    catch { fail('INVALID_MANUAL_ACTION', '业务面板参数无效，未创建任务。'); }
    // Opaque local IDs can contain long decimal runs; do not mistake them for
    // personal account numbers or send them to a model in manual-form history.
    const safeDescription = Object.fromEntries(Object.entries(action).map(([key, value]) => [key, key.endsWith('Id') ? '[本地业务引用]' : value]));
    const snapshot = this.session(this.store.read(), token);
    const display = replaceDemoPhones(JSON.stringify(safeDescription), snapshot.contacts).text;
    if (hasPrivateData(display)) fail('PRIVATE_DATA_BLOCKED', '业务面板也只接受虚构信息，不接收真实号码或密钥。');
    return this.chat(token, { text: `业务面板提交：${display}` }, action);
  }
  async chat(token, { text, demo, simulateTimeout = false }, manualAction = null) {
    const snapshot = this.session(this.store.read(), token);
    if (typeof text !== 'string' || !text.trim() || text.length > 1000) fail('INVALID_MESSAGE', '请输入 1～1000 字的业务需求。');
    text = replaceDemoPhones(text, snapshot.contacts).text;
    if (demo !== undefined && !Object.hasOwn(DEMOS, demo)) fail('INVALID_DEMO', '没有这个离线演示。');
    // Secrets and plausible real account data are not sent to the provider.
    if (hasPrivateData(text)) fail('PRIVATE_DATA_BLOCKED', '请勿输入 API 密钥、手机号或银行卡号。这个原型只接受虚构姓名、金额和卡片尾号。');
    if (this.inFlight.has(token)) fail('BUSY', '上一条需求还在处理中，请稍等。', 409);
    if (this.inFlight.size >= this.limits.maxConcurrentPlans) fail('PLANNING_LIMIT', '本机正在处理其他演示请求，请稍后再试。', 429);
    const admitted = this.store.transact(db => {
      const s = this.session(db, token); const now = this.now();
      const recent = (s.recentCommands || []).filter(at => at > now - 60000);
      if (recent.length >= this.limits.commandsPerMinute) fail('RATE_LIMIT', '一分钟内请求已达上限（含离线演示），请稍后再试。', 429);
      if ((s.commandCount || 0) >= this.limits.maxCommands) fail('COMMAND_LIMIT', '本会话已达到演示命令配额；已有任务仍可确认、取消和对账，历史记录会保留。', 429);
      s.commandCount = (s.commandCount || 0) + 1; s.recentCommands = [...recent, now]; s.intentVersion = (s.intentVersion || 0) + 1;
      const superseded = [];
      for (const old of s.tasks) if (old.status === 'AWAITING_CONFIRMATION') {
        const status = old.expiresAt <= now ? 'EXPIRED' : 'SUPERSEDED';
        finishDraft(old, status, now); if (status === 'SUPERSEDED') superseded.push(old.id);
        audit(s, `TASK_${status}`, '新请求已接纳；旧未确认草案立即失效，不沿用历史授权。', now, old.id);
      }
      for (const flow of s.workflows || []) if (['READY', 'AWAITING_CONFIRMATION', 'WAITING_SETTLEMENT'].includes(flow.status)) {
        workflow.pauseWorkflow(flow, now, { reason: '用户提出新需求，原工作流保留进度但暂停；恢复后重新确认敏感步骤。' });
      }
      audit(s, 'INTENT_ACCEPTED', `意图版本 ${s.intentVersion}；开始规划前已使旧草案失效。`, now);
      return { version: s.intentVersion, superseded };
    });
    this.inFlight.add(token);
    try {
      let plan;
      if (manualAction) plan = { actions: [structuredClone(manualAction)], question: '', meta: { mode: 'manual', provider: '用户填写业务面板（未调用 AI）', latencyMs: 0, totalTokens: 0 } };
      else if (demo) plan = { ...structuredClone(DEMOS[demo]), meta: { mode: 'offline', provider: '固定案例（非 AI）', latencyMs: 0, totalTokens: 0 } };
      else {
        if (!this.planner.configured) fail('AI_NOT_CONFIGURED', 'DeepSeek 尚未配置；可切换离线演示。', 503);
        this.store.transact(db => { const key = day(this.now()); if ((db.usage[key] || 0) >= this.maxDailyCalls) fail('AI_BUDGET_LIMIT', '今日 AI 调用已达到本机限额，可继续使用离线演示。', 429); db.usage[key] = (db.usage[key] || 0) + 1; return null; });
        plan = await this.planner.plan(text, safeHistory(snapshot.history), plannerContext(snapshot, this.now()));
      }
      if (!['simulate_aa_payment', 'card_purchase'].includes(manualAction?.type)) validatePlan(plan);
      if (plan.actions.some(a => a.type === 'transfer' && !a.reserveAmount) && /保留|留够|留出|预留|至少.{0,8}(?:剩|留)|(?:剩|留).{0,8}至少|keep.{0,20}(?:balance|remaining)|reserve/i.test(normalized(text))) {
        plan.actions = []; plan.question = '你提出了转账后的保留余额条件，但尚未明确提取出最低保留金额。请明确人民币转账金额与转账后至少保留多少元；不会忽略这个条件。';
      }
      if (plan.actions.some(a => a.type === 'transfer') && /美元|美金|马币|林吉特|欧元|港币|日元|\b(?:USD|MYR|EUR|HKD|JPY|RM)\b|\$/i.test(text)) {
        plan.actions = []; plan.question = '当前银行原型仅支持人民币转账，不支持外币或汇率换算。请明确人民币金额。';
      }
      if (plan.actions.some(a => !['balance', 'analyze', 'transactions', 'cards', 'wealth_catalog', 'wealth_positions', 'schedule_transfer', 'cancel_schedule', 'due_schedule', 'reserve_budget', 'prepare_merchant_order', 'merchant_catalog'].includes(a.type)) && /明天|后天|下周|下个月|每周|每月|定时|预约/.test(text)) {
        plan.actions = []; plan.question = '当前计划里含有不能自动延时的动作；预约只能创建明确时间的定时提醒，到期还需重新确认，不会将未来要求改成立即操作。';
      }
      if (plan.actions.length > 1 && plan.actions.some(a => a.type === 'cancel_task')) {
        plan.actions = [];
        plan.question = '为避免混淆取消与新增授权，请先单独取消原任务，再提出新操作。';
      }
      return this.store.transact(db => {
        const s = this.session(db, token); const now = this.now();
        if (s.intentVersion !== admitted.version) fail('INTENT_CHANGED', '需求已变化，本次旧规划不会生成操作。', 409);
        s.history.push({ role: 'user', text, at: now, id: id() });
        audit(s, 'INTENT_PARSED', `${plan.meta.mode === 'ai' ? 'DeepSeek 工具规划' : plan.meta.mode === 'manual' ? '用户填写业务面板（无模型）' : '离线固定案例'}：${plan.actions.map(a => a.type).join(' → ') || '澄清/不支持'}；仅提出草案，没有执行写操作。`, now);
        let results = [];
        if (plan.actions.length > 1) {
          if ((s.workflows || []).length >= 40) fail('WORKFLOW_LIMIT', '本会话工作流已达40个；历史记录保留，请继续已有工作流。', 429);
          const flow = workflow.createWorkflow({ goal: text, actions: plan.actions }, now);
          (s.workflows ||= []).push(flow);
          audit(s, 'WORKFLOW_CREATED', `创建 ${flow.nodes.length} 节点依赖图 ${flow.id}；敏感节点逐项确认。`, now);
          results = this.progressWorkflow(s, flow, now, simulateTimeout === true);
        } else for (const action of plan.actions) {
          try { results.push(this.prepare(s, action, now, simulateTimeout === true, admitted)); }
          catch (e) { if (!(e instanceof BankError)) throw e; results.push({ type: 'blocked', code: e.code, text: e.message }); audit(s, 'POLICY_BLOCKED', `${e.code}：${e.message}`, now); break; }
        }
        const answer = results.length ? results.map(r => r.text).join('\n\n') : `需要补充信息 / 暂不支持：${plan.question || '请说明要查询或操作的业务。'}\n（此条模型说明未触发任何业务工具。）`;
        const message = { role: 'assistant', text: answer, at: now, id: id(), results, meta: plan.meta };
        s.history.push(message); s.history = s.history.slice(-40);
        return { message, state: view(s, now) };
      });
    } finally { this.inFlight.delete(token); }
  }
  progressWorkflow(s, flow, now, simulateTimeout = false) {
    const results = [];
    for (let step = 0; step < 12; step++) {
      const node = workflow.readyNodes(flow)[0]; if (!node) break;
      try {
        const result = this.prepare(s, node.action, now, simulateTimeout);
        if (result.type === 'proposal') {
          const task = this.task(s, result.taskId); task.workflowId = flow.id; task.nodeId = node.id;
          workflow.bindTask(flow, node.id, task, now); results.push(result); break;
        }
        if (['clarify', 'blocked'].includes(result.type)) { workflow.failNode(flow, node.id, result.text, now); results.push(result); break; }
        workflow.recordRead(flow, node.id, result, now); results.push(result);
      } catch (e) {
        if (!(e instanceof BankError)) throw e;
        workflow.failNode(flow, node.id, e.message, now); audit(s, 'WORKFLOW_NODE_FAILED', `${node.id}: ${e.message}`, now);
        results.push({ type: 'blocked', code: e.code, text: e.message }); break;
      }
    }
    results.push({ type: 'workflow', workflowId: flow.id, text: `多步骤任务：${flow.nodes.filter(n => n.status === 'SUCCEEDED').length}/${flow.nodes.length} 步已完成。${flow.status === 'SUCCEEDED' ? '全部节点已有执行证据。' : '依赖未完成的步骤不会执行；敏感节点分别确认，可随时暂停或生成接管记录。'}` });
    return results;
  }
  workflowControl(token, flowId, action) {
    if (this.inFlight.has(token)) fail('PLANNING_IN_PROGRESS', '新需求正在规划，请稍后管理工作流。', 409);
    return this.store.transact(db => {
      const s = this.session(db, token); const now = this.now(); const flow = (s.workflows || []).find(f => f.id === flowId);
      if (!flow) fail('WORKFLOW_NOT_FOUND', '当前会话没有这项工作流。', 404);
      for (const node of flow.nodes.filter(n => n.status === 'WAITING_CONFIRMATION')) {
        const pending = s.tasks.find(t => t.id === node.taskId);
        if (pending?.status === 'AWAITING_CONFIRMATION' && pending.expiresAt <= now) {
          finishDraft(pending, 'EXPIRED', now); workflow.settleTask(flow, pending, now);
          audit(s, 'WORKFLOW_APPROVAL_EXPIRED', '上次草案已过期；重新准备必须生成新任务和新授权。', now, pending.id);
        }
      }
      if (['pause', 'handoff', 'cancel'].includes(action)) {
        if (action === 'cancel') workflow.cancelWorkflow(flow, now);
        else workflow.pauseWorkflow(flow, now, { handoff: action === 'handoff' });
        for (const task of s.tasks.filter(t => t.workflowId === flowId && t.status === 'AWAITING_CONFIRMATION')) finishDraft(task, action === 'cancel' ? 'CANCELLED' : 'SUPERSEDED', now);
      } else if (action === 'resume') workflow.resumeWorkflow(flow, now);
      else if (action !== 'advance') fail('INVALID_WORKFLOW_CONTROL', '未知工作流操作。');
      let results = [];
      if (['resume', 'advance'].includes(action)) {
        // Multiple flow tabs cannot leave competing unconfirmed authorizations active.
        if (s.tasks.some(t => t.workflowId !== flow.id && t.status === 'AWAITING_CONFIRMATION')) fail('OTHER_TASK_PENDING', '请先处理其他待确认任务，再恢复这个工作流。', 409);
        results = this.progressWorkflow(s, flow, now);
      }
      audit(s, 'WORKFLOW_CONTROL', `${flowId}：${action} → ${flow.status}`, now);
      return { workflow: structuredClone(flow), results, state: view(s, now) };
    });
  }
  settleWorkflow(s, task, now) {
    if (!task.workflowId) return;
    const flow = (s.workflows || []).find(f => f.id === task.workflowId);
    if (flow) workflow.settleTask(flow, task, now);
  }
  prepare(s, a, now, simulateTimeout, admitted = {}) {
    const businessTools = { cents, money, available, fail, id, audit };
    if (['due_schedule', 'merchant_catalog'].includes(a.type)) {
      const read = prepareAdvanced(s, a, now, businessTools).returnResult;
      audit(s, 'READ_ADVANCED', `${a.type}：查询本地模拟计划或固定虚构报价。`, now); return read;
    }
    if (['wealth_catalog', 'wealth_positions'].includes(a.type)) {
      const read = prepareBusiness(s, a, now, businessTools).returnResult;
      audit(s, 'READ_WEALTH', `${a.type}：仅虚构产品或实际模拟持仓，不编收益。`, now);
      return read;
    }
    if (a.type === 'cancel_task') {
      const target = [...s.tasks].reverse().find(t => admitted.superseded?.includes(t.id) && t.status === 'SUPERSEDED');
      if (!target) return { type: 'clarify', text: '当前没有可取消的未执行草案；已完成或待对账交易不能当作未执行任务撤回。' };
      const flow = target.workflowId && (s.workflows || []).find(item => item.id === target.workflowId);
      if (flow) {
        try { workflow.cancelWorkflow(flow, now); }
        catch (error) { fail(error.code || 'WORKFLOW_CANCEL_BLOCKED', error.message, error.status || 409); }
        audit(s, 'WORKFLOW_CANCELLED', '自然语言取消了工作流尚未执行节点，已完成业务保留；不可恢复已取消的授权。', now, target.id);
      }
      finishDraft(target, 'CANCELLED', now); audit(s, 'USER_CANCELLED', '用户通过自然语言取消当前未执行草案，没有资金变动。', now, target.id);
      return { type: 'cancelled', taskId: target.id, text: flow ? '已取消这项草案及工作流尚未执行的节点；之前完成的业务与回执保留，不能假装撤回。' : '已取消这项未执行草案，没有发生资金变动。' };
    }
    if (a.type === 'balance') {
      audit(s, 'READ_BALANCE', `余额 ${money(s.balance)}；可用 ${money(available(s))}`, now);
      return { type: 'balance', text: `演示账户余额 ${money(s.balance)}，可用余额 ${money(available(s))}。今日已执行或预留转账 ${money(daily(s, now))}。`, risk: 'green' };
    }
    if (['analyze', 'transactions'].includes(a.type)) {
      let result;
      try { result = (a.type === 'analyze' ? analyzeLedger : ledgerDetails)(s.transactions, { ...a, merchant: a.merchant ?? undefined, category: a.category ?? undefined }, now); }
      catch (error) { if (['INVALID_PERIOD', 'INVALID_CATEGORY', 'INVALID_MERCHANT'].includes(error.code)) fail(error.code, error.message); throw error; }
      audit(s, 'READ_TRANSACTIONS', `${a.type === 'analyze' ? '确定性账单分析' : '账单明细查询'}：${result.period}；来源记录 ${result.sourceRowIds.join('、') || '无'}。`, now);
      return result;
    }
    if (a.type === 'cards') {
      audit(s, 'READ_CARDS', '查询当前会话的两张模拟卡片。', now);
      return { type: 'cards', risk: 'green', text: s.cards.map(c => `${c.name} · 尾号 ${c.last4}：${({ ACTIVE: '正常', LOCKED: '临时锁定', FROZEN: '已挂失冻结' })[c.status] || c.status}，单日消费限额 ${money(c.limit)}`).join('\n') };
    }
    if (s.lockedUntil > now) fail('SAFETY_LOCKED', '敏感操作暂时锁定；查询仍可用。请等安全锁定期结束。', 423);
    if (s.tasks.length >= this.limits.maxTasks) fail('TASK_LIMIT', '本会话已达到任务配额；已有任务仍可确认、取消和对账，不会删除回执或幂等记录。', 429);
    if (a.type === 'cancel_subscription' && !a.scope) return { type: 'clarify', text: '你希望撤销银行代扣授权，还是终止商户会员？两者不同，请明确选择后再确认。' };
    let action; let title;
    if (a.type === 'card_purchase') {
      ({ action, title } = prepareCardPurchase(s, a, now, businessTools));
    } else if (ADVANCED_TYPES.includes(a.type)) {
      ({ action, title } = prepareAdvanced(s, a, now, businessTools));
    } else if (BUSINESS_TYPES.includes(a.type)) {
      ({ action, title } = prepareBusiness(s, a, now, businessTools));
    } else if (a.type === 'transfer') {
      if (!a.recipient || !a.amount) return { type: 'clarify', text: `还不能创建转账：请补充${!a.recipient ? '收款人' : ''}${!a.recipient && !a.amount ? '和' : ''}${!a.amount ? '金额' : ''}。例如「给王明转 200 元」。` };
      const { matches, conflict } = resolveRecipient(a.recipient, s.contacts);
      if (conflict) return { type: 'clarify', text: '收款人姓名与账户尾号存在矛盾或无法确认，不能选择其中一个继续。请核对收款人及四位尾号。' };
      if (matches.length !== 1) return { type: 'clarify', text: matches.length > 1 ? `找到两个${matches[0].name}，账户尾号分别为 ${matches.map(c => c.last4).join('、')}。请告诉我收款账户尾号和金额，不能猜测收款人。` : '未找到收款人。演示联系人为王明、李悦以及两位陈晨；请用姓名或尾号明确指定。' };
      action = { type: a.type, recipientId: matches[0].id, recipientName: matches[0].name, recipientLast4: matches[0].last4, cents: cents(a.amount), ...(a.reserveAmount ? { reserveCents: cents(a.reserveAmount) } : {}) };
      if (a.scheduleId) {
        const schedule = s.advanced?.schedules.find(item => item.id === a.scheduleId);
        if (!schedule || schedule.status !== 'SCHEDULED' || schedule.executeAt > now) fail('SCHEDULE_NOT_DUE', '计划尚未到期、已取消或已完成；不能再次发起关联转账。', 409);
        if (schedule.recipientId !== action.recipientId || schedule.cents !== action.cents) fail('SCHEDULE_DETAILS_CHANGED', '转账人与金额必须与定时计划一致；修改计划请取消旧计划重新创建。', 409);
        if (s.tasks.some(t => t.action.scheduleId === schedule.id && ['PENDING_REVIEW', 'SUCCEEDED'].includes(t.status))) fail('SCHEDULE_ALREADY_SUBMITTED', '该计划已有待对账或完成交易，不能重复发起。', 409);
        action.scheduleId = schedule.id; action.scheduleRevision = schedule.revision;
      }
      if (action.cents > available(s)) fail('INSUFFICIENT_FUNDS', `可用余额仅 ${money(available(s))}，无法转出 ${money(action.cents)}。`);
      this.checkReserve(s, action);
      title = `向${action.recipientName}（${action.recipientLast4}）转账 ${money(action.cents)}${action.reserveCents ? `；转账后至少保留 ${money(action.reserveCents)}` : ''}`;
    } else if (['freeze_card', 'unfreeze_card', 'card_limit'].includes(a.type)) {
      const card = s.cards.find(c => c.last4 === a.cardLast4);
      if (!card) return { type: 'clarify', text: '请指定卡片尾号：日常消费卡 8806，线上购物卡 6219。不能根据模糊描述替你选择卡片。' };
      if (a.type === 'freeze_card' && card.status === 'FROZEN') fail('CARD_ALREADY_FROZEN', '该卡已经挂失冻结，无需重复操作。');
      if (a.type === 'unfreeze_card' && card.status !== 'FROZEN') fail('CARD_ALREADY_ACTIVE', '该卡不是挂失状态；临时锁定请使用解除临时锁定。');
      if (a.type === 'card_limit' && !a.limit) return { type: 'clarify', text: '请提供新的每日消费限额，例如「把 8806 卡的消费限额设为 500 元」。' };
      action = { type: a.type, cardId: card.id, cardLast4: card.last4, expectedStatus: card.status, ...(a.type === 'card_limit' ? { cents: cents(a.limit) } : {}) };
      title = `${a.type === 'freeze_card' ? '挂失冻结' : a.type === 'unfreeze_card' ? '解挂恢复' : '调整消费限额'} · ${card.name} ${card.last4}${action.cents ? ` → ${money(action.cents)}` : ''}`;
    } else fail('UNSUPPORTED_ACTION', '该操作不在白名单中。');
    const task = { id: id(), title, action, intentVersion: s.intentVersion || 0, status: 'AWAITING_CONFIRMATION', risk: level(s, action, now), createdAt: now, expiresAt: now + 10 * 60_000,
      fault: simulateTimeout && action.type === 'transfer' ? 'timeout' : null,
      steps: [{ label: '理解需求', state: 'done' }, { label: '校验账户与权限', state: 'done' }, { label: '等待用户确认', state: 'current' }, { label: '执行并核对回执', state: 'waiting' }] };
    s.tasks.push(task); audit(s, 'TASK_PROPOSED', `${title}；${task.risk === 'red' ? '红色强验证' : '黄色确认'}；尚未执行。`, now, task.id);
    if (action.scheduleId) s.advanced.schedules.find(item => item.id === action.scheduleId).activeTaskId = task.id;
    return { type: 'proposal', taskId: task.id, text: `已准备：${title}。${task.risk === 'red' ? s.passkeyCredential ? '需要确认详情并使用已注册 Passkey 验证设备' : '需要确认详情并完成演示身份验证' : '需要你确认详情'}，目前没有执行。${task.fault ? '本次将演示接口超时与后续对账。' : ''}` };
  }
  task(s, taskId) { const t = s.tasks.find(t => t.id === taskId); if (!t) fail('TASK_NOT_FOUND', '当前会话中没有这项任务。', 404); return t; }
  check(s, t, now) {
    if (s.lockedUntil > now) fail('SAFETY_LOCKED', '敏感操作已锁定，请稍后再试。', 423);
    if (t.status !== 'AWAITING_CONFIRMATION') fail('TASK_NOT_ACTIONABLE', '这项任务已结束、取消或被新操作取代。', 409);
    if (t.expiresAt <= now) fail('TASK_EXPIRED', '确认已过期，请重新提出操作。', 409);
    if ((t.intentVersion || 0) !== (s.intentVersion || 0)) fail('INTENT_CHANGED', '需求已变化，旧任务不能继续确认。', 409);
  }
  challenge(token, taskId) {
    if (this.inFlight.has(token)) fail('PLANNING_IN_PROGRESS', '新需求正在规划中，不能继续验证旧草案。', 409);
    const now = this.now();
    return this.store.transact(db => {
      const s = this.session(db, token); const t = this.task(s, taskId); this.check(s, t, now);
      t.risk = level(s, t.action, now);
      if (t.risk !== 'red') fail('CHALLENGE_NOT_NEEDED', '该操作只需要普通确认。');
      if (s.passkeyCredential) fail('PASSKEY_REQUIRED', '此演示账户已启用 Passkey，不能降级使用网页演示验证码。', 403);
      if ((t.challengeCount || 0) >= this.limits.challengesPerTask) fail('CHALLENGE_LIMIT', '这项任务获取验证码次数已达上限，请重新提出需求。', 429);
      t.challengeCount = (t.challengeCount || 0) + 1;
      const code = String(randomInt(100000, 1000000));
      t.challenge = { hash: tokenKey(`${t.id}:${code}`), expiresAt: now + 120000 };
      audit(s, 'DEMO_CHALLENGE_ISSUED', '签发任务绑定的模拟验证码（非短信，非真实多因素认证）；有效期 2 分钟。', now, t.id);
      return { demoCode: code, expiresAt: t.challenge.expiresAt, warning: '这是页面内演示验证码，不是真实短信或多因素认证。' };
    });
  }
  confirm(token, taskId, { confirmed, code } = {}) {
    return this.store.transact(db => {
      const s = this.session(db, token); const t = this.task(s, taskId);
      if (this.inFlight.has(token) && !['SUCCEEDED', 'PENDING_REVIEW'].includes(t.status)) fail('PLANNING_IN_PROGRESS', '新需求正在规划中，不能确认旧草案。', 409);
      return this.#confirmCore(s, t, this.now(), { confirmed, code });
    });
  }
  #verificationFailure(s, t, now, errorCode = 'INVALID_CODE') {
    s.authFailures = (s.authFailures || 0) + 1;
    if (s.authFailures >= 3) {
      s.lockedUntil = now + 300000; s.authFailures = 0;
      if (t) { delete t.challenge; delete t.passkeyPending; }
    }
    const locked = s.lockedUntil > now;
    audit(s, 'VERIFICATION_REJECTED', locked ? '连续三次验证失败，敏感操作锁定 5 分钟。' : '设备验证失败，操作未执行。', now, t?.id);
    return { error: { code: locked ? 'SAFETY_LOCKED' : errorCode, message: locked ? '连续三次验证失败，敏感操作锁定 5 分钟。' : '身份验证失败，未执行操作；请重新获取本次任务的验证。', status: 403 }, state: view(s, now) };
  }
  #confirmCore(s, t, now, { confirmed, code }, authentication = 'demo_otp') {
    if (['SUCCEEDED', 'PENDING_REVIEW'].includes(t.status)) return { task: publicTask(t, now), state: view(s, now), idempotent: true };
    this.check(s, t, now);
    if (confirmed !== true) fail('CONFIRMATION_REQUIRED', '必须明确确认这项操作。');
    t.risk = level(s, t.action, now);
    if (t.risk === 'red') {
      if (s.passkeyCredential) {
        if (authentication !== 'passkey') return { error: { code: 'PASSKEY_REQUIRED', message: '此会话的红色操作必须使用已注册 Passkey，不能使用演示验证码或客户端认证标记。', status: 403 }, state: view(s, now) };
      } else {
        if (!t.challenge || t.challenge.expiresAt <= now || typeof code !== 'string') return { error: { code: 'VERIFICATION_REQUIRED', message: '请获取并输入本次任务的演示验证码。', status: 403 }, state: view(s, now) };
        if (t.challenge.hash !== tokenKey(`${t.id}:${code}`)) return this.#verificationFailure(s, t, now);
      }
    }
    if (t.action.type === 'transfer' && t.action.cents > available(s)) fail('INSUFFICIENT_FUNDS', '可用余额已变化，请重新发起任务。');
    if (t.action.type === 'transfer') this.checkReserve(s, t.action);
    if (t.risk === 'red') s.authFailures = 0;
    delete t.challenge; delete t.passkeyPending;
    t.verificationMethod = t.risk === 'red' ? authentication : 'explicit_confirmation';
    audit(s, 'USER_CONFIRMED', `用户确认不可变任务 ${t.id}；权限 ${t.risk}；${authentication === 'passkey' ? '已核验绑定此任务的 WebAuthn 公钥签名；仍为虚构账户' : '演示身份机制/普通明确确认'}。`, now, t.id);
    t.executionDay = day(now);
    if (t.fault === 'timeout') {
      t.status = 'PENDING_REVIEW'; t.steps[2].state = 'done'; t.steps[3] = { label: '接口超时，等待模拟后台对账', state: 'current' };
      audit(s, 'TRANSFER_PENDING', '模拟网络超时；预留资金，不显示成功回执、不重复发起。', now, t.id);
    } else this.execute(s, t, now);
    this.settleWorkflow(s, t, now);
    return { task: publicTask(t, now), state: view(s, now) };
  }
  #binding(token, t) {
    return { sessionId: tokenKey(token), taskId: t.id, intentVersion: t.intentVersion || 0, action: t.action, expiresAt: t.expiresAt };
  }
  async passkeyRegistrationOptions(token) {
    const issued = this.store.transact(db => {
      const s = this.session(db, token);
      if (s.passkeyCredential) fail('PASSKEY_ALREADY_REGISTERED', '此演示会话已经注册 Passkey，不能直接替换。', 409);
      if (s.lockedUntil > this.now()) fail('SAFETY_LOCKED', '敏感操作已锁定，请稍后再注册。', 423);
      if ((s.passkeyRegistrationCount || 0) >= this.limits.passkeyRegistrations) fail('PASSKEY_REGISTRATION_LIMIT', '此演示会话的设备注册尝试已达到上限。', 429);
      s.passkeyRegistrationCount = (s.passkeyRegistrationCount || 0) + 1;
      s.passkeyRegistrationVersion = (s.passkeyRegistrationVersion || 0) + 1;
      s.passkeyUserID ||= this.passkey.createUserID(); delete s.passkeyRegistrationPending;
      return { version: s.passkeyRegistrationVersion, userID: s.passkeyUserID };
    });
    const result = await this.passkey.registrationOptions({ userID: issued.userID });
    return this.store.transact(db => {
      const s = this.session(db, token);
      if (s.passkeyCredential || s.passkeyRegistrationVersion !== issued.version || s.passkeyUserID !== issued.userID) fail('PASSKEY_REQUEST_CHANGED', '设备注册请求已变化，请重新开始。', 409);
      if (s.lockedUntil > this.now()) fail('SAFETY_LOCKED', '敏感操作已锁定，本次注册选项失效。', 423);
      s.passkeyRegistrationPending = result.pending;
      audit(s, 'PASSKEY_REGISTRATION_STARTED', '开始注册虚构会话设备公钥；尚未完成注册，不是银行实名核验。', this.now());
      return { options: result.options, expiresAt: result.pending.expiresAt, state: view(s, this.now()) };
    });
  }
  async passkeyRegistrationVerify(token, { response } = {}) {
    const snapshot = this.session(this.store.read(), token);
    if (snapshot.passkeyCredential) fail('PASSKEY_ALREADY_REGISTERED', '此演示会话已注册设备，不能直接替换。', 409);
    if (snapshot.lockedUntil > this.now()) fail('SAFETY_LOCKED', '敏感操作已锁定，请稍后再试。', 423);
    const pending = snapshot.passkeyRegistrationPending;
    if (!pending) fail('PASSKEY_CHALLENGE_REQUIRED', '请先获取设备注册选项。', 403);
    let credential;
    try { credential = await this.passkey.verifyRegistration({ pending, response }); }
    catch (error) {
      return this.store.transact(db => {
        const s = this.session(db, token);
        if (s.passkeyRegistrationPending?.id !== pending.id || s.passkeyCredential) fail('PASSKEY_REQUEST_CHANGED', '设备注册请求已变化。', 409);
        delete s.passkeyRegistrationPending;
        if (error.code === 'PASSKEY_CHALLENGE_EXPIRED') return { error: { code: error.code, message: '设备注册已超时，请重新获取选项；没有注册设备。', status: 403 }, state: view(s, this.now()) };
        return this.#verificationFailure(s, null, this.now(), error.code || 'PASSKEY_VERIFICATION_FAILED');
      });
    }
    return this.store.transact(db => {
      const s = this.session(db, token); const now = this.now();
      if (s.passkeyCredential || s.passkeyRegistrationPending?.id !== pending.id || s.passkeyUserID !== credential.userID || s.passkeyRegistrationVersion !== snapshot.passkeyRegistrationVersion) fail('PASSKEY_REQUEST_CHANGED', '设备注册请求已改变或已消费。', 409);
      if (pending.expiresAt <= now) fail('PASSKEY_CHALLENGE_EXPIRED', '设备注册挑战已过期。', 403);
      if (s.lockedUntil > now) fail('SAFETY_LOCKED', '敏感操作已锁定，未注册设备。', 423);
      if (Object.values(db.sessions).some(other => other.passkeyCredential?.id === credential.id)) fail('PASSKEY_CREDENTIAL_IN_USE', '此设备凭据已归属其他演示会话。', 409);
      s.passkeyCredential = credential; delete s.passkeyRegistrationPending;
      for (const task of s.tasks) delete task.challenge;
      audit(s, 'PASSKEY_REGISTERED', '已保存设备公钥；后续红色操作必须使用 Passkey，不再允许演示验证码降级。设备身份仍未做银行实名核验。', now);
      return { registered: true, state: view(s, now) };
    });
  }
  async passkeyOptions(token, taskId) {
    if (this.inFlight.has(token)) fail('PLANNING_IN_PROGRESS', '新需求正在规划，请稍后验证。', 409);
    const issued = this.store.transact(db => {
      const s = this.session(db, token); const t = this.task(s, taskId); this.check(s, t, this.now());
      if (!s.passkeyCredential) fail('PASSKEY_NOT_REGISTERED', '此演示会话尚未注册 Passkey。', 409);
      if (level(s, t.action, this.now()) !== 'red') fail('CHALLENGE_NOT_NEEDED', '黄色业务只需要明确确认。');
      if ((t.challengeCount || 0) >= this.limits.challengesPerTask) fail('CHALLENGE_LIMIT', '此任务获取验证次数已达上限，请重新提出需求。', 429);
      t.challengeCount = (t.challengeCount || 0) + 1; t.passkeyVersion = (t.passkeyVersion || 0) + 1; delete t.passkeyPending;
      return { version: t.passkeyVersion, credential: s.passkeyCredential, binding: this.#binding(token, t) };
    });
    const result = await this.passkey.authenticationOptions({ binding: issued.binding, credentials: [issued.credential] });
    return this.store.transact(db => {
      const s = this.session(db, token); const t = this.task(s, taskId); const now = this.now();
      if (this.inFlight.has(token)) fail('PLANNING_IN_PROGRESS', '新需求正在规划，本次验证选项失效。', 409);
      this.check(s, t, now);
      if (t.passkeyVersion !== issued.version || this.passkey.bindingHash(this.#binding(token, t)) !== result.pending.bindingHash ||
          s.passkeyCredential?.id !== issued.credential.id || s.passkeyCredential.publicKey !== issued.credential.publicKey) fail('PASSKEY_REQUEST_CHANGED', '任务或设备注册已经变化，本次选项失效。', 409);
      if (result.pending.expiresAt <= now) fail('PASSKEY_CHALLENGE_EXPIRED', '验证选项生成期间已过期，请重新发起。', 403);
      t.passkeyPending = result.pending;
      audit(s, 'PASSKEY_CHALLENGE_ISSUED', '签发绑定当前会话、任务、版本与金额条件的设备验证挑战；尚未执行。', now, t.id);
      return { options: result.options, expiresAt: result.pending.expiresAt, task: publicTask(t, now), state: view(s, now) };
    });
  }
  async passkeyConfirm(token, taskId, { response, confirmed } = {}) {
    const snapshot = this.session(this.store.read(), token); const prior = this.task(snapshot, taskId);
    if (['SUCCEEDED', 'PENDING_REVIEW'].includes(prior.status)) return { task: publicTask(prior, this.now()), state: view(snapshot, this.now()), idempotent: true };
    if (this.inFlight.has(token)) fail('PLANNING_IN_PROGRESS', '新需求正在规划中，不能确认旧草案。', 409);
    this.check(snapshot, prior, this.now());
    if (confirmed !== true) fail('CONFIRMATION_REQUIRED', '必须明确确认这项操作。');
    if (!snapshot.passkeyCredential) fail('PASSKEY_NOT_REGISTERED', '此会话尚未注册设备。', 409);
    const pending = prior.passkeyPending;
    if (!pending) fail('PASSKEY_CHALLENGE_REQUIRED', '请先获取本次任务的设备验证选项。', 403);
    let proof;
    try { proof = await this.passkey.verifyAuthentication({ pending, response, credential: snapshot.passkeyCredential, binding: this.#binding(token, prior) }); }
    catch (error) {
      return this.store.transact(db => {
        const s = this.session(db, token); const t = this.task(s, taskId); const now = this.now();
        if (['SUCCEEDED', 'PENDING_REVIEW'].includes(t.status)) return { task: publicTask(t, now), state: view(s, now), idempotent: true };
        if (t.passkeyPending?.id !== pending.id) fail('PASSKEY_REQUEST_CHANGED', '本次验证已失效或已消费。', 409);
        delete t.passkeyPending;
        if (error.code === 'PASSKEY_CHALLENGE_EXPIRED') return { error: { code: error.code, message: '本次设备验证已超时，请重新获取选项；没有执行操作。', status: 403 }, state: view(s, now) };
        return this.#verificationFailure(s, t, now, error.code || 'PASSKEY_VERIFICATION_FAILED');
      });
    }
    return this.store.transact(db => {
      const s = this.session(db, token); const t = this.task(s, taskId); const now = this.now();
      if (['SUCCEEDED', 'PENDING_REVIEW'].includes(t.status)) return { task: publicTask(t, now), state: view(s, now), idempotent: true };
      if (this.inFlight.has(token)) fail('PLANNING_IN_PROGRESS', '新需求正在规划中，旧设备授权不能执行。', 409);
      this.check(s, t, now);
      if (t.passkeyPending?.id !== proof.challengeId || t.passkeyPending.expiresAt <= now ||
          this.passkey.bindingHash(this.#binding(token, t)) !== proof.bindingHash || s.passkeyCredential?.id !== proof.credentialId ||
          s.passkeyCredential.counter !== proof.oldCounter || s.passkeyCredential.publicKey !== snapshot.passkeyCredential.publicKey) fail('PASSKEY_REQUEST_CHANGED', '任务、挑战或设备计数已经变化，请重新验证。', 409);
      // Consumption, counter update and business mutation share this one commit.
      delete t.passkeyPending; s.passkeyCredential.counter = proof.newCounter;
      s.passkeyCredential.deviceType = proof.deviceType; s.passkeyCredential.backedUp = proof.backedUp;
      return this.#confirmCore(s, t, now, { confirmed: true }, 'passkey');
    });
  }
  checkReserve(s, action, pendingTask) {
    const postTransferAvailable = available(s) + (pendingTask?.status === 'PENDING_REVIEW' ? action.cents : 0) - action.cents;
    if (action.reserveCents && postTransferAvailable < action.reserveCents) fail('RESERVE_NOT_MET', `转账后可用余额 ${money(postTransferAvailable)}，低于你要求保留的 ${money(action.reserveCents)}；未执行。`);
  }
  execute(s, t, now) {
    const a = t.action;
    if (a.type === 'card_purchase') {
      t.result = executeCardPurchase(s, t, now, { cents, money, available, fail, id, audit });
    } else if (ADVANCED_TYPES.includes(a.type)) {
      t.result = executeAdvanced(s, t, now, { cents, money, available, fail, id, audit });
    } else if (BUSINESS_TYPES.includes(a.type)) {
      t.result = executeBusiness(s, t, now, { cents, money, available, fail, id, audit });
    } else if (a.type === 'transfer') {
      const schedule = a.scheduleId ? s.advanced?.schedules.find(item => item.id === a.scheduleId) : null;
      if (a.scheduleId && (!schedule || schedule.status !== 'SCHEDULED' || schedule.revision !== a.scheduleRevision || schedule.executeAt > now)) fail('SCHEDULE_STATE_CHANGED', '关联定时计划已变化，不再使用旧授权转账。', 409);
      if (s.balance < a.cents) fail('INSUFFICIENT_FUNDS', '余额不足，未执行。');
      this.checkReserve(s, a, t);
      const recipient = s.contacts.find(c => c.id === a.recipientId);
      s.balance -= a.cents; recipient.balance += a.cents;
      s.ledger.push({ id: id(), taskId: t.id, at: now, debitAccount: 'demo-owner', creditAccount: recipient.id, cents: a.cents });
      s.transactions.push({ id: `TX-${t.id.slice(0, 8)}`, date: day(now), merchant: recipient.name, category: '转账', cents: a.cents, type: 'transfer', source: '本地沙箱转账回执' });
      if (schedule) { schedule.status = 'COMPLETED'; schedule.revision += 1; schedule.completedAt = now; schedule.completedTaskId = t.id; }
    } else {
      const card = s.cards.find(c => c.id === a.cardId);
      if (card.status !== a.expectedStatus) fail('CARD_STATE_CHANGED', '卡片状态发生变化，请重新发起任务。', 409);
      if (a.type === 'card_limit') card.limit = a.cents;
      else card.status = a.type === 'freeze_card' ? 'FROZEN' : 'ACTIVE';
    }
    t.status = 'SUCCEEDED'; t.completedAt = now;
    t.receipt = { id: `RCPT-${t.id.slice(0, 10).toUpperCase()}`, at: now, summary: t.title, balanceAfter: s.balance, sandbox: true };
    t.steps = t.steps.map(step => ({ ...step, state: 'done' })); t.steps[3].label = '执行完成，回执已核对';
    audit(s, 'EXECUTION_SUCCEEDED', `${t.title}；回执 ${t.receipt.id}；仅本地模拟资金/卡片。`, now, t.id);
  }
  reconcile(token, taskId) {
    return this.store.transact(db => {
      const now = this.now(); const s = this.session(db, token); const t = this.task(s, taskId);
      if (t.status === 'SUCCEEDED') return { task: publicTask(t, now), state: view(s, now), idempotent: true };
      if (t.status !== 'PENDING_REVIEW') fail('NOT_PENDING', '该任务不需要对账。', 409);
      audit(s, 'SANDBOX_RECONCILIATION', '模拟后台回执到达，按已确认任务结算预留金额；不是重新发起转账。', now, t.id);
      this.execute(s, t, now);
      this.settleWorkflow(s, t, now);
      return { task: publicTask(t, now), state: view(s, now) };
    });
  }
  cancel(token, taskId) {
    return this.store.transact(db => {
      const now = this.now(); const s = this.session(db, token); const t = this.task(s, taskId);
      if (t.status !== 'AWAITING_CONFIRMATION') fail('CANNOT_CANCEL', '仅未执行的草案可以取消；已完成或待对账交易不能假装撤回。', 409);
      if (t.expiresAt <= now) fail('TASK_EXPIRED', '确认已过期，无需再次取消。', 409);
      finishDraft(t, 'CANCELLED', now); audit(s, 'USER_CANCELLED', '取消未执行的任务，没有资金变动。', now, t.id);
      this.settleWorkflow(s, t, now);
      return { task: publicTask(t, now), state: view(s, now) };
    });
  }
}
module.exports = { BankService, BankError, cents, daily, available };
