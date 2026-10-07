const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BankService } = require('../bank/service');
const { createBankStore } = require('../bank/store');
const { hasPrivateData } = require('../bank/privacy');

function fixture(options = {}) {
  let now = Date.parse('2026-09-26T10:00:00Z');
  let actions = []; let question = ''; let wait; let failure;
  const sent = [];
  const planner = { configured: true, model: 'quality-test-no-network', plan: async (text, history) => {
    sent.push({ text, history }); if (wait) await wait; if (failure) throw failure;
    return { actions, question, meta: { mode: 'test', totalTokens: 0, latencyMs: 0 } };
  } };
  const store = options.store || createBankStore();
  const service = new BankService({ store, planner, now: () => now, ...options });
  const { token } = service.create();
  return { service, store, planner, token, sent,
    set: (next, nextQuestion = '') => { actions = next; question = nextQuestion; },
    delay: promise => { wait = promise; }, fail: error => { failure = error; },
    tick: (ms = 61000) => { now += ms; },
    chat: (text = '测试需求', opts = {}) => service.chat(token, { text, ...opts }),
    task: () => service.get(token).tasks[0],
    internal: () => Object.values(store.read().sessions)[0],
  };
}
const transfer = (amount = '200', recipient = '王明', extra = {}) => ({ type: 'transfer', amount, recipient, ...extra });
const freeze = { type: 'freeze_card', cardLast4: '8806' };
function authorize(f, task = f.task()) {
  const code = task.risk === 'red' ? f.service.challenge(f.token, task.id).demoCode : undefined;
  return f.service.confirm(f.token, task.id, { confirmed: true, code });
}

