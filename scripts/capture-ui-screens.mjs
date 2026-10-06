// Capture the same walk-through of the mobile interface from any entry, so two
// builds (for example the current mobile entry on 8091 and the V2 preview on 8092)
// can be compared side by side. Offline cases only: any non-demo model call is aborted.
//
//   node scripts/capture-ui-screens.mjs http://127.0.0.1:8092 .cache/ui-screens/v2
//
// Requires the bank backend on 5091 and headless Chrome at CHROME_PATH (default below).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const [base = 'http://127.0.0.1:8092', outArg = ''] = process.argv.slice(2);
const outDir = path.resolve(outArg || path.join('.cache', 'ui-screens', new Date().toISOString().replace(/[:.]/g, '-')));
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2, hasTouch: true, locale: 'zh-CN' });
await context.addInitScript(() => localStorage.setItem('unitally.bank.demo.mode.v1', 'offline'));
let blockedModelCalls = 0;
await context.route('**/api/bank/chat', route => {
  if (!route.request().postDataJSON()?.demo) { blockedModelCalls++; return route.abort(); }
  return route.continue();
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
const saved = [];
const idle = async () => { await page.waitForFunction(() => !document.querySelector('.ba-working')); await page.waitForTimeout(400); };
// Full-page captures keep position:fixed bars where the viewport was; pin them to the
// document edges for the shot so the gallery reads like one tall phone screen.
const pinBars = () => page.evaluate(() => {
  window.scrollTo(0, 0);
  const header = document.querySelector('.bm-header'); const nav = document.querySelector('.bm-bottom-nav'); const app = document.querySelector('.bm-app');
  if (header) { header.dataset.capture = header.style.cssText; header.style.position = 'absolute'; header.style.top = '0'; }
  if (nav && app) { nav.dataset.capture = nav.style.cssText; nav.style.position = 'absolute'; nav.style.bottom = 'auto'; nav.style.top = `${Math.max(document.documentElement.scrollHeight, app.offsetHeight) - nav.offsetHeight}px`; }
});
const unpinBars = () => page.evaluate(() => { for (const el of document.querySelectorAll('.bm-header, .bm-bottom-nav')) { el.style.cssText = el.dataset.capture || ''; delete el.dataset.capture; } });
const shot = async name => {
  await page.waitForTimeout(700); await pinBars(); await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
  await unpinBars(); saved.push(name); console.log('saved', name);
};
const nav = name => page.getByRole('navigation', { name: '手机主导航' }).getByRole('button', { name, exact: true }).click();
const service = async name => { await page.getByRole('button', { name, exact: true }).click(); await page.waitForTimeout(300); };
const backToServices = async () => { await page.getByRole('button', { name: '← 全部服务' }).click(); await page.getByRole('button', { name: '订阅与代扣', exact: true }).waitFor(); };

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByTestId('balance').waitFor();
  await shot('01-home');

  await nav('助手'); await shot('02-assistant-empty');
  await page.getByRole('button', { name: '我的钱花在哪了？', exact: true }).click(); await idle(); await shot('03-assistant-analysis');

  await page.getByRole('button', { name: '给小王转 200 元', exact: true }).click(); await idle();
  await page.locator('.ba-left-content .ba-task').first().waitFor(); await shot('04-pending-confirmation');
  const card = page.locator('.ba-left-content .ba-task').first();
  await card.getByRole('checkbox').check(); await card.getByRole('button', { name: '确认执行', exact: true }).click(); await idle();
  await page.getByRole('button', { name: '全部', exact: true }).click(); await page.getByText(/回执已记录/).first().waitFor(); await shot('05-receipt');

  await nav('助手'); await page.getByRole('button', { name: '找不到我的消费卡了', exact: true }).click(); await idle();
  const redTask = page.locator('.ba-left-content .ba-task').first(); await redTask.waitFor();
  await redTask.getByRole('button', { name: '获取演示验证码', exact: true }).click(); await idle(); await shot('06-red-verification');

  await nav('我的'); await shot('07-profile');
  await page.getByRole('button', { name: /服务与安全设置/ }).click(); await page.getByRole('button', { name: '订阅与代扣', exact: true }).waitFor(); await shot('08-services');
  await service('订阅与代扣'); await shot('09-subscriptions'); await backToServices();
  await service('模拟理财'); await shot('10-wealth'); await backToServices();
  await service('扩展卡服务'); await shot('11-cards-extended'); await backToServices();
  await service('账户规则与风控'); await shot('12-policy'); await backToServices();
  await service('多步协作'); await page.getByRole('button', { name: '体验多步骤固定案例' }).click(); await idle(); await shot('13-workflow'); await backToServices();
  await service('AA 与生活计划'); await shot('14-life'); await backToServices();
  await service('计算沙箱'); await page.waitForTimeout(1500); await shot('15-sandbox');

  await nav('首页'); await page.getByRole('button', { name: '查账单', exact: true }).click(); await shot('16-bills');
  await nav('首页'); await page.getByRole('button', { name: '管卡片', exact: true }).click(); await shot('17-cards');
  await nav('首页'); await page.getByRole('button', { name: '转一笔钱', exact: true }).click(); await page.getByRole('dialog').waitFor(); await shot('18-transfer-sheet'); await page.keyboard.press('Escape');
  await nav('我的'); await page.getByRole('button', { name: /功能与演示边界/ }).click(); await page.getByRole('dialog').waitFor(); await shot('19-guide-modal'); await page.keyboard.press('Escape');
  await nav('待办'); await shot('20-tasks-all');
} finally {
  fs.writeFileSync(path.join(outDir, 'capture.json'), JSON.stringify({ base, capturedAt: new Date().toISOString(), saved, pageErrors, blockedModelCalls, viewport: '390x844@2x' }, null, 2));
  await browser.close();
}
console.log(`done: ${saved.length} screenshots in ${outDir}; page errors: ${pageErrors.length}; blocked model calls: ${blockedModelCalls}`);
if (pageErrors.length) { console.error(pageErrors.join('\n')); process.exitCode = 1; }
