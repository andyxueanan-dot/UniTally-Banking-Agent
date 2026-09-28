import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const repo = path.resolve(import.meta.dirname, '..');
const evidence = path.resolve(repo, '..', 'evidence', 'T002');
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: repo, encoding: 'utf8' }).split('\0').filter(Boolean);
const sources = files.filter(f => /^(backend\/bank|backend\/test\/bank|scripts\/(?:check-bank|start-bank|snapshot-bank)|src\/(?:pages\/BankAgent|pages\/bank-agent|lib\/bankApi|main)|tsconfig.bank|vite.config|docs\/development\/BANK_AGENT_DEMO|启动银行智能体)/.test(f));
const hashes = sources.map(file => ({ file, sha256: createHash('sha256').update(fs.readFileSync(path.join(repo, file))).digest('hex') }));
const envText = fs.readFileSync(path.join(repo, 'backend', '.env.bank.local'), 'utf8');
const key = envText.match(/^DEEPSEEK_API_KEY=(.+)$/m)?.[1].trim();
if (!key) throw Error('Local key not configured');
const built = fs.readdirSync(path.join(repo, 'dist', 'assets')).map(f => `dist/assets/${f}`);
const leakFiles = [...files, ...built].filter(f => fs.existsSync(path.join(repo, f)) && fs.statSync(path.join(repo, f)).isFile() && fs.readFileSync(path.join(repo, f)).includes(Buffer.from(key)));
const ignored = execFileSync('git', ['check-ignore', 'backend/.env.bank.local'], { cwd: repo, encoding: 'utf8' }).trim();
if (leakFiles.length || !ignored) throw Error('Credential exclusion check failed (values intentionally not logged)');
const browser = JSON.parse(fs.readFileSync(path.join(evidence, 'browser-live.json')));
const prior1 = JSON.parse(fs.readFileSync(path.join(evidence, 'browser-live-attempt1-rate-limit.json')));
const prior2 = JSON.parse(fs.readFileSync(path.join(evidence, 'browser-live-attempt2-mobile-label.json')));
const safety = JSON.parse(fs.readFileSync(path.join(evidence, 'live-ai-safety.json')));
// The first, standalone provider connectivity probe was observed in the terminal before persisted tests.
const probe = { provider: 'DeepSeek', model: 'deepseek-flash', totalTokens: 886, latencyMs: 3076, source: 'initial terminal connectivity probe' };
const calls = [probe, ...[prior1, prior2, browser].flatMap(r => r.modelCalls.filter(m => m.mode === 'ai')), ...safety.checks.map(c => c.meta)];
const health = await (await fetch('http://127.0.0.1:5091/api/bank/health')).json();
const result = { at: new Date().toISOString(), branch: execFileSync('git', ['branch', '--show-current'], { cwd: repo, encoding: 'utf8' }).trim(),
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  sourceHashes: hashes, credentials: { scannedFiles: files.length + built.length, localKeyGitIgnored: true, leakFiles },
  observedModelCalls: calls.length, observedTotalTokens: calls.reduce((n, c) => n + c.totalTokens, 0),
  actualBilling: 'Not queried; see DeepSeek account. No background polling or autonomous model calls.',
  health, localUrl: 'http://127.0.0.1:5091/bank-agent', pushed: false, committed: false };
fs.writeFileSync(path.join(evidence, 'handoff-manifest.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, sourceHashes: `${hashes.length} hashed source files` }, null, 2));
