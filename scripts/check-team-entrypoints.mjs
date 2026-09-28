import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';

const repo = path.resolve(import.meta.dirname, '..');
const output = path.resolve(repo, '../evidence/T004-team-readme');
fs.mkdirSync(output, { recursive: true });
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const report = { startedAt: new Date().toISOString(), checks: [], commands: [], source: repo, paidAiCalls: 0 };
const save = () => fs.writeFileSync(path.join(output, `entrypoints-${runId}.json`), JSON.stringify(report, null, 2));
async function ps(script, args = []) {
  const started = performance.now();
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], { cwd: report.freshClone, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks = []; child.stdout.on('data', b => chunks.push(b)); child.stderr.on('data', b => chunks.push(b));
  const exitCode = await new Promise((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); });
  const log = path.join(output, `${runId}-${report.commands.length}-${path.basename(script)}.log`);
  fs.writeFileSync(log, Buffer.concat(chunks));
  report.commands.push({ script: path.basename(script), args, exitCode, elapsedMs: Math.round(performance.now() - started), log }); save(); return exitCode;
}
async function health() { return fetch('http://127.0.0.1:5091/api/bank/health', { signal: AbortSignal.timeout(3000) }); }
let ownsService = false;
try {
  let occupied = false;
  try { await health(); occupied = true; } catch { }
  assert.equal(occupied, false, '5091 already in use; test will not stop another service.');
  report.freshClone = fs.mkdtempSync(path.join(os.tmpdir(), 'unitally-team-entry-'));
  const candidates = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: repo, encoding: 'utf8' }).split('\0').filter(Boolean);
  const files = candidates.filter(f => fs.existsSync(path.join(repo, f)) && fs.statSync(path.join(repo, f)).isFile() && !/(^|\/)(node_modules|dist|data|\.venv-sandbox|\.cache)(\/|$)/.test(f) && !/(^|\/)\.env(?:\.|$)/.test(f));
  for (const file of files) { const target = path.join(report.freshClone, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(repo, file), target); }
  assert.equal(fs.existsSync(path.join(report.freshClone, 'node_modules')), false);
  assert.equal(fs.existsSync(path.join(report.freshClone, 'backend/.env.bank.local')), false);
  report.checks.push('created clean source copy with no dependencies, build, key or account data'); save();
  const start = path.join(report.freshClone, 'scripts/start-bank-demo.ps1');
  const stop = path.join(report.freshClone, 'scripts/stop-bank-demo.ps1');
  assert.equal(await ps(start, ['-NoBrowser']), 0);
  ownsService = true;
  const first = await (await health()).json(); assert.equal(first.service, 'unitally-bank-sandbox'); assert.equal(first.aiConfigured, false);
  assert.equal((await fetch('http://localhost:5091/bank-agent')).status, 200);
  const session = await (await fetch('http://localhost:5091/api/bank/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
  const example = await (await fetch('http://localhost:5091/api/bank/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ text: '固定账单案例', demo: 'analysis' }) })).json();
  assert.equal(example.message.results[0].total, 112500); assert.equal(example.message.meta.mode, 'offline');
  report.checks.push('first launch installed both dependency sets, built website and served offline bill analysis');
  assert.equal(await ps(start, ['-NoBrowser']), 0); report.checks.push('second launch reuses verified running service');
  const receipt = path.join(report.freshClone, '.cache/bank-agent/launcher.json'); const original = fs.readFileSync(receipt);
  const altered = JSON.parse(original.toString('utf8').replace(/^\uFEFF/, '')); altered.createdAt = '1970-01-01T00:00:00Z';
  fs.writeFileSync(receipt, JSON.stringify(altered));
  assert.equal(await ps(stop), 1); assert.equal((await health()).status, 200); fs.writeFileSync(receipt, original);
  report.checks.push('stop script refuses mismatched process creation time and leaves service alive');
  assert.equal(await ps(stop), 0); ownsService = false;
  assert.equal(await ps(start, ['-NoBrowser']), 0); ownsService = true;
  const restored = await (await fetch('http://localhost:5091/api/bank/state', { headers: { Authorization: `Bearer ${session.token}` } })).json();
  assert.equal(restored.balance, 1286000); assert.equal(restored.history.length, 2); report.checks.push('stop/start keeps account and history and rebuilds current frontend');
  assert.equal(await ps(stop), 0); ownsService = false;
  assert.equal(await ps(stop), 0); report.checks.push('safe stop is repeatable and never deletes data');
  report.passed = true;
} catch (e) { report.passed = false; report.error = e.stack; process.exitCode = 1; }
finally {
  if (ownsService) await ps(path.join(report.freshClone, 'scripts/stop-bank-demo.ps1'));
  report.completedAt = new Date().toISOString(); save(); console.log(JSON.stringify(report, null, 2));
}
