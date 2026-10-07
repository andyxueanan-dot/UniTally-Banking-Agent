import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const base = 'http://localhost:8091';
const outDir = path.resolve(import.meta.dirname, '../../evidence/T008-quality/browser', new Date().toISOString().replaceAll(':','-').replaceAll('.','-'));
fs.mkdirSync(outDir, { recursive: true });
const report = { startedAt: new Date().toISOString(), checks: [], pageErrors: [], screenshots: [], forbiddenModelCalls: 0, realDevice: false };
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1, hasTouch: true });
await context.addInitScript(() => localStorage.setItem('unitally.bank.demo.mode.v1', 'offline'));
await context.route('**/api/bank/chat', route => {
  if (!route.request().postDataJSON()?.demo) { report.forbiddenModelCalls++; return route.abort(); }
  return route.continue();
});
const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', error => report.pageErrors.push(error.message));
const shot = async name => { await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true }); report.screenshots.push(`${name}.png`); };
const state = () => page.evaluate(async()=>fetch('/api/bank/state',{headers:{Authorization:`Bearer ${localStorage.getItem('unitally.bank.demo.session.v1')}`}}).then(r=>r.json()));
const idle = () => page.waitForFunction(()=>!document.querySelector('.ba-working'));
async function check(name, action) { await action(); report.checks.push({name,passed:true}); }
try {
  await check('mobile entry has four destinations, valid server balance and no legacy Firebase page', async()=>{
    await page.goto(base, {waitUntil:'networkidle'}); await page.getByTestId('balance').waitFor();
    const nav=page.getByRole('navigation',{name:'手机主导航'}); assert.equal(await nav.getByRole('button').count(),4);
    assert.equal((await state()).balance,1286000); assert.equal(await page.locator('.bm-welcome').isVisible(),true);
    assert.equal(await page.locator('.ba-assistant').isVisible(),false);
    assert.equal(await page.locator('.ba-spending-panel').count(),0);
    assert.equal(await page.locator('.v2-ledger li').count(),5);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false); await shot('01-home');
  });
  await check('chat entry shows only focused assistant, not desktop financial panels',async()=>{
    await page.getByRole('button',{name:'转账汇款',exact:true}).click();
    const dialog=page.getByRole('dialog');await dialog.waitFor();
    assert.equal(await dialog.getByRole('button',{name:'下一步：核对详情',exact:true}).isDisabled(),true);
    await dialog.getByRole('combobox',{name:'手机收款人'}).selectOption('wang');
    await dialog.getByRole('textbox',{name:'手机转账金额'}).fill('99999');
    await dialog.getByRole('button',{name:'下一步：核对详情',exact:true}).click();await idle();
    await dialog.getByRole('alert').waitFor();assert.match(await dialog.getByRole('alert').innerText(),/可用余额|无法转出/);
    assert.equal((await state()).balance,1286000);
    await dialog.getByRole('textbox',{name:'手机转账金额'}).fill('50');
    await dialog.getByRole('button',{name:'下一步：核对详情',exact:true}).click();await idle();
    assert.equal((await state()).balance,1286000);
    const manualTask=page.locator('.ba-left-content .ba-task').first();
    assert.match(await manualTask.innerText(),/50.00/);await manualTask.getByRole('button',{name:'取消任务',exact:true}).click();await idle();
    await page.getByRole('button',{name:'助手',exact:true}).click(); assert.equal(await page.locator('.ba-assistant').isVisible(),true);
    assert.equal(await page.locator('.ba-stats').isVisible(),false); await shot('02-assistant');
  });
  await check('transfer prepares a pending task page and cannot spend without confirmation',async()=>{
    await page.getByRole('button',{name:'给小王转 200 元',exact:true}).click(); await idle();
    await page.getByRole('button',{name:'待办事项',exact:true}).getAttribute('aria-current').then(v=>assert.equal(v,'page'));
    const card=page.locator('.ba-left-content .ba-task').first(); await card.waitFor();
    assert.equal((await state()).balance,1286000); assert.equal(await card.getByRole('button',{name:'确认执行',exact:true}).isDisabled(),true);
    await shot('03-prefilled-confirmation');
    await card.getByRole('checkbox').check(); await card.getByRole('button',{name:'确认执行',exact:true}).click(); await idle();
    assert.equal((await state()).balance,1266000); assert.equal((await state()).ledger.length,1);
    await page.getByRole('button',{name:'全部',exact:true}).click(); await page.getByText(/回执已记录/).first().waitFor(); await shot('04-receipt');
  });
  await check('home reaches services, back returns home, profile shows account facts; manual card flow still uses the shared policy backend',async()=>{
    await page.getByRole('button',{name:'首页',exact:true}).click(); await page.getByRole('button',{name:'更多服务',exact:true}).click();
    await page.getByRole('button',{name:'订阅与代扣',exact:true}).waitFor(); assert.equal(await page.locator('.ba-assistant').isVisible(),false);
    await page.getByRole('button',{name:'返回上一页',exact:true}).click(); assert.equal(await page.locator('.bm-welcome').isVisible(),true); await page.getByRole('button',{name:'个人中心',exact:true}).click(); assert.equal(await page.locator('.bm-profile-panel').isVisible(),true); assert.equal(await page.locator('.v3-account').isVisible(),true); await shot('05-profile');
  });
  await check('native back event navigates without executing or changing balance',async()=>{
    await page.getByRole('button',{name:'助手',exact:true}).click(); await page.evaluate(()=>window.dispatchEvent(new Event('bank-mobile-back',{cancelable:true})));
    await page.locator('.bm-profile-panel').waitFor(); assert.equal((await state()).balance,1266000);
  });
  await check('320px layout, keyboard class behavior, and reload persistence',async()=>{
    await page.setViewportSize({width:320,height:740}); await page.getByRole('button',{name:'助手',exact:true}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.evaluate(()=>document.documentElement.classList.add('bank-keyboard-open'));
    assert.equal(await page.getByRole('navigation',{name:'手机主导航'}).isVisible(),false);
    await page.evaluate(()=>document.documentElement.classList.remove('bank-keyboard-open'));
    await page.reload({waitUntil:'networkidle'}); await page.getByTestId('balance').waitFor(); assert.equal((await state()).balance,1266000); await shot('06-home-320');
  });
  await check('native shell without an approved backend makes no bank requests and states the limitation',async()=>{
    const nativeContext=await browser.newContext({viewport:{width:390,height:844}});
    await nativeContext.addInitScript(()=>{window.androidBridge={};});
    const nativePage=await nativeContext.newPage(); nativePage.on('pageerror',e=>report.pageErrors.push(e.message)); let api=0; nativePage.on('request',r=>{if(r.url().includes('/api/bank'))api++;});
    await nativePage.goto(base,{waitUntil:'networkidle'}); await nativePage.getByRole('alert').waitFor();
    assert.match(await nativePage.getByRole('alert').innerText(),/尚未配置|HTTPS/); assert.equal(api,0);
    await nativePage.screenshot({path:path.join(outDir,'07-unconfigured-native.png'),fullPage:true});report.screenshots.push('07-unconfigured-native.png');await nativeContext.close();
  });
  await check('desktop workbench remains independent and still loads its original navigation',async()=>{
    const desktop=await browser.newContext({viewport:{width:1440,height:1000}});const p=await desktop.newPage();
    p.on('pageerror',e=>report.pageErrors.push(e.message));
    await p.goto('http://localhost:5091/bank-agent',{waitUntil:'networkidle'});await p.getByTestId('balance').waitFor();
    assert.equal(await p.locator('.bm-app').count(),0);assert.equal(await p.getByRole('navigation',{name:'主要功能'}).isVisible(),true);
    await p.getByRole('button',{name:'服务中心',exact:true}).click();await p.getByRole('button',{name:'订阅与代扣',exact:true}).waitFor();await desktop.close();
  });
  await check('clean service directory and backend-enforced simulated card purchase', async()=>{
    await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'首页',exact:true}).click();
    await page.getByRole('button',{name:'更多服务',exact:true}).click();
    const directory=page.locator('.bm-service-directory');await directory.waitFor();
    assert.ok((await directory.boundingBox()).height<650);assert.equal(await page.locator('.ba-settings-disclosure[open]').count(),0);await shot('08-services');
    await page.getByRole('button',{name:'扩展卡服务',exact:true}).click();
    await page.locator('.ba-extended-card').filter({hasText:'8806'}).getByRole('button',{name:'限制线上新交易',exact:true}).click();await idle();
    const task=page.locator('.ba-left-content .ba-task').first();await task.waitFor();
    await task.getByRole('button',{name:'获取演示验证码',exact:true}).click();await task.getByTestId('demo-code').waitFor();
    await task.getByRole('textbox',{name:'输入六位演示验证码'}).fill(await task.getByTestId('demo-code').innerText());
    await task.getByRole('checkbox').check();await task.getByRole('button',{name:'确认执行',exact:true}).click();await idle();
    await page.getByRole('button',{name:'首页',exact:true}).click();await page.getByRole('button',{name:'更多服务',exact:true}).click();await page.getByRole('button',{name:'扩展卡服务',exact:true}).click();
    await page.locator('.ba-card-payment-demo>summary').click();
    await page.getByRole('textbox',{name:'模拟刷卡金额',exact:true}).fill('20');await page.getByRole('button',{name:'准备模拟刷卡',exact:true}).click();
    await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/限制线上交易/);assert.equal((await state()).balance,1266000);await shot('09-card-blocked');
    await page.getByRole('combobox',{name:'模拟刷卡场景',exact:true}).selectOption('domestic-offline');await page.getByRole('button',{name:'准备模拟刷卡',exact:true}).click();await idle();
    const payment=page.locator('.ba-left-content .ba-task').first();await payment.getByRole('button',{name:'获取演示验证码',exact:true}).click();await payment.getByTestId('demo-code').waitFor();
    await payment.getByRole('textbox',{name:'输入六位演示验证码'}).fill(await payment.getByTestId('demo-code').innerText());await payment.getByRole('checkbox').check();
    await payment.getByRole('button',{name:'确认执行',exact:true}).click();await idle();assert.equal((await state()).balance,1264000);assert.equal((await state()).ledger.length,2);await shot('10-card-receipt');
    await page.getByRole('button',{name:'助手',exact:true}).click();assert.equal(await page.locator('.ba-assistant .ba-task-area').count(),0);assert.equal(await page.locator('.ba-test-cases').getAttribute('open'),null);await shot('11-assistant-clean');
  });
  assert.equal(report.forbiddenModelCalls,0); assert.equal(report.pageErrors.length,0); report.passed=true;
} catch(error) { report.passed=false;report.error=error.stack;await shot('failure');process.exitCode=1; }
finally { report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(outDir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,outDir},null,2));await browser.close(); }
