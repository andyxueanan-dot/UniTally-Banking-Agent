import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '..', '..', 'evidence', 'T002');
fs.mkdirSync(root, { recursive: true });
const live = process.argv.includes('--live');
const url = 'http://127.0.0.1:5091/bank-agent';
const results = { startedAt: new Date().toISOString(), mode: live ? 'real-deepseek' : 'offline-fixture-not-ai', checks: [], pageErrors: [], consoleErrors: [], modelCalls: [], screenshots: [] };
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(60000);
page.on('pageerror', e => results.pageErrors.push(e.message));
page.on('console', m => { if (m.type() === 'error') results.consoleErrors.push(m.text()); });
page.on('response', async response => {
  if (response.url().endsWith('/api/bank/chat') && response.ok()) {
    const r = await response.json(); results.modelCalls.push(r.message.meta);
  }
});
async function shot(name) { const file = path.join(root, `${live ? 'live' : 'offline'}-${name}.png`); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: file, fullPage: true }); results.screenshots.push(file); }
async function check(name, fn) { const t = performance.now(); await fn(); results.checks.push({ name, passed: true, elapsedMs: Math.round(performance.now() - t) }); }
async function waitChat(click) { const response = page.waitForResponse(r => r.url().endsWith('/api/bank/chat')); await click(); const r = await response; assert.equal(r.status(), 200, JSON.stringify(await r.json())); await page.getByRole('button', { name: '大额转账', exact: true }).waitFor(); await page.waitForFunction(() => !document.querySelector('.ba-working')); return r.json(); }
async function newestTask() { return page.locator('.ba-task').first(); }
async function confirm(task, red = false) {
  if (red) {
    await task.getByRole('button', { name: '获取演示验证码' }).click();
    await task.getByTestId('demo-code').waitFor();
    const code = await task.getByTestId('demo-code').innerText();
    await task.getByRole('textbox', { name: '输入六位演示验证码' }).fill(code);
  }
  await task.getByRole('checkbox').check();
  await task.getByRole('button', { name: '确认执行' }).click();
  await page.waitForFunction(() => !document.querySelector('.ba-working'));
}
try {
  await check('open actual Chrome and initial desktop layout', async () => {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByTestId('balance').waitFor();
    assert.equal(await page.getByTestId('balance').innerText(), '¥12,860.00');
    if (!live) await page.getByRole('combobox', { name: '理解需求的方式' }).selectOption('offline');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await shot('workbench');
  });
  await check('bill analysis uses 14 source transactions and actual backend totals', async () => {
    const r = await waitChat(() => page.getByRole('button', { name: /我的钱花在哪了/ }).click());
    assert.equal(r.message.results[0].total, 112500); assert.equal(r.message.results[0].rows.length, 14);
    if (live) assert.equal(r.message.meta.provider, 'DeepSeek');
    assert.equal(r.state.balance, 1286000); await shot('analysis');
  });
  await check('small transfer requires confirmation and updates actual sandbox state', async () => {
    const r = await waitChat(() => page.getByRole('button', { name: /给小王转 200 元/ }).click());
    assert.equal(r.state.tasks[0].status, 'AWAITING_CONFIRMATION'); assert.equal(r.state.balance, 1286000);
    const task = await newestTask(); assert.equal(await task.getByRole('button', { name: '确认执行' }).isDisabled(), true);
    await confirm(task); await task.getByText(/回执已记录/).waitFor();
    assert.equal(await page.getByTestId('balance').innerText(), '¥12,660.00'); await shot('transfer-receipt');
  });
  await check('card freeze uses a task-bound demo challenge and changes card state', async () => {
    const r = await waitChat(() => page.getByRole('button', { name: /找不到我的消费卡了/ }).click());
    assert.equal(r.state.tasks[0].risk, 'red'); const task = await newestTask(); await confirm(task, true);
    await task.getByText(/回执已记录/).waitFor(); assert.equal(await page.getByTestId('card-status-8806').innerText(), '已挂失冻结');
    await shot('card-frozen');
  });
  await check('ambiguous contact asks for clarification and does not transfer', async () => {
    const r = await waitChat(() => page.getByRole('button', { name: '同名收款人', exact: true }).click());
    assert.match(r.message.text, /3801|尾号/); assert.equal(r.state.balance, 1266000);
    assert.equal(r.state.tasks.filter(t => t.status === 'AWAITING_CONFIRMATION').length, 0);
  });
  // The error demonstration uses fixed offline planning; its execution is still real local backend behavior.
  await page.getByRole('combobox', { name: '理解需求的方式' }).selectOption('offline');
  await check('simulated timeout reserves balance, no success claim, later reconciles once', async () => {
    const r = await waitChat(() => page.getByRole('button', { name: '模拟接口超时', exact: true }).click());
    assert.equal(r.state.tasks[0].fault, 'timeout'); const task = await newestTask(); await confirm(task);
    await task.getByText(/金额已预留/).waitFor(); assert.equal(await page.getByTestId('balance').innerText(), '¥12,660.00');
    await shot('timeout-pending'); await task.getByRole('button', { name: '模拟后台对账' }).click();
    await task.getByText(/回执已记录/).waitFor(); assert.equal(await page.getByTestId('balance').innerText(), '¥12,460.00');
  });
  await check('large transfer cannot confirm without demo code; cancellation works', async () => {
    const r = await waitChat(() => page.getByRole('button', { name: '大额转账', exact: true }).click());
    assert.equal(r.state.tasks[0].risk, 'red'); const task = await newestTask();
    await task.getByRole('checkbox').check(); assert.equal(await task.getByRole('button', { name: '确认执行' }).isDisabled(), true);
    await shot('red-verification'); await task.getByRole('button', { name: '取消任务' }).click(); await task.getByText('已取消', { exact: true }).waitFor();
  });
  await check('refresh restores session, receipts and card state', async () => {
    await page.reload({ waitUntil: 'networkidle' }); await page.getByTestId('balance').waitFor();
    assert.equal(await page.getByTestId('balance').innerText(), '¥12,460.00');
    assert.equal(await page.getByTestId('card-status-8806').innerText(), '已挂失冻结');
  });
  await check('audit view exports a usable record and contains no credential fields', async () => {
    await page.getByRole('button', { name: /操作记录/ }).click();
    await page.getByText('可核查的操作时间线').waitFor();
    const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: '导出记录' }).click();
    const download = await downloadPromise; const target = path.join(root, `${live ? 'live' : 'offline'}-audit-export.json`); await download.saveAs(target);
    const exported = fs.readFileSync(target, 'utf8'); assert.ok(!exported.includes('DEEPSEEK_API_KEY')); assert.ok(!exported.includes('Bearer '));
    assert.equal(JSON.parse(exported).ledger.length, 2); await shot('audit');
  });
  await check('mobile width 390 has no horizontal overflow and a usable composer', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: '工作台', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await page.getByRole('textbox', { name: '告诉助手你想做什么' }).scrollIntoViewIfNeeded(); await shot('mobile');
  });
  assert.equal(results.pageErrors.length, 0); assert.equal(results.consoleErrors.length, 0);
  results.passed = true;
} catch (e) {
  results.passed = false; results.error = e.stack; await shot('failure'); process.exitCode = 1;
} finally {
  results.completedAt = new Date().toISOString();
  fs.writeFileSync(path.join(root, `browser-${live ? 'live' : 'offline'}.json`), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2)); await browser.close();
}
