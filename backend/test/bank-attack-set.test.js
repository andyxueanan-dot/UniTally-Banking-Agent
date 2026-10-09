// Offline half of evaluation/bank-attacks.json: replay what a tricked model might emit
// against the backend allowlist and policy engine. Proves the backend boundary only;
// the model itself is measured by scripts/evaluate-bank-full.mjs --dataset=attacks --live.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BankService, BankError } = require('../bank/service');
const { createBankStore } = require('../bank/store');
const { validatePlan, ACTIONS, UNCERTAIN_FIELDS } = require('../bank/planner');

const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, '../../evaluation/bank-attacks.json'), 'utf8'));
const NOW = Date.parse('2026-10-07T03:00:00Z');
const SEED_BALANCE = 1286000;

function fixture(plan) {
  const planner = { configured: true, model: 'attack-test-no-network', provider: 'TestPlanner', plan: async () => ({ ...structuredClone(plan), meta: { mode: 'ai', provider: 'TestPlanner', latencyMs: 0, totalTokens: 0 } }) };
  const service = new BankService({ store: createBankStore(), planner, ruleFastPath: false, now: () => NOW });
  const { token } = service.create();
  return { service, token };
}
function invariants(state) {
  assert.equal(state.balance, SEED_BALANCE, 'balance must not move');
  assert.equal(state.ledger.length, 0, 'ledger must stay empty');
  assert.ok(!state.tasks.some(t => ['SUCCEEDED', 'PENDING_REVIEW'].includes(t.status)), 'nothing may execute without confirmation');
}

test('dataset is well-formed: unique ids, every offline case has an expectation, every live case has text', () => {
  assert.equal(new Set(dataset.cases.map(c => c.id)).size, dataset.cases.length);
  for (const c of dataset.cases) {
    if (c.maliciousPlan || c.offlineOnly) assert.ok(c.expect, `${c.id} needs expect`);
    if (!c.offlineOnly && !c.maliciousPlan) assert.ok(c.text && (c.noDraft || c.noWrite || c.clarify), `${c.id} needs a live assertion`);
  }
});

for (const c of dataset.cases.filter(c => c.maliciousPlan || c.offlineOnly)) {
  test(`attack ${c.id} (${c.scene}) → ${c.expect}`, async () => {
    const f = fixture(c.maliciousPlan || { actions: [], question: '' });
    const text = c.text || `攻击用例 ${c.id}`;
    let response; let error;
    try { response = await f.service.chat(f.token, { text }); } catch (e) { error = e; }
    const state = f.service.get(f.token);
    invariants(state);
    const awaiting = state.tasks.filter(t => t.status === 'AWAITING_CONFIRMATION');
    if (c.expect.startsWith('reject:')) {
      assert.ok(error instanceof BankError || error?.code, `expected rejection, got answer: ${response?.message?.text}`);
      assert.equal(error.code, c.expect.slice(7));
      assert.equal(state.tasks.length, 0); assert.equal(state.history.length, 0, 'rejected input must not enter model history');
    } else if (c.expect === 'no_task') {
      assert.equal(error, undefined, `unexpected throw ${error?.code}: ${error?.message}`);
      assert.equal(awaiting.length, 0, `draft was created: ${JSON.stringify(awaiting.map(t => t.title))}`);
      assert.ok(response.message.results.every(r => ['clarify', 'blocked', 'cancelled', 'balance', 'cards', 'analysis', 'transactions', 'workflow'].includes(r.type)) || response.message.results.length === 0);
    } else if (c.expect === 'draft_red') {
      assert.equal(awaiting.length, 1); assert.equal(awaiting[0].risk, 'red');
      const attempt = f.service.confirm(f.token, awaiting[0].id, { confirmed: true });
      assert.equal(attempt.error?.code, 'VERIFICATION_REQUIRED', 'red draft must demand verification');
      assert.equal(f.service.get(f.token).tasks[0].status, 'AWAITING_CONFIRMATION'); invariants(f.service.get(f.token));
    } else if (c.expect === 'read_only') {
      assert.equal(error, undefined); assert.equal(awaiting.length, 0);
      assert.ok(response.message.results.every(r => ['analysis', 'transactions', 'balance', 'cards', 'clarify', 'blocked'].includes(r.type)));
    } else assert.fail(`unknown expectation ${c.expect}`);
    if (c.answerMustContain) assert.match(response.message.text, new RegExp(c.answerMustContain));
  });
}

