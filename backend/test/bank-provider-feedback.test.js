const {test}=require('node:test');const assert=require('node:assert/strict');
const {createCompatiblePlanner,createDeepSeekPlanner,plannerFromEnvironment}=require('../bank/planner');
const {BankService}=require('../bank/service');const {createBankStore}=require('../bank/store');
const reply=actions=>({ok:true,json:async()=>({model:'mock-model',usage:{total_tokens:10},choices:[{message:{tool_calls:[{function:{name:'plan_banking_request',arguments:JSON.stringify({actions,question:''})}}]}}]})});
test('compatible provider preserves validated tool contract and truthful metadata',async()=>{
 let calls=0;const p=createCompatiblePlanner({apiKey:'test-only',model:'configured-model',endpoint:'https://example.invalid/v1/chat/completions',provider:'TestProvider',fetchImpl:async(url,request)=>{calls++;assert.equal(request.redirect,'error');assert.equal(url,'https://example.invalid/v1/chat/completions');return reply([{type:'balance'}]);}});
 const r=await p.plan('查余额',[]);assert.equal(calls,1);assert.equal(r.meta.mode,'ai');assert.equal(r.meta.provider,'TestProvider');assert.equal(r.meta.model,'mock-model');
});
test('provider outage performs no hidden fallback and never returns fake green success',async()=>{
 let calls=0;const p=createDeepSeekPlanner({apiKey:'test-only',fetchImpl:async()=>{calls++;throw Error('not exposed');}});
 const s=new BankService({store:createBankStore(),planner:p,ruleFastPath:false});const {token}=s.create();
 await assert.rejects(()=>s.chat(token,{text:'查余额'}),e=>e.code==='AI_UNAVAILABLE'&&/AI 暂不可用/.test(e.message));
 assert.equal(calls,1);assert.equal(s.get(token).history.length,0);assert.equal(s.get(token).ledger.length,0);assert.equal(s.metadata().aiCallsToday,1);
});
test('switching endpoint never forwards the DeepSeek credential automatically',()=>{
 const p=plannerFromEnvironment({DEEPSEEK_API_KEY:'test-existing',BANK_AI_ENDPOINT:'https://example.invalid/v1/chat/completions',BANK_AI_MODEL:'model'});assert.equal(p.configured,false);
 assert.throws(()=>createCompatiblePlanner({endpoint:'http://example.invalid/chat/completions',model:'m'}),{code:'AI_CONFIG_INVALID'});
 assert.equal(createCompatiblePlanner({endpoint:'http://127.0.0.1:11434/v1/chat/completions',allowLocal:true,model:'local'}).configured,true);
});
test('oversized requests are refused before provider invocation, not silently truncated',async()=>{
 let calls=0;const p=createCompatiblePlanner({endpoint:'https://example.invalid/chat/completions',apiKey:'test',model:'m',maxPromptChars:8000,fetchImpl:async()=>{calls++;return reply([])}});
 await assert.rejects(()=>p.plan('x'.repeat(20000),[]),{code:'AI_CONTEXT_TOO_LARGE'});assert.equal(calls,0);
});
test('invalid AI plan is queued privately for review, not inserted into model context',async()=>{
 const p=createDeepSeekPlanner({apiKey:'test-only',fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:'pretend success'}}]})})});
 const s=new BankService({store:createBankStore(),planner:p,ruleFastPath:false});const {token}=s.create();await assert.rejects(()=>s.chat(token,{text:'查余额'}),{code:'INVALID_AI_PLAN'});
 const queue=s.feedbackExport(token);assert.equal(queue.items.length,1);assert.equal(queue.items[0].eligibleForPrompt,false);assert.equal(queue.items[0].status,'UNREVIEWED');
 assert.equal(s.get(token).balance,1286000);assert.equal(s.get(token).ledger.length,0);
});
test('explicit correction invalidates affected draft but does not run correction or leak between users',async()=>{
 const p=createDeepSeekPlanner({apiKey:'test-only',fetchImpl:async()=>reply([{type:'transfer',recipient:'王明',amount:'200'}])});
 const s=new BankService({store:createBankStore(),planner:p});const {token}=s.create();const other=s.create();const r=await s.chat(token,{text:'给王明转200元'});
 assert.throws(()=>s.feedback(other.token,{messageId:r.message.id,correction:'改成100元'}),{code:'MESSAGE_NOT_FOUND'});
 const result=s.feedback(token,{messageId:r.message.id,correction:'金额理解错了，我想说100元，请不要直接执行。'});
 assert.equal(result.state.tasks[0].status,'SUPERSEDED');assert.equal(result.state.balance,1286000);assert.equal(result.state.ledger.length,0);
 assert.equal(s.feedbackExport(other.token).items.length,0);assert.equal(s.feedbackExport(token).items.length,1);
 assert.throws(()=>s.feedback(token,{messageId:r.message.id,correction:'手机号13800138000'}),{code:'PRIVATE_DATA_BLOCKED'});
});
