import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const repo = path.resolve(import.meta.dirname, '..');
const evidence = path.resolve(repo, '..', 'evidence/T003');
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: repo, encoding: 'utf8' }).split('\0').filter(Boolean);
const keyPath = path.join(repo, 'backend/.env.bank.local');
const key = fs.existsSync(keyPath) ? fs.readFileSync(keyPath, 'utf8').match(/^DEEPSEEK_API_KEY=(.+)$/m)?.[1].trim() : undefined;
const scanned = files.filter(file => fs.existsSync(path.join(repo, file)) && fs.statSync(path.join(repo, file)).isFile());
const compiled = fs.readdirSync(path.join(repo, 'dist/assets')).map(file => `dist/assets/${file}`);
const leaked = key ? [...scanned, ...compiled].filter(file => fs.readFileSync(path.join(repo, file)).includes(Buffer.from(key))) : [];
const forbidden = scanned.filter(file => file.startsWith('.venv-sandbox/') || file.startsWith('backend/data/') || file.endsWith('.env.bank.local') || file.startsWith('node_modules/'));
if (leaked.length || forbidden.length) throw Error('Private material exclusion check failed; sensitive contents are not printed.');
const hashes = [...scanned.filter(file => /^(backend\/bank|backend\/test\/bank|src\/(?:main|bank-base|pages\/Bank|pages\/bank|lib\/bankApi)|scripts\/(?:check-bank|snapshot-bank-quality|start-bank|stop-bank|evaluate-bank)|evaluation\/|docs\/development\/BANK_|README|sandbox-requirements|package|backend\/package|\.gitignore)/.test(file)), ...compiled]
  .map(file => ({ file, sha256: createHash('sha256').update(fs.readFileSync(path.join(repo, file))).digest('hex') }));
const latest = dir => fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isDirectory()).sort().at(-1);
const checkDir = path.join(evidence, 'checks'); const browserDir = path.join(evidence, 'root-experience');
const budget = JSON.parse(fs.readFileSync(path.join(evidence, 'ai-budget.json')));
const result = { at: new Date().toISOString(), branch: execFileSync('git', ['branch', '--show-current'], { cwd: repo, encoding: 'utf8' }).trim(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  dirtyFiles: execFileSync('git', ['status', '--short'], { cwd: repo, encoding: 'utf8' }).trim(),
  sourceHashes: hashes, credentials: { leakFiles: [], forbiddenFiles: [], scanned: scanned.length + compiled.length },
  latestChecks: path.join(checkDir, latest(checkDir), 'results.json'), latestBrowser: path.join(browserDir, latest(browserDir), 'report.json'),
  modelBudget: budget, noAutomaticPaidCalls: true, remotePushedThisIteration: false,
  canonicalUrl: 'http://localhost:5091/bank-agent', serviceHealth: await (await fetch('http://localhost:5091/api/bank/health')).json(),
  ongoingGoal: 'Not completed: further model evaluation, independent users, final material and remaining limitations still required.' };
const file = path.join(evidence, `checkpoint-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.json`);
fs.writeFileSync(file, JSON.stringify(result, null, 2)); console.log(JSON.stringify({ file, branch: result.branch, commit: result.commit, hashCount: hashes.length, credentialLeaks: 0, modelBudget: budget }, null, 2));
