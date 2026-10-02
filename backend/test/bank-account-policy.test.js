const {test}=require('node:test');const assert=require('node:assert/strict');const {BankService}=require('../bank/service');const{createBankStore}=require('../bank/store');
function fixture(accountClass='II'){let now=Date.parse('2026-10-02T10:00:00+08:00');const store=createBankStore();const service=new BankService({store,planner:{configured:false},now:()=>now});const{token}=service.create({accountClass});const prepare=async action=>{const r=await service.prepareManual(token,action);const b=r.message.results.find(x=>x.type==='blocked');if(b)throw Object.assign(Error(b.text),{code:b.code});return r.state.tasks[0]};const confirm=t=>service.confirm(token,t.id,{confirmed:true,...(t.risk==='red'?{code:service.challenge(token,t.id).demoCode}:{})});return{store,service,token,prepare,confirm,get:()=>service.get(token),run:async a=>confirm(await prepare(a)),tick:ms=>now+=ms};}
test('class selection is server-defined and cannot override balance; legacy accounts default I',()=>{
 const f=fixture('III');assert.equal(f.get().balance,150000);assert.equal(f.get().accountPolicy.balanceCap,200000);assert.equal(f.get().accountPolicy.creditLimit,null);
 assert.throws(()=>f.service.create({accountClass:'III',balance:99999999}),{code:'INVALID_ACCOUNT_CLASS'});assert.throws(()=>f.service.create({accountClass:'VIP'}),{code:'INVALID_ACCOUNT_CLASS'});
 f.store.transact(db=>{delete Object.values(db.sessions)[0].accountProfile});assert.equal(f.get().accountPolicy.accountClass,'I');
});
test('II daily outgoing counts transfers plus purchases; additional strong authentication cannot bypass it',async()=>{
 const f=fixture();await f.run({type:'transfer',recipient:'王明',amount:'9900'});await f.run({type:'card_purchase',cardLast4:'8806',amount:'100',online:false,overseas:false});
 assert.equal(f.get().accountPolicy.outgoing.daily,1000000);
 await assert.rejects(()=>f.prepare({type:'transfer',recipient:'李悦',amount:'0.01'}),{code:'ACCOUNT_DAILY_LIMIT'});assert.equal(f.get().balance,286000);
});
test('confirmation rechecks annual quota changed after preparation without losing funds',async()=>{
 const f=fixture();const t=await f.prepare({type:'transfer',recipient:'王明',amount:'200'});
 f.store.transact(db=>{const s=Object.values(db.sessions)[0];s.tasks.push({id:'past-year-usage',action:{type:'transfer',cents:19999999},status:'SUCCEEDED',executionDay:'2026-09-01',completedAt:Date.parse('2026-09-01T00:00:00+08:00')})});
 assert.throws(()=>f.confirm(t),{code:'ACCOUNT_ANNUAL_LIMIT'});assert.equal(f.get().balance,1286000);assert.equal(f.get().ledger.length,0);
});
test('III business eligibility independent of questionnaire or balance',async()=>{
 const f=fixture('III');await assert.rejects(()=>f.prepare({type:'wealth_buy',productId:'demo-flex',amount:'100'}),{code:'ACCOUNT_BUSINESS_NOT_ALLOWED'});
 await assert.rejects(()=>f.prepare({type:'card_credit_request',cardLast4:'8806',amount:'1000'}),{code:'ACCOUNT_BUSINESS_NOT_ALLOWED'});
});
test('III simulated incoming credit exceeding balance cap is rejected atomically',async()=>{
 const f=fixture('III');await f.run({type:'aa_request',amount:'1200',participants:['王明','李悦'],includeSelf:false});const req=f.get().advanced.requests[0];
 await assert.rejects(()=>f.prepare({type:'simulate_aa_payment',simulation:true,requestId:req.id,participantId:req.shares[0].participantId}),{code:'ACCOUNT_BALANCE_LIMIT'});
 assert.equal(f.get().balance,150000);assert.equal(f.get().advanced.requests[0].collectedCents,0);assert.equal(f.get().ledger.length,0);
});
test('pending transfers reserve quota; reconciliation excludes itself and does not double count',async()=>{
 const f=fixture();await f.service.chat(f.token,{text:'给李悦转1200元',demo:'large',simulateTimeout:true});const t=f.get().tasks[0];f.confirm(t);assert.equal(f.get().accountPolicy.outgoing.daily,120000);
 f.service.reconcile(f.token,t.id);assert.equal(f.get().accountPolicy.outgoing.daily,120000);assert.equal(f.get().ledger.length,1);
 f.tick(86400000);assert.equal(f.get().accountPolicy.outgoing.daily,0);assert.equal(f.get().accountPolicy.outgoing.annual,120000);
});
test('credit interest records cannot grant credit or change debit card spending limits',async()=>{
 const f=fixture('I');const before=f.get();await f.run({type:'card_credit_request',cardLast4:'8806',amount:'5000'});const after=f.get();
 assert.equal(after.business.creditApplications[0].status,'PENDING_REVIEW');assert.equal(after.balance,before.balance);assert.equal(after.cards[0].limit,before.cards[0].limit);assert.equal(after.accountPolicy.creditLimit,null);
});
