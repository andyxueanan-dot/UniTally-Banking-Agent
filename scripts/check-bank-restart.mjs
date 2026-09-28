import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const repo = path.resolve(import.meta.dirname, '..');
const evidence = path.resolve(repo, '..', 'evidence', 'T002');
fs.mkdirSync(evidence, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bank-restart-'));
const base = 'http://127.0.0.1:5093';
const statePath = path.join(temp, 'state.json');
let child;
let token;
async function request(route, body) {
  const r = await fetch(`${base}/api/bank${route}`, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(r.status < 300, true); return r.json();
}
async function start() {
  child = spawn(process.execPath, ['backend/bank-server.js'], { cwd: repo, windowsHide: true, stdio: 'pipe', env: { ...process.env, BANK_PORT: '5093', BANK_DATA_PATH: statePath, DEEPSEEK_API_KEY: '' } });
  for (let i = 0; i < 50; i++) { try { const h = await request('/health'); if (h.service === 'unitally-bank-sandbox') return; } catch { } await new Promise(r => setTimeout(r, 100)); }
  throw Error('isolated restart server did not start');
}
async function stop() { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
const result = { startedAt: new Date().toISOString(), statePath, checks: [] };
try {
  // Refuse to touch any pre-existing process on the test port.
  let occupied = false; try { await fetch(`${base}/api/bank/health`, { signal: AbortSignal.timeout(500) }); occupied = true; } catch { }
  if (occupied) throw Error('test port occupied; nothing stopped');
  await start(); const session = await request('/sessions', {}); token = session.token;
  const p = await request('/chat', { text: 'fixed transfer', demo: 'transfer', simulateTimeout: true }); const taskId = p.state.tasks[0].id;
  const pending = await request(`/tasks/${taskId}/confirm`, { confirmed: true }); assert.equal(pending.state.available, 1266000);
  await stop(); await start();
  const restored = await request('/state'); assert.equal(restored.tasks[0].status, 'PENDING_REVIEW'); assert.equal(restored.available, 1266000);
  result.checks.push('reserved balance and pending task survive real process restart');
  const reconciled = await request(`/tasks/${taskId}/reconcile`, {}); assert.equal(reconciled.state.balance, 1266000);
  await stop(); await start(); const final = await request('/state'); assert.equal(final.ledger.length, 1); assert.equal(final.balance, 1266000);
  const replay = await request(`/tasks/${taskId}/confirm`, { confirmed: true }); assert.equal(replay.idempotent, true); assert.equal(replay.state.ledger.length, 1);
  result.checks.push('receipt, debit and idempotency survive second restart'); result.passed = true;
} catch (e) { result.passed = false; result.error = e.stack; process.exitCode = 1; }
finally { if (child && child.exitCode === null) await stop(); result.completedAt = new Date().toISOString(); fs.writeFileSync(path.join(evidence, 'restart-acceptance.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2)); }
