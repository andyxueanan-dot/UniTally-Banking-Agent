import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

// Runs against the normal local banking service. No response mocks and no
// Origin/header stripping. Fresh browser context, virtual test authenticator.
const base = process.env.BANK_TEST_ORIGIN || 'http://localhost:5091';
if (!/^http:\/\/localhost:\d+$/.test(base)) throw Error('Only an explicit localhost test origin is allowed.');
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const output = path.resolve(import.meta.dirname, '../../evidence/T003/root-experience', runId);
fs.mkdirSync(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), base, realModelCalls: 0, attemptsAtRealModel: 0, externalRequests: [], pageErrors: [], checks: [], screenshots: [],
  authenticationDevice: 'Chrome DevTools virtual CTAP2 authenticator, not a human Windows Hello test' };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, timezoneId: 'Asia/Shanghai' });
await context.addInitScript(() => localStorage.setItem('unitally.bank.demo.mode.v1', 'offline'));
await context.route('**/*', async route => {
  const request = route.request();
  if (!request.url().startsWith(base + '/')) { report.externalRequests.push(new URL(request.url()).origin); return route.abort(); }
  if (request.url().endsWith('/api/bank/chat') && !request.postDataJSON()?.demo) { report.attemptsAtRealModel++; return route.abort(); }
  return route.continue();
});
const page = await context.newPage(); page.setDefaultTimeout(18000);
page.on('pageerror', e => report.pageErrors.push(e.message));
const state = () => page.evaluate(async () => {
  const token = localStorage.getItem('unitally.bank.demo.session.v1');
  const response = await fetch('/api/bank/state', { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw Error(`state HTTP ${response.status}`); return response.json();
});
const idle = () => page.waitForFunction(() => !document.querySelector('.ba-working'));
const task = () => page.locator('.ba-task-area .ba-task').first();
async function chat(button) {
  const response = page.waitForResponse(r => /\/api\/bank\/(chat|prepare)$/.test(r.url())); await button.click();
  const r = await response; assert.equal(r.status(), 200); await idle(); return r.json();
}
async function confirm(red = false) {
  const target = task();
  if (red) {
    await target.getByRole('button', { name: '获取演示验证码', exact: true }).click();
    const code = await target.getByTestId('demo-code').innerText(); await target.getByRole('textbox', { name: '输入六位演示验证码' }).fill(code);
  }
  await target.getByRole('checkbox').check(); await target.getByRole('button', { name: '确认执行', exact: true }).click(); await idle();
  await target.getByText(/回执已记录/).waitFor();
}
async function shot(label) {
  await page.evaluate(() => scrollTo(0, 0));
  const file = `${label}.png`; await page.screenshot({ path: path.join(output, file), fullPage: true }); report.screenshots.push(file);
}
async function check(name, fn) {
  const started = performance.now(); await fn(); report.checks.push({ name, passed: true, elapsedMs: Math.round(performance.now() - started) });
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
}
async function manual(action) {
  return page.evaluate(async action => {
    const token = localStorage.getItem('unitally.bank.demo.session.v1');
    const response = await fetch('/api/bank/prepare', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    const result = await response.json(); if (!response.ok) throw Error(result.code); return result;
  }, action);
}
try {
  await check('root URL redirects to independent bank page and offline mode is explicit', async () => {
    await page.goto(base + '/', { waitUntil: 'networkidle' }); await page.getByTestId('balance').waitFor();
    assert.equal(page.url(), base + '/bank-agent');
    await page.getByRole('combobox', { name: '理解需求的方式' }).selectOption('offline');
    assert.equal((await state()).balance, 1286000); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await shot('01-desktop');
  });
  await check('analysis explains category increase and exposes both suspect source records', async () => {
    const r = await chat(page.getByRole('button', { name: '我的钱花在哪了？', exact: true }));
    assert.equal(r.message.results[0].total, 112500); assert.equal(r.message.results[0].drivers[0].deltaCents, 34700);
    await page.locator('.ba-anomaly summary').first().click();
    const text = await page.locator('.ba-anomaly').first().innerText(); assert.match(text, /DEMO-C12/); assert.match(text, /DEMO-C13/);
    await shot('02-explainable-analysis');
  });
  await check('200 yuan transfer visibly requires permission and creates one receipt', async () => {
    await chat(page.getByRole('button', { name: '给小王转 200 元', exact: true }));
    assert.equal((await state()).balance, 1286000); assert.equal(await task().getByRole('button', { name: '确认执行', exact: true }).isDisabled(), true);
    await confirm(); assert.equal((await state()).balance, 1266000); assert.equal((await state()).ledger.length, 1); await shot('03-transfer');
  });
  await check('multi-step plan pauses, resumes with fresh task, settles and advances without repeating debit', async () => {
    await page.getByRole('button', { name: '服务中心', exact: true }).click();
    await page.getByRole('button', { name: '多步协作', exact: true }).click();
    await chat(page.getByRole('button', { name: '体验多步骤固定案例', exact: true }));
    const flow = (await state()).workflows.at(-1); const card = page.getByTestId(`workflow-${flow.id}`);
    const old = (await state()).tasks[0].id;
    await card.getByRole('button', { name: '暂停', exact: true }).click(); await idle();
    assert.equal((await state()).tasks.find(t => t.id === old).status, 'SUPERSEDED');
    await card.getByRole('button', { name: '恢复工作流', exact: true }).click(); await idle(); assert.notEqual((await state()).tasks[0].id, old);
    await confirm(); await card.getByRole('button', { name: '准备下一步', exact: true }).click(); await idle();
    assert.equal((await state()).workflows.at(-1).status, 'SUCCEEDED'); assert.equal((await state()).ledger.length, 2); await shot('04-workflow');
  });
  await check('sandbox environment reports actual worker, not a prefilled claim', async () => {
    await page.getByRole('button', { name: '计算沙箱', exact: true }).click();
    await page.getByText('运行时实测可用', { exact: true }).waitFor();
    const style = await page.getByRole('textbox', { name: 'WAT 代码', exact: true }).evaluate(e => ({ background: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color }));
    assert.equal(style.background, 'rgb(41, 54, 43)'); assert.equal(style.color, 'rgb(236, 240, 223)');
    await page.getByRole('button', { name: '在计算沙箱运行', exact: true }).click();
    await page.getByTestId('sandbox-result').waitFor(); assert.equal(await page.getByTestId('sandbox-result').innerText(), '200');
    assert.equal((await state()).balance, 1246000); await shot('05-isolated-calculation');
  });
  await check('code edits do not reuse stale success; real infinite loop is stopped', async () => {
    await page.getByRole('button', { name: '无限循环拦截', exact: true }).click();
    await page.getByText(/当前编辑已经变化/).waitFor();
    await page.getByRole('button', { name: '在计算沙箱运行', exact: true }).click();
    await page.getByTestId('sandbox-error').waitFor(); assert.equal(await page.getByTestId('sandbox-error').innerText(), 'FUEL_EXHAUSTED');
    assert.equal((await state()).ledger.length, 2); await shot('06-loop-blocked');
  });
  await check('WASI filesystem import is rejected by actual runtime', async () => {
    await page.getByRole('textbox', { name: 'WAT 代码', exact: true }).fill('(module (import "wasi_snapshot_preview1" "path_open" (func)) (func (export "calculate") (param i64 i64) (result i64) i64.const 0))');
    await page.getByRole('button', { name: '在计算沙箱运行', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="sandbox-error"]')?.textContent === 'IMPORTS_FORBIDDEN');
    assert.equal((await state()).balance, 1246000);
  });
  await check('phone layout keeps sandbox controls and code within 320px viewport', async () => {
    await page.setViewportSize({ width: 320, height: 740 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await shot('07-mobile-sandbox'); await page.setViewportSize({ width: 1440, height: 1050 });
  });
  await check('opt-in passkey uses real protocol with a disclosed virtual test authenticator', async () => {
    const cdp = await context.newCDPSession(page); await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    const consent = page.locator('.ba-passkey-consent input'); await consent.check();
    const response = page.waitForResponse(r => r.url().endsWith('/passkey/register/verify'));
    await page.getByRole('button', { name: '为此演示账户绑定设备', exact: true }).click(); assert.equal((await response).status(), 200); await idle(); assert.equal((await state()).auth.mode, 'passkey');
  });
  await check('strong operation cannot downgrade to OTP, signs only after explicit task acknowledgement', async () => {
    await chat(page.getByRole('button', { name: '大额转账', exact: true }));
    assert.equal(await task().getByRole('button', { name: '获取演示验证码', exact: true }).count(), 0);
    const button = task().getByRole('button', { name: '设备验证并执行', exact: true }); assert.equal(await button.isDisabled(), true);
    await task().getByRole('checkbox').check(); const response = page.waitForResponse(r => r.url().endsWith('/passkey/confirm'));
    await button.click(); assert.equal((await response).status(), 200); await idle();
    const s = await state(); assert.equal(s.balance, 1126000); assert.equal(s.tasks[0].verificationMethod, 'passkey'); assert.equal(s.ledger.length, 3); await shot('08-device-confirmed');
  });
  await check('false model-side approval in manual action cannot execute funds', async () => {
    await assert.rejects(manual({ type: 'transfer', recipient: '王明', amount: '200', verified: true, confirmed: true })); assert.equal((await state()).balance, 1126000);
  });
  await check('refresh restores real persisted state and mobile workbench is usable', async () => {
    await page.reload({ waitUntil: 'networkidle' }); await page.getByTestId('balance').waitFor(); assert.equal((await state()).balance, 1126000);
    await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); await shot('09-mobile-final');
  });
  assert.equal(report.attemptsAtRealModel, 0); assert.equal(report.externalRequests.length, 0); assert.equal(report.pageErrors.length, 0); report.passed = true;
} catch (error) { report.passed = false; report.error = error.stack; await shot('failure'); process.exitCode = 1; }
finally { report.completedAt = new Date().toISOString(); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); console.log(JSON.stringify({ ...report, output }, null, 2)); }