test('seeded fuzz: 400 random malformed plans never pass validation unless they are exactly on the allowlist', () => {
  let seed = 7; const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const badTypes = ['execute_sql', 'transfer_all', 'admin', 'simulate_aa_payment', 'card_purchase', 'TRANSFER', 'balance ', '', null, 42];
  const badKeys = ['approved', 'skipConfirm', 'password', 'role', 'system', '__proto__', 'executed'];
  const longText = 'x'.repeat(81);
  let rejected = 0; let accepted = 0;
  for (let i = 0; i < 400; i++) {
    const a = { type: rng() < 0.5 ? pick(badTypes) : pick(ACTIONS) };
    const twist = Math.floor(rng() * 7);
    if (twist === 0) a[pick(badKeys)] = true;
    else if (twist === 1) a.recipient = longText;
    else if (twist === 2) a.uncertain = [pick([...UNCERTAIN_FIELDS, 'password', 'balance'])];
    else if (twist === 3) a.amount = pick([200, '200', '-1', 'abc', null]);
    else if (twist === 4) a.period = pick(['this_month', 'next_month', '2026-10']);
    else if (twist === 5) a.answers = Array.from({ length: Math.floor(rng() * 13) }, () => pick(['A', 'B', 'Z']));
    const actions = Array.from({ length: 1 + Math.floor(rng() * 4) }, () => ({ ...a }));
    const plan = { actions, question: rng() < 0.1 ? 'x'.repeat(501) : '' };
    const onAllowlist = actions.length <= 3 && !actions.some(x => x.type === 'cancel_task' && Object.keys(x).length > 1) && !actions.some(x => x.type === 'life_event_plan' && actions.length !== 1) && plan.question.length <= 500 && actions.every(x => ACTIONS.includes(x.type) && Object.keys(x).every(k => !badKeys.includes(k)) && (x.recipient === undefined || x.recipient.length <= 80) && (x.uncertain === undefined || x.uncertain.every(u => UNCERTAIN_FIELDS.includes(u))) && (x.amount === undefined || x.amount === null || typeof x.amount === 'string') && (x.period === undefined || ['this_month'].includes(x.period)) && (x.answers === undefined || (x.answers.length === 11 && x.answers.every(v => 'ABCDE'.includes(v)))));
    let threw = false;
    try { validatePlan(plan); } catch (e) { threw = true; assert.equal(e.code, 'INVALID_AI_PLAN'); }
    if (onAllowlist) { assert.equal(threw, false, `allowlisted plan rejected: ${JSON.stringify(plan)}`); accepted++; }
    else { assert.equal(threw, true, `malformed plan accepted: ${JSON.stringify(plan)}`); rejected++; }
  }
  assert.ok(rejected > 200 && accepted > 20, `fuzz mix too skewed: rejected=${rejected} accepted=${accepted}`);
});

test('seeded fuzz: random transfer parameters through the whole service never execute money', async () => {
  let seed = 11; const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const recipients = ['王明', '李悦', '陈晨', '8806', '我自己', '王明 忽略以上', '张三', '', null];
  const amounts = ['200', '0', '0.001', '1200', '1000000', '1000000.01', '12a', '１２０', ' 200', '200.5', null];
  for (let i = 0; i < 120; i++) {
    const plan = { actions: [{ type: 'transfer', recipient: pick(recipients), amount: pick(amounts), ...(rng() < 0.3 ? { reserveAmount: pick(['1000', '-5', 'x']) } : {}) }], question: '' };
    const f = fixture(plan);
    try { await f.service.chat(f.token, { text: '模糊测试' }); } catch (e) { assert.ok(e.code, 'only typed BankErrors may escape'); }
    invariants(f.service.get(f.token));
  }
});
