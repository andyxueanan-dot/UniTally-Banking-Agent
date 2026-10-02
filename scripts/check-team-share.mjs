import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, '.cache/team-share/access.json'), 'utf8'));
const out = path.resolve(root, '../evidence/T007-team-share', new Date().toISOString().replaceAll(':', '-'));
fs.mkdirSync(out, { recursive: true });
const report = { origin: config.origin, at: new Date().toISOString(), expiresAt: new Date(config.expiresAt).toISOString(), dnsOverride: false, checks: [], pageErrors: [], paidCalls: 0, physicalPhoneTested: false };
const executablePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true });
  let probe = await browser.newPage();
  try { await probe.goto(config.origin + '/team/login', { timeout: 15000 }); }
  catch (error) {
    report.normalBrowserError = error.message;
    await browser.close();
    const hostname = new URL(config.origin).hostname;
    const dns = await fetch('https://cloudflare-dns.com/dns-query?name=' + hostname + '&type=A', { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(10000) }).then(r => r.json());
    const ip = dns.Answer?.find(r => r.type === 1)?.data;
    if (!ip) throw error;
    report.dnsOverride = true;
    report.dnsSource = 'Cloudflare DNS-over-HTTPS A record; browser-process-only mapping, TLS verification retained';
    browser = await chromium.launch({ executablePath, headless: true, args: [`--host-resolver-rules=MAP ${hostname} ${ip}`] });
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route('**/api/bank/chat', route => {
    if (!route.request().postDataJSON()?.demo) { report.paidCalls++; return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', e => report.pageErrors.push(e.message));
  await page.goto(config.origin, { waitUntil: 'networkidle' });
  assert.equal(new URL(page.url()).pathname, '/team/login');
  await page.screenshot({ path: path.join(out, '01-login.png'), fullPage: true });
  assert.equal(await page.evaluate(() => fetch('/api/bank/health').then(r => r.status)), 401);
  report.checks.push('Unauthenticated HTTPS page/API protected');
  await page.getByLabel('团队访问口令').fill('incorrect-password');
  await page.getByRole('button', { name: '进入演示' }).click();
  await page.getByRole('alert').waitFor();
  await page.getByLabel('团队访问口令').fill(config.password);
  await page.getByRole('button', { name: '进入演示' }).click();
  await page.getByTestId('balance').waitFor();
  assert.equal(new URL(page.url()).pathname, '/');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const health = await page.evaluate(() => fetch('/api/bank/health').then(r => r.json()));
  assert.equal(health.aiConfigured, true); assert.equal(health.maxDailyCalls, 20); assert.equal(health.auth.canRegister, false);
  report.health = { aiConfigured: health.aiConfigured, maxDailyCalls: health.maxDailyCalls, aiCallsToday: health.aiCallsToday };
  report.checks.push('Wrong password rejected; valid login loads mobile home; AI configured, limit 20');
  await page.screenshot({ path: path.join(out, '02-mobile-home.png'), fullPage: true });
  await page.getByRole('button', { name: '助手', exact: true }).click();
  await page.locator('.ba-assistant select').selectOption('offline');
  await page.getByRole('button', { name: '给小王转 200 元', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.ba-working'));
  const card = page.locator('.ba-left-content .ba-task').first(); await card.waitFor();
  assert.equal(await card.getByRole('button', { name: '确认执行', exact: true }).isDisabled(), true);
  await card.getByRole('checkbox').check();
  await card.getByRole('button', { name: '确认执行', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.ba-working'));
  const state = await page.evaluate(() => fetch('/api/bank/state', { headers: { Authorization: 'Bearer ' + localStorage.getItem('unitally.bank.demo.session.v1') } }).then(r => r.json()));
  assert.equal(state.balance, 1266000); assert.equal(state.ledger.length, 1);
  report.checks.push('External HTTPS offline transfer requires confirmation, then records exactly one simulated receipt');
  await page.screenshot({ path: path.join(out, '03-receipt.png'), fullPage: true });
  await page.goto(config.origin + '/team');
  await page.getByRole('button', { name: '退出团队登录' }).click();
  assert.equal(new URL(page.url()).pathname, '/team/login');
  assert.equal(await page.evaluate(() => fetch('/api/bank/health').then(r => r.status)), 401);
  report.checks.push('Logout revokes gateway access');
  assert.equal(report.paidCalls, 0); assert.deepEqual(report.pageErrors, []);
  report.passed = true;
} catch (error) { report.passed = false; report.error = error.message; process.exitCode = 1; }
finally { if (browser) await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ...report, evidence: out })); }
