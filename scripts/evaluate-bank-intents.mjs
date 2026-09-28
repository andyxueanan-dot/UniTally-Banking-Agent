import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const repo = path.resolve(import.meta.dirname, '..');
const evidence = path.resolve(repo, '..', 'evidence', 'T003');
fs.mkdirSync(evidence, { recursive: true });
require('../backend/node_modules/dotenv').config({ path: path.join(repo, 'backend/.env.bank.local') });
const { createBankStore } = require('../backend/bank/store');
const { BankService } = require('../backend/bank/service');
const { createDeepSeekPlanner } = require('../backend/bank/planner');
const phase = process.argv.find(a => a.startsWith('--phase='))?.split('=')[1];
if (!phase || !/^[a-z0-9-]+$/.test(phase)) throw Error('Explicit --phase=name required; this runs paid development checks.');
const target = path.join(evidence, `intent-eval-${phase}.json`);
if (fs.existsSync(target)) throw Error('Evidence phase already exists; choose a new phase name rather than overwriting results.');
const budgetPath = path.join(evidence, 'ai-budget.json');
const budget = fs.existsSync(budgetPath) ? JSON.parse(fs.readFileSync(budgetPath)) : { task: 'T003', limit: 24, attempts: 0, tokens: 0 };
const datasetPath = path.join(repo, 'evaluation/bank-intents.dev.json');
const dataset = JSON.parse(fs.readFileSync(datasetPath));
const nativePlanner = createDeepSeekPlanner({ apiKey: process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_MODEL || 'deepseek-chat' });
const result = { phase, startedAt: new Date().toISOString(), datasetHash: createHash('sha256').update(fs.readFileSync(datasetPath)).digest('hex'),
  sourceHashes: Object.fromEntries(['service.js', 'planner.js'].map(f => [f, createHash('sha256').update(fs.readFileSync(path.join(repo, 'backend/bank', f))).digest('hex')])),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), cases: [], classification: 'development set; not blind; no real funds' };
const save = () => fs.writeFileSync(target, JSON.stringify(result, null, 2));
save();
for (const sample of dataset.cases) {
  if (budget.attempts >= budget.limit) { result.stopped = 'LOCAL_24_CALL_BUDGET'; break; }
  let captured;
  const planner = { ...nativePlanner, async plan(text, history) {
    budget.attempts += 1; fs.writeFileSync(budgetPath, JSON.stringify(budget, null, 2));
    captured = await nativePlanner.plan(text, history);
    budget.tokens += captured.meta.totalTokens; fs.writeFileSync(budgetPath, JSON.stringify(budget, null, 2));
    return captured;
  } };
  const service = new BankService({ store: createBankStore(), planner });
  const { token } = service.create();
  if (sample.seed) await service.chat(token, { text: '给王明转200元', demo: sample.seed });
  const start = performance.now(); const assertions = [];
  try {
    const response = await service.chat(token, { text: sample.text });
    const tasks = response.state.tasks; const drafts = tasks.filter(t => t.status === 'AWAITING_CONFIRMATION');
    const expected = sample.expect;
    const check = (name, passed) => assertions.push({ name, passed });
    check('no funds moved without confirmation', response.state.balance === 1286000 && response.state.ledger.length === 0);
    if (expected.types) check('planned action types', expected.types.every(type => captured.actions.some(a => a.type === type)));
    if (expected.noDraft) check('no executable draft', drafts.length === 0);
    if (expected.clarify) check('asks clarification', response.message.results.some(r => r.type === 'clarify') || captured.actions.length === 0);
    if (expected.oldDraftCancelled) check('old draft cancelled', tasks.some(t => t.status === 'CANCELLED'));
    if (expected.cents) check('exact amount', drafts[0]?.action.cents === expected.cents);
    if (expected.recipientId) check('correct payee', drafts[0]?.action.recipientId === expected.recipientId);
    if (expected.cardLast4) check('correct card', drafts[0]?.action.cardLast4 === expected.cardLast4);
    if (expected.risk) check('risk level', drafts[0]?.risk === expected.risk);
    if (expected.period) check('requested bill period', captured.actions.some(a => a.period === expected.period));
    if (expected.total) check('exact source bill total', response.message.results.some(r => r.total === expected.total));
    result.cases.push({ id: sample.id, input: sample.text, passed: assertions.every(a => a.passed), assertions,
      actions: captured.actions, answer: response.message.text, meta: captured.meta, elapsedMs: Math.round(performance.now() - start) });
  } catch (e) { result.cases.push({ id: sample.id, passed: false, error: { code: e.code || 'ERROR', message: e.message }, elapsedMs: Math.round(performance.now() - start) }); }
  save(); console.log(JSON.stringify({ id: sample.id, passed: result.cases.at(-1).passed, elapsedMs: result.cases.at(-1).elapsedMs }));
}
result.completedAt = new Date().toISOString(); result.passed = result.cases.filter(c => c.passed).length; result.total = result.cases.length; result.budget = budget; save();
console.log(JSON.stringify({ phase, passed: result.passed, total: result.total, budget }));
