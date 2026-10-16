// Walkthrough for the features learned from other products (2026-10-16): IM simulator binding and the
// yellow/red split, scam questionnaire + cooling-off, trade PIN as second factor, home reminders,
// "找人工" with a handoff summary. Needs the backend on 5091 and `npm run mobile:preview` on 8091.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const base = 'http://localhost:8091';
const outDir = path.resolve(import.meta.dirname, '../../review-2026-10-16/walkthrough');
fs.mkdirSync(outDir, { recursive: true });
const report = { startedAt: new Date().toISOString(), checks: [], pageErrors: [], screenshots: [] };
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2, hasTouch: true });
await context.addInitScript(() => localStorage.setItem('unitally.bank.demo.mode.v1', 'offline'));
const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => report.pageErrors.push(e.message));
const shot = async (name, full = false) => { await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: full }); report.screenshots.push(`${name}.png`); };
const state = () => page.evaluate(async () => fetch('/api/bank/state', { headers: { Authorization: `Bearer ${localStorage.getItem('unitally.bank.demo.session.v1')}` } }).then(r => r.json()));
const idle = () => page.waitForFunction(() => !document.querySelector('.ba-working'));
const nav = name => page.getByRole('navigation', { name: '手机主导航' }).getByRole('button', { name, exact: true }).click();
const card = () => page.locator('.ba-left-content .ba-task').first();
async function verify(task) {
  await task.getByRole('button', { name: '获取演示验证码', exact: true }).click(); await task.getByTestId('demo-code').waitFor();
  await task.getByRole('textbox', { name: '输入六位演示验证码' }).fill(await task.getByTestId('demo-code').innerText());
}
async function transfer(recipient, amount) {
  await nav('首页'); await page.getByRole('button', { name: '转账汇款', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.waitFor();
  await dialog.getByRole('combobox', { name: '手机收款人' }).selectOption(recipient);
  await dialog.getByRole('textbox', { name: '手机转账金额' }).fill(amount);
  await dialog.getByRole('button', { name: '下一步：核对详情', exact: true }).click(); await idle();
}
async function check(name, fn) { await fn(); report.checks.push({ name, passed: true }); }
try {
  await check('home shows rule-based reminders that only navigate', async () => {
    await page.goto(base, { waitUntil: 'networkidle' }); await page.getByTestId('balance').waitFor();
    const box = page.locator('.v3-insights'); await box.waitFor();
    assert.ok(await box.locator('li').count() >= 1); assert.match(await box.innerText(), /同一天扣了|首次出现的商户/);
    await box.scrollIntoViewIfNeeded(); await shot('01-home-reminders');
  });
  await check('large first-time transfer asks three questions; all "no" starts a cooling-off countdown', async () => {
    await transfer('li', '3000');
    const t = card(); await t.locator('.v3-fraud').waitFor();
    assert.equal(await t.getByRole('button', { name: '确认执行', exact: true }).isDisabled(), true);
    await t.locator('.v3-fraud').scrollIntoViewIfNeeded(); await shot('02-fraud-questions');
    for (const g of await t.locator('.v3-fraud li [role=group]').all()) await g.getByRole('button', { name: '否', exact: true }).click();
    await t.getByRole('button', { name: '提交回答', exact: true }).click(); await idle();
    await t.locator('.v3-cooling').waitFor(); assert.match(await t.locator('.v3-cooling').innerText(), /冷静期还剩 \d+ 秒/);
    assert.equal(await t.getByRole('button', { name: '确认执行', exact: true }).isDisabled(), true);
    assert.equal((await state()).balance, 1286000); await t.locator('.v3-cooling').scrollIntoViewIfNeeded(); await shot('03-cooling-off');
    await t.getByRole('button', { name: '取消任务', exact: true }).click(); await idle();
  });
  await check('IM simulator: pairing code approved in the page, green answers, yellow gets a one-time code, red only a web link', async () => {
    await nav('个人中心'); await page.getByRole('button', { name: /IM 渠道/ }).click();
    const im = page.locator('.v3-im'); await im.waitFor();
    const send = async text => { await im.getByRole('textbox', { name: '以 IM 用户身份发消息' }).fill(text); await im.getByRole('button', { name: '发送' }).click(); await page.waitForFunction(n => document.querySelectorAll('.v3-im-lines p.bot').length > n, await im.locator('.v3-im-lines p.bot').count()); };
    await send('你好'); assert.match(await im.locator('.v3-im-lines').innerText(), /配对码：/);
    await im.getByRole('button', { name: '查看是谁在申请', exact: true }).click(); await im.locator('.v3-im-preview').waitFor();
    await im.getByRole('button', { name: '确认绑定', exact: true }).click(); await im.getByText('已绑定').waitFor();
    await send('我的余额'); await send('给小王转 200');
    const yellow = (await im.locator('.v3-im-lines p.bot').last().innerText()); const m = yellow.match(/确认\s*([A-Z0-9]{4})/);
    assert.ok(m, `yellow reply carries a code: ${yellow}`);
    await send(`确认 ${m[1]}`); assert.match(await im.locator('.v3-im-lines p.bot').last().innerText(), /成功|已执行|回执/);
    await send('给李悦转 1200');
    assert.match(await im.locator('.v3-im-lines').innerText(), /#task=/);
    await im.locator('.v3-im-chat').evaluate(e => e.scrollIntoView({ block: 'end' })); await page.waitForTimeout(300); await shot('05-im-simulator');
    await im.getByRole('button', { name: /去网页验证/ }).last().click(); await card().waitFor();
    assert.match(await card().innerText(), /1,200|1200/); await shot('05b-im-red-opens-web');
    await card().getByRole('button', { name: '取消任务', exact: true }).click(); await idle();
  });
  await check('trade PIN, once set, is a second factor on red operations', async () => {
    await nav('个人中心'); await page.getByRole('button', { name: /设置交易密码/ }).click(); await idle();
    let t = card(); await verify(t);
    const pins = t.locator('.v3-pin input'); await pins.nth(0).fill('583920'); await pins.nth(1).fill('583920');
    await t.getByRole('checkbox').check(); await t.getByRole('button', { name: '确认执行', exact: true }).click(); await idle();
    assert.equal((await state()).tradePinSet, true);
    const before = (await state()).balance;
    await transfer('wang', '1500'); t = card(); await t.locator('.v3-pin-factor').waitFor();
    await verify(t); await t.getByRole('checkbox').check();
    assert.equal(await t.getByRole('button', { name: '确认执行', exact: true }).isDisabled(), true, 'PIN still empty');
    await t.locator('.v3-pin-factor input').fill('583920'); await t.locator('.v3-pin-factor').evaluate(e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300); await shot('04-trade-pin');
    await t.getByRole('button', { name: '确认执行', exact: true }).click(); await idle();
    assert.equal((await state()).balance, before - 150000);
  });
  await check('"找人工" opens a ticket whose summary the desk can read without asking again', async () => {
    await nav('助手'); await page.getByRole('button', { name: '找人工', exact: true }).click(); await idle();
    await nav('个人中心'); await page.getByRole('button', { name: /人工客服工作台/ }).click();
    const summary = page.locator('.v3-case-summary').first(); await summary.waitFor(); assert.match(await summary.innerText(), /交接摘要/);
    await shot('06-desk-summary');
  });
  await check('any "yes" in the questionnaire stops the transfer and pauses sensitive operations', async () => {
    await transfer('chen2', '5000'); const t = card(); await t.locator('.v3-fraud').waitFor();
    const groups = await t.locator('.v3-fraud li [role=group]').all();
    await groups[0].getByRole('button', { name: '是', exact: true }).click();
    for (const g of groups.slice(1)) await g.getByRole('button', { name: '否', exact: true }).click();
    await t.getByRole('button', { name: '提交回答', exact: true }).click(); await idle();
    const s = await state(); assert.equal(s.riskLock?.rule, 'FRAUD_SUSPECTED'); assert.equal(s.balance, 1286000 - 150000 - 20000);
    await page.locator('.v3-risk-banner').waitFor(); await shot('07-fraud-stopped');
    await nav('助手'); const msg = page.getByText(/96110/).last(); await msg.waitFor(); await page.waitForTimeout(800); await msg.evaluate(e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300); await shot('08-fraud-message');
  });
  report.passed = true;
} catch (e) {
  report.passed = false; report.error = String(e?.stack || e); await shot('zz-failure', true).catch(() => {});
} finally {
  report.completedAt = new Date().toISOString(); fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close(); console.log(JSON.stringify(report, null, 2)); if (!report.passed) process.exitCode = 1;
}