test('new unsupported, clarification and read requests immediately invalidate old authorization', async () => {
  for (const input of ['改成明天给王明转300元', '改成给王明转300美元', '请查询余额', '先等等，我想改一下']) {
    const f = fixture(); f.set([transfer()]); await f.chat(); const old = f.task();
    f.set(input === '请查询余额' ? [{ type: 'balance' }] : input.includes('改成') ? [transfer('300')] : [], '请补充');
    await f.chat(input);
    assert.equal(f.service.get(f.token).tasks.find(t => t.id === old.id).status, 'SUPERSEDED');
    assert.throws(() => f.service.confirm(f.token, old.id, { confirmed: true }), { code: 'TASK_NOT_ACTIONABLE' });
    assert.equal(f.service.get(f.token).balance, 1286000);
  }
});
test('planning blocks stale confirmation/challenge, and planner failure never resurrects old draft', async () => {
  const f = fixture(); f.set([freeze]); await f.chat(); const old = f.task();
  let release; f.delay(new Promise(resolve => { release = resolve; }));
  f.fail(Object.assign(new Error('test provider offline'), { code: 'AI_UNAVAILABLE' }));
  const pending = f.chat('不对，改一下');
  assert.equal(f.task().status, 'SUPERSEDED');
  assert.throws(() => f.service.confirm(f.token, old.id, { confirmed: true }), { code: 'PLANNING_IN_PROGRESS' });
  assert.throws(() => f.service.challenge(f.token, old.id), { code: 'PLANNING_IN_PROGRESS' });
  release(); await assert.rejects(pending, { code: 'AI_UNAVAILABLE' });
  assert.equal(f.task().status, 'SUPERSEDED'); assert.equal(f.service.inFlight.size, 0);
});
test('intent version prevents stale authorization even if awaiting status is restored', async () => {
  const f = fixture(); f.set([transfer()]); await f.chat(); const old = f.task();
  f.set([{ type: 'balance' }]); await f.chat();
  f.store.transact(db => { Object.values(db.sessions)[0].tasks[0].status = 'AWAITING_CONFIRMATION'; });
  assert.throws(() => f.service.confirm(f.token, old.id, { confirmed: true }), { code: 'INTENT_CHANGED' });
});
test('yellow transfer cannot reset red failures across different tasks', async () => {
  const f = fixture(); f.set([freeze]); await f.chat(); let red = f.task(); f.service.challenge(f.token, red.id);
  for (let i = 0; i < 2; i++) assert.equal(f.service.confirm(f.token, red.id, { confirmed: true, code: '000000' }).error.code, 'INVALID_CODE');
  f.set([transfer('0.01')]); await f.chat(); authorize(f); assert.equal(f.internal().authFailures, 2);
  f.set([freeze]); await f.chat(); red = f.task(); f.service.challenge(f.token, red.id);
  assert.equal(f.service.confirm(f.token, red.id, { confirmed: true, code: '000000' }).error.code, 'SAFETY_LOCKED');
  assert.ok(f.internal().lockedUntil > 0);
});
test('successful red verification resets authentication failures', async () => {
  const f = fixture(); f.set([freeze]); await f.chat(); const task = f.task(); const challenge = f.service.challenge(f.token, task.id);
  f.service.confirm(f.token, task.id, { confirmed: true, code: '000000' });
  assert.equal(f.internal().authFailures, 1);
  f.service.confirm(f.token, task.id, { confirmed: true, code: challenge.demoCode });
  assert.equal(f.internal().authFailures, 0);
});
test('conflicting or malformed contact identifiers clarify rather than choose by substring', async () => {
  for (const name of ['王明6619', '李悦1028', '不存在6619', '王明1028或6619', '王明李悦6619', '210281', '王明0000']) {
    const f = fixture(); f.set([transfer('200', name)]); const response = await f.chat();
    assert.equal(response.message.results[0].type, 'clarify', name); assert.equal(f.task(), undefined, name);
  }
  for (const name of ['王明1028', '小王（尾号1028）', '尾号1028', '1028', 'wang']) {
    const f = fixture(); f.set([transfer('200', name)]); await f.chat(); assert.equal(f.task().action.recipientId, 'wang', name);
  }
  const f = fixture(); f.set([transfer('200', '陈晨9526')]); await f.chat(); assert.equal(f.task().action.recipientId, 'chen2');
});
test('formatted private numbers and secrets are blocked before mock provider or storage', async () => {
  for (const text of ['卡6222 0212 3456 7890', '手机号138-0013-8000', '卡６２２２０２１２３４５６７８９０', '138\u200b0013\u200b8000', 'SK-Abcdefghijklmnop', 'sk-Ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐ']) {
    const f = fixture();
    await assert.rejects(f.chat(text), { code: 'PRIVATE_DATA_BLOCKED' }); assert.equal(f.sent.length, 0);
    assert.equal(f.internal().history.length, 0); assert.equal(f.service.metadata().aiCallsToday, 0);
  }
  for (const text of ['尾号8806', '转200元，留1000元', '2026-09-26']) assert.equal(hasPrivateData(text), false);
});
test('legacy history receives the same privacy boundary before it reaches model', async () => {
  const f = fixture({ ruleFastPath: false }); // plain lookups would otherwise be answered by rules without reaching the model
  f.store.transact(db => { Object.values(db.sessions)[0].history.push({ role: 'user', text: '手机号138-0013-8000' }); });
  f.set([{ type: 'balance' }]); await f.chat('查询余额');
  assert.equal(f.sent.length, 1); assert.ok(!JSON.stringify(f.sent[0]).includes('138-0013-8000'));
  assert.match(f.sent[0].history[0].content, /未发送给模型/);
});
test('reserve constraint binds immutable task, blocks prepare and is not interpreted as transfer amount', async () => {
  const f = fixture(); f.set([transfer('12000', '王明', { reserveAmount: '1000' })]);
  const denied = await f.chat('给王明转12000元，留够1000元'); assert.equal(denied.message.results[0].code, 'RESERVE_NOT_MET'); assert.equal(f.task(), undefined);
  f.set([transfer('11860', '王明', { reserveAmount: '1000' })]); await f.chat('给王明转11860元，至少保留1000元');
  assert.equal(f.task().action.cents, 1186000); assert.equal(f.task().action.reserveCents, 100000);
  const result = authorize(f); assert.equal(result.state.available, 100000);
});
test('missing extracted reserve fails closed even if model proposes a transfer', async () => {
  for (const text of ['转200元，留够1000元生活费', '转200元，但至少剩余1000元', '转200元并预留一些生活费']) {
    const f = fixture(); f.set([transfer()]); const result = await f.chat(text);
    assert.equal(f.task(), undefined); assert.match(result.message.text, /保留余额条件/);
  }
});
test('reserve is rechecked at confirmation after balance changes', async () => {
  const f = fixture(); f.set([transfer('200', '王明', { reserveAmount: '12000' })]); await f.chat();
  f.store.transact(db => { Object.values(db.sessions)[0].balance = 1210000; });
  assert.throws(() => authorize(f), { code: 'RESERVE_NOT_MET' }); assert.equal(f.internal().ledger.length, 0);
});
test('reserve correctly excludes its own pending hold during reconciliation and preserves idempotency', async () => {
  const f = fixture(); f.set([transfer('11860', '王明', { reserveAmount: '1000' })]); await f.chat('测试', { simulateTimeout: true });
  const task = f.task(); const pending = authorize(f); assert.equal(pending.state.available, 100000);
  const result = f.service.reconcile(f.token, task.id); assert.equal(result.state.available, 100000);
  assert.equal(f.service.reconcile(f.token, task.id).idempotent, true); assert.equal(f.internal().ledger.length, 1);
});
test('reserve recheck at execution leaves an unsafe pending operation unexecuted', async () => {
  const f = fixture(); f.set([transfer('200', '王明', { reserveAmount: '12000' })]); await f.chat('测试', { simulateTimeout: true }); authorize(f); const task = f.task();
  f.store.transact(db => { Object.values(db.sessions)[0].balance = 1210000; });
  assert.throws(() => f.service.reconcile(f.token, task.id), { code: 'RESERVE_NOT_MET' });
  assert.equal(f.task().status, 'PENDING_REVIEW'); assert.equal(f.internal().ledger.length, 0);
});
test('natural cancellation cancels the intake-superseded latest draft without reverting settled or pending funds', async () => {
  const f = fixture(); f.set([transfer()]); await f.chat(); const old = f.task();
  f.set([{ type: 'cancel_task' }]); const result = await f.chat('取消刚才的转账');
  assert.equal(result.message.results[0].type, 'cancelled'); assert.equal(f.task().id, old.id); assert.equal(f.task().status, 'CANCELLED');
  assert.equal(f.internal().balance, 1286000);
  for (const timeout of [false, true]) {
    const next = fixture(); next.set([transfer()]); await next.chat('测试', { simulateTimeout: timeout }); authorize(next); const status = next.task().status;
    next.set([{ type: 'cancel_task' }]); await next.chat('取消刚才的转账'); assert.equal(next.task().status, status);
  }
});
test('terminal states expose stopped steps and actual server clock, including legacy terminal tasks', async () => {
  const f = fixture(); f.set([transfer()]); await f.chat(); f.tick(601000);
  let state = f.service.get(f.token); assert.equal(state.tasks[0].status, 'EXPIRED'); assert.ok(state.serverNow > state.tasks[0].expiresAt);
  assert.ok(state.tasks[0].steps.every(step => !['current', 'waiting'].includes(step.state)));
  f.store.transact(db => { const task = Object.values(db.sessions)[0].tasks[0]; task.status = 'CANCELLED'; task.steps[2].state = 'current'; });
  state = f.service.get(f.token); assert.equal(state.tasks[0].steps[2].state, 'stopped');
});
test('legacy versionless awaiting task remains usable until a new command replaces it', async () => {
  const f = fixture(); f.set([transfer()]); await f.chat();
  f.store.transact(db => { const s = Object.values(db.sessions)[0]; delete s.intentVersion; delete s.tasks[0].intentVersion; delete s.commandCount; delete s.recentCommands; });
  assert.equal(authorize(f).task.status, 'SUCCEEDED');
});
test('offline commands share persisted rate and lifetime quotas while preserving history and receipts', async () => {
  const f = fixture({ limits: { commandsPerMinute: 2, maxCommands: 3 } });
  await f.chat('离线', { demo: 'transfer' }); const old = f.task(); authorize(f);
  await f.chat('离线', { demo: 'analysis' });
  await assert.rejects(f.chat('离线', { demo: 'analysis' }), { code: 'RATE_LIMIT' });
  f.tick(); await f.chat('离线', { demo: 'analysis' }); f.tick();
  await assert.rejects(f.chat('离线', { demo: 'analysis' }), { code: 'COMMAND_LIMIT' });
  assert.equal(f.service.confirm(f.token, old.id, { confirmed: true }).idempotent, true); assert.equal(f.internal().tasks.length, 1);
  const restored = new BankService({ store: f.store, planner: f.planner, limits: { maxCommands: 3 } });
  await assert.rejects(restored.chat(f.token, { text: '离线', demo: 'analysis' }), { code: 'COMMAND_LIMIT' });
});
test('session and task quotas are explicit and pending reconciliation still works at quota', async () => {
  const f = fixture({ limits: { maxSessions: 2, maxTasks: 1, sessionCreatesPerMinute: 2 } });
  f.service.create(); assert.throws(() => f.service.create(), { code: 'SESSION_LIMIT' });
  f.set([transfer()]); await f.chat('测试', { simulateTimeout: true }); const pending = f.task(); authorize(f);
  const blocked = await f.chat(); assert.equal(blocked.message.results[0].code, 'TASK_LIMIT');
  assert.equal(f.service.reconcile(f.token, pending.id).task.status, 'SUCCEEDED'); assert.equal(f.internal().tasks.length, 1);
});
test('session creation rate and per-task challenge budgets cap unauthenticated or repeated writes', async () => {
  const f = fixture({ limits: { sessionCreatesPerMinute: 1, challengesPerTask: 2 } });
  assert.throws(() => f.service.create(), { code: 'SESSION_RATE_LIMIT' }); f.tick(); assert.ok(f.service.create().token);
  f.set([freeze]); await f.chat(); const task = f.task(); f.service.challenge(f.token, task.id); const final = f.service.challenge(f.token, task.id);
  assert.throws(() => f.service.challenge(f.token, task.id), { code: 'CHALLENGE_LIMIT' });
  assert.equal(f.service.confirm(f.token, task.id, { confirmed: true, code: final.demoCode }).task.status, 'SUCCEEDED');
});
test('global planning concurrency is bounded across independent sessions', async () => {
  const f = fixture({ limits: { maxConcurrentPlans: 1 } }); const other = f.service.create();
  let release; f.delay(new Promise(resolve => { release = resolve; })); f.set([{ type: 'balance' }]);
  const pending = f.chat();
  await assert.rejects(f.service.chat(other.token, { text: '查余额' }), { code: 'PLANNING_LIMIT' });
  release(); await pending; assert.equal(f.service.inFlight.size, 0);
});
