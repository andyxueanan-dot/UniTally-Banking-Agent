import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
const require=createRequire(import.meta.url);
const {createBankApp}=require('../backend/bank-server');const {createBankStore}=require('../backend/bank/store');
const out=path.resolve(import.meta.dirname,'../../evidence/T010-planner-review/browser',new Date().toISOString().replaceAll(':','-'));
fs.mkdirSync(out,{recursive:true});let calls=0;
const planner={configured:true,provider:'FixtureAI (test double)',model:'not-a-real-model',async plan(text){calls++;if(text.includes('模拟故障'))throw Object.assign(Error('AI 暂不可用：这是独立测试后端，不会自动降级。'),{code:'AI_UNAVAILABLE'});return{actions:[{type:'transfer',recipient:'王明',amount:'200'}],question:'',meta:{mode:'ai',provider:'FixtureAI (test double)',model:'not-a-real-model',latencyMs:1,totalTokens:0}};}};
const {app}=createBankApp({store:createBankStore(),planner,passkeyOrigin:'http://localhost:5198'});
const server=await new Promise((resolve,reject)=>{const s=app.listen(5198,'127.0.0.1',()=>resolve(s));s.on('error',reject)});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const report={classification:'UI test with isolated in-memory mocked provider; NOT a paid model test',paidCalls:0,checks:[],pageErrors:[]};
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.goto('http://localhost:5198/mobile',{waitUntil:'networkidle'});await page.getByTestId('balance').waitFor();await page.getByRole('button',{name:'助手',exact:true}).click();
 const input=page.getByRole('textbox',{name:'告诉助手你想做什么'});await input.fill('给王明转200元');await page.getByRole('button',{name:'发送需求'}).click();await page.locator('.ba-left-content .ba-task').first().waitFor();
 await page.getByRole('button',{name:'助手',exact:true}).click();await page.locator('.ba-planner-feedback>summary').click();await page.getByRole('textbox',{name:'纠正说明'}).fill('金额应为100元，请先别执行。');await page.getByRole('button',{name:'提交纠正',exact:true}).click();await page.getByText('已记录，待审核。',{exact:true}).waitFor();
 const state=()=>page.evaluate(()=>fetch('/api/bank/state',{headers:{Authorization:'Bearer '+localStorage.getItem('unitally.bank.demo.session.v1')}}).then(r=>r.json()));
 let s=await state();assert.equal(s.feedbackCount,1);assert.equal(s.tasks[0].status,'SUPERSEDED');assert.equal(s.balance,1286000);assert.equal(s.ledger.length,0);assert.equal(calls,1);
 report.checks.push('Feedback UI saves correction, invalidates only pending proposal, no execution or new model call');await page.screenshot({path:path.join(out,'01-feedback.png'),fullPage:true});
 await input.fill('模拟故障');await page.getByRole('button',{name:'发送需求'}).click();await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/AI 暂不可用/);assert.equal(await page.getByRole('combobox',{name:'理解需求的方式'}).inputValue(),'ai');
 s=await state();assert.equal(s.balance,1286000);assert.equal(s.history.length,2);assert.equal(calls,2);report.checks.push('AI error visible; no offline switch, fabricated answer or debit');await page.screenshot({path:path.join(out,'02-provider-unavailable.png'),fullPage:true});
 await page.getByRole('button',{name:'我的',exact:true}).click();await page.getByText('模型纠错记录 · 1 条',{exact:true}).click();await page.getByRole('button',{name:'导出待审核纠错'}).waitFor();report.checks.push('Private review export discoverable under profile');
 assert.deepEqual(report.pageErrors,[]);report.passed=true;
}catch(e){report.passed=false;report.error=e.message;process.exitCode=1}
finally{report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,evidence:out}));await browser.close();await new Promise(resolve=>server.close(resolve));}
