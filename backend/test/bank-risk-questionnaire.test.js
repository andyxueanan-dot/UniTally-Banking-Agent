const {test}=require('node:test');const assert=require('node:assert/strict');
const {VERSION,SCORE_ROWS,scoreRisk,publicQuestionnaire,profileStatus}=require('../bank/risk-questionnaire');
const fixture=require('./risk-fixtures.cjs');const {BankService}=require('../bank/service');const {createBankStore}=require('../bank/store');
function setup(){let now=Date.parse('2026-10-02T10:00:00Z');const store=createBankStore();const planner={configured:true,provider:'Mock',model:'test',plan:async()=>({actions:[{type:'risk_assessment',questionnaireVersion:VERSION,answers:fixture.HIGH}],question:'',meta:{mode:'ai',provider:'Mock'}})};const service=new BankService({store,planner,now:()=>now});const{token}=service.create();const prepare=async action=>{const r=await service.prepareManual(token,action);const blocked=r.message.results.find(x=>x.type==='blocked');if(blocked)throw Object.assign(Error(blocked.text),{code:blocked.code});return r.state.tasks[0]};const confirm=task=>service.confirm(token,task.id,{confirmed:true,...(task.risk==='red'?{code:service.challenge(token,task.id).demoCode}:{})});return{store,service,token,prepare,confirm,assess:async answers=>confirm(await prepare({type:'risk_assessment',questionnaireVersion:VERSION,answers})),get:()=>service.get(token),advance:ms=>now+=ms};}
test('all 11 scoring columns exactly match the published source matrix; min -9 max 100',()=>{
 assert.deepEqual(SCORE_ROWS,[[-2,0,-2,-3,-10],[0,2,6,8,10],[2,4,8,10],[0,2,6,10],[0,2,6,8,10],[0,4,8,10],[0,4,6,10],[4,6,8,10],[2,6,10],[-5,0,5,10,15],[-2,0,2,4,5]]);
 assert.equal(scoreRisk(fixture.LOW).score,-9);assert.equal(scoreRisk(fixture.HIGH).score,100);assert.equal(scoreRisk(fixture.HIGH).riskLevel,5);
});
test('all reachable totals map to the published bins without gaps or changed thresholds',()=>{
 let possibilities=new Map([[0,[]]]);for(const row of SCORE_ROWS){const next=new Map();for(const[total,answers]of possibilities)row.forEach((points,i)=>next.set(total+points,[...answers,String.fromCharCode(65+i)]));possibilities=next;}
 for(const [score,answers]of possibilities){const expected=score<=15?1:score<=35?2:score<=60?3:score<=80?4:5;assert.equal(scoreRisk(answers).riskLevel,expected);assert.equal(scoreRisk(answers).score,score);}
 for(const boundary of [-9,15,16,35,36,60,61,80,81,100])assert.ok(possibilities.has(boundary));
});
test('public questionnaire never includes option scores; incomplete/extra/invalid answers rejected',()=>{
 const q=publicQuestionnaire();assert.equal(q.questions.length,11);assert.equal(q.version,VERSION);assert.equal(JSON.stringify(q).includes('scores'),false);
 for(const item of q.questions)for(const option of item.options)assert.deepEqual(Object.keys(option),['value','label']);
 for(const a of [[],[1,1,1],fixture.HIGH.slice(0,10),[...fixture.HIGH,'A'],fixture.HIGH.map((a,i)=>i===2?'E':a),fixture.HIGH.map((a,i)=>i===0?'Z':a)])assert.throws(()=>scoreRisk(a),{code:'INVALID_RISK_ANSWERS'});
});
test('completed questionnaire is only saved after yellow confirmation and hides total in public response',async()=>{
 const f=setup();const t=await f.prepare({type:'risk_assessment',questionnaireVersion:VERSION,answers:fixture.HIGH});assert.equal(t.risk,'yellow');assert.equal(f.get().business.riskProfile,null);
 f.confirm(t);const p=f.get().business.riskProfile;assert.equal(p.riskLevel,5);assert.equal(p.current,true);assert.equal('score' in p,false);assert.equal(p.questionnaireVersion,VERSION);assert.equal(f.get().balance,1286000);
});
test('a high score cannot override principal-loss refusal; original raw grade remains unchanged',async()=>{
 const f=setup();await f.assess(fixture.NO_LOSS);assert.equal(f.get().business.riskProfile.riskLevel,5);assert.equal(f.get().business.riskProfile.acceptsLoss,false);
 await assert.rejects(()=>f.prepare({type:'wealth_buy',productId:'demo-flex',amount:'100'}),{code:'RISK_MISMATCH'});assert.equal(f.get().ledger.length,0);
});
test('short horizon is not invented; explicit purchase days bind authorization and conflicts fail',async()=>{
 const f=setup();await f.assess(fixture.SHORT);
 await assert.rejects(()=>f.prepare({type:'wealth_buy',productId:'demo-term7',amount:'500'}),{code:'RISK_MISMATCH'});
 const t=await f.prepare({type:'wealth_buy',productId:'demo-term7',amount:'500',availableDays:7});assert.equal(t.action.availableDays,7);f.confirm(t);assert.equal(f.get().business.principalTotal,50000);
 await assert.rejects(()=>f.prepare({type:'wealth_buy',productId:'demo-term7',amount:'500',availableDays:365}),{code:'LIQUIDITY_CONFLICT'});
});
test('legacy profiles and existing positions survive upgrade but legacy assessment cannot authorize buys',async()=>{
 const f=setup();await f.assess(fixture.HIGH);f.confirm(await f.prepare({type:'wealth_buy',productId:'demo-flex',amount:'100'}));
 f.store.transact(db=>{Object.values(db.sessions)[0].business.riskProfile={answers:[2,2,2],riskLevel:3,acceptsLoss:true,horizonDays:30,revision:9,assessedAt:Date.now()};});
 assert.equal(f.get().business.riskProfile.current,false);assert.equal(f.get().business.riskProfile.reason,'LEGACY_VERSION');assert.equal(f.get().business.principalTotal,10000);
 await assert.rejects(()=>f.prepare({type:'wealth_buy',productId:'demo-flex',amount:'100'}),{code:'RISK_ASSESSMENT_REQUIRED'});
 const pos=f.get().business.positions[0];f.confirm(await f.prepare({type:'wealth_redeem',positionId:pos.id,amount:'100'}));assert.equal(f.get().balance,1286000);
});
test('expired assessment cannot authorize a new buy or an already prepared purchase',async()=>{
 const f=setup();await f.assess(fixture.HIGH);const t=await f.prepare({type:'wealth_buy',productId:'demo-flex',amount:'100'});
 f.store.transact(db=>{Object.values(db.sessions)[0].business.riskProfile.expiresAt=Date.parse('2026-10-02T10:00:00Z');});
 assert.equal(f.get().business.riskProfile.current,false);assert.throws(()=>f.confirm(t),{code:'RISK_PROFILE_CHANGED'});assert.equal(f.get().balance,1286000);
 await assert.rejects(()=>f.prepare({type:'wealth_buy',productId:'demo-flex',amount:'100'}),{code:'RISK_ASSESSMENT_REQUIRED'});
});
test('wrong questionnaire version rejected; model and fixed demo never prefill a risk profile',async()=>{
 const f=setup();await assert.rejects(()=>f.prepare({type:'risk_assessment',answers:fixture.HIGH}),{code:'QUESTIONNAIRE_VERSION_REQUIRED'});
 const r=await f.service.chat(f.token,{text:'帮我选择风险问卷答案并提交'});assert.equal(r.state.business.riskProfile,null);assert.equal(r.state.tasks.length,0);assert.match(r.message.text,/本人/);
 const demo=await f.service.chat(f.token,{text:'填写测评',demo:'risk_assessment'});assert.equal(demo.state.tasks.length,0);
});
