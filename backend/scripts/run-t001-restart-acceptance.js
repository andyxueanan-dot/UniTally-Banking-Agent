const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const outputPath = path.resolve(process.argv[2] || path.join(process.cwd(), 'restart-acceptance.json'));
const port = 5051;
const baseUrl = `http://127.0.0.1:${port}`;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unitally-restart-'));
const dataPath = path.join(tempDir, 'sandbox-state.json');
const processes = [];

async function waitForHealth(child) {
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Backend exited early with ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return attempt;
    } catch {
      // Retry while the local child process starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for restart acceptance backend.');
}

async function startBackend() {
  const stdout = [];
  const stderr = [];
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(port), TUITION_SANDBOX_DATA_PATH: dataPath },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => stdout.push(chunk.toString()));
  child.stderr.on('data', (chunk) => stderr.push(chunk.toString()));
  processes.push(child);
  const healthAttempt = await waitForHealth(child);
  return { child, stdout, stderr, healthAttempt };
}

async function stopBackend(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Backend child did not stop.')), 5000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function request(apiPath, { method = 'GET', token, body, expect = 200 } = {}) {
  const response = await fetch(`${baseUrl}${apiPath}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (response.status !== expect) throw new Error(`Expected ${expect}, got ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  const startedAt = new Date().toISOString();
  const first = await startBackend();
  const session = await request('/api/tuition/sessions', { method: 'POST', body: { label: 'Restart test' }, expect: 201 });
  const intent = { recipientId: 'xmu-malaysia', tuitionMyr: 5000, reserveMyr: 1000, deadline: '2026-10-10T09:00:00.000Z', simulateOutcome: 'success' };
  const quote = await request('/api/tuition/quotes', { method: 'POST', token: session.token, body: intent, expect: 201 });
  const confirmation = await request('/api/tuition/confirmations', { method: 'POST', token: session.token, body: { quoteId: quote.id }, expect: 201 });
  const order = await request('/api/tuition/payments', { method: 'POST', token: session.token, body: { confirmationId: confirmation.id, intent }, expect: 201 });
  const before = await request('/api/tuition/state', { token: session.token });
  await stopBackend(first.child);

  const second = await startBackend();
  const after = await request('/api/tuition/state', { token: session.token });
  const passed = after.balances.CNY === before.balances.CNY
    && after.balances.MYR === before.balances.MYR
    && after.orders.length === 1
    && after.orders[0].id === order.id
    && after.receipts.length === 1
    && after.ledger.length === 5;

  const result = {
    taskId: 'T001',
    kind: 'isolated-live-service-restart',
    baseUrl,
    startedAt,
    completedAt: new Date().toISOString(),
    passed,
    firstProcessId: first.child.pid,
    secondProcessId: second.child.pid,
    firstHealthAttempt: first.healthAttempt,
    secondHealthAttempt: second.healthAttempt,
    orderId: order.id,
    receiptId: order.receiptId,
    before: { balances: before.balances, orders: before.orders.length, receipts: before.receipts.length, ledger: before.ledger.length },
    after: { balances: after.balances, orders: after.orders.length, receipts: after.receipts.length, ledger: after.ledger.length },
    stateFileExistedAfterRestart: fs.existsSync(dataPath),
    stderr: [...first.stderr, ...second.stderr].join('').trim(),
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  await stopBackend(second.child);
  if (tempDir.startsWith(os.tmpdir())) fs.rmSync(tempDir, { recursive: true, force: true });
  if (!passed) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error);
  for (const child of processes) {
    if (child.exitCode === null) child.kill();
  }
  if (tempDir.startsWith(os.tmpdir())) fs.rmSync(tempDir, { recursive: true, force: true });
  process.exitCode = 1;
});
