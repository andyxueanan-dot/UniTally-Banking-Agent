const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { calendarContext, localScheduledInstant, enforceTemporalPlan } = require('../bank/calendar');
const { ledgerDetails } = require('../bank/analytics');
const { BankService } = require('../bank/service');
const { createBankStore } = require('../bank/store');
const now = Date.parse('2026-10-01T16:30:00Z'); // Beijing Oct 2, UTC Oct 1.
test('explicit UTC and Beijing dates differ correctly across midnight', () => {
  const c = calendarContext(now); assert.equal(c.utcDate, '2026-10-01'); assert.equal(c.beijingDate, '2026-10-02');
  assert.equal(c.relativeDates.yesterday, '2026-10-01'); assert.equal(c.relativeDates.day_before_yesterday, '2026-09-30'); assert.equal(c.relativeDates.tomorrow, '2026-10-03');
  assert.equal(c.ranges.today.startUtc, '2026-10-01T16:00:00.000Z'); assert.equal(c.ranges.today.endExclusiveUtc, '2026-10-02T16:00:00.000Z');
});
test('month/year/leap-day boundaries use code, not model arithmetic', () => {
  assert.equal(calendarContext(Date.parse('2024-03-01T00:30:00+08:00')).relativeDates.yesterday,'2024-02-29');
  assert.equal(calendarContext(Date.parse('2026-01-01T00:30:00+08:00')).relativeDates.yesterday,'2025-12-31');
  assert.equal(calendarContext(Date.parse('2026-03-01T00:30:00+08:00')).relativeDates.day_before_yesterday,'2026-02-27');
});
test('week is Monday through Sunday, including cross-month and cross-year weeks', () => {
  const c=calendarContext(now); assert.equal(c.ranges.this_week.startDate,'2026-09-28');assert.equal(c.ranges.this_week.endDate,'2026-10-04');
  assert.equal(c.ranges.last_week.startDate,'2026-09-21');assert.equal(c.ranges.last_week.endDate,'2026-09-27');
  assert.equal(calendarContext(Date.parse('2026-01-01T00:00:00+08:00')).ranges.this_week.startDate,'2025-12-29');
});
test('host TZ UTC, Shanghai and Los Angeles yield identical accounting calendar', () => {
  const script=`console.log(JSON.stringify(require('./backend/bank/calendar').calendarContext(${now})))`;
  const values=['UTC','Asia/Shanghai','America/Los_Angeles'].map(TZ=>execFileSync(process.execPath,['-e',script],{cwd:require('node:path').resolve(__dirname,'../..'),env:{...process.env,TZ},encoding:'utf8'}));
  assert.equal(values[0],values[1]);assert.equal(values[0],values[2]);
});
test('yesterday and last-week queries filter actual accounting dates and transfers', () => {
  const rows=[['2026-09-30',500],['2026-10-01',1000],['2026-10-02',2000],['2026-09-27',3000]].map(([date,cents],i)=>({id:'r'+i,date,cents,type:'transfer',category:'转账',merchant:'王明'}));
  assert.equal(ledgerDetails(rows,{period:'yesterday',category:'转账'},now).transferTotal,1000);
  assert.equal(ledgerDetails(rows,{period:'day_before_yesterday'},now).transferTotal,500);
  assert.equal(ledgerDetails(rows,{period:'last_week'},now).transferTotal,3000);
});
test('tomorrow 09:00 resolves to Beijing time and stores an unambiguous instant', () => {
  const plan={actions:[{type:'schedule_transfer',recipient:'王明',amount:'200',relativeDateKey:'tomorrow',localTime:'09:00'}],question:'',meta:{mode:'ai'}};
  const result=enforceTemporalPlan(plan,'明天早上9点给王明转200元',now,now);
  assert.equal(result.actions[0].executeAt,'2026-10-03T09:00:00+08:00');assert.equal(new Date(result.actions[0].executeAt).toISOString(),'2026-10-03T01:00:00.000Z');
  assert.equal(enforceTemporalPlan(plan,'明天早上给王明转200元',now,now).actions.length,0);
  assert.equal(enforceTemporalPlan(plan,'后天9点给王明转200元',now,now).actions.length,0);
  assert.throws(()=>localScheduledInstant('tomorrow','25:00',now));
});
test('wrong dates, historical transfers as new payments, and ambiguous comparisons fail closed', () => {
  for(const [text,action] of [
    ['昨天转了多少',{type:'transactions',period:'day_before_yesterday',category:'转账'}],
    ['昨天转了多少',{type:'analyze',period:'yesterday'}],
    ['昨天给王明转了200元吗',{type:'transfer',recipient:'王明',amount:'200'}],
    ['1号是昨天还是前天，查那天账单',{type:'transactions',period:'yesterday'}],
    ['明天09:00给王明转200元',{type:'schedule_transfer',recipient:'王明',amount:'200',executeAt:'2026-10-02T09:00:00+08:00'}],
  ]) assert.equal(enforceTemporalPlan({actions:[action],question:''},text,now,now).actions.length,0);
});
test('a Beijing midnight change while model plans requires re-confirming the date', () => {
  const before=Date.parse('2026-10-02T23:59:59+08:00'); const after=before+2000;
  assert.throws(()=>enforceTemporalPlan({actions:[{type:'transactions',period:'yesterday'}]},'昨天账单',before,after),{code:'DATE_CONTEXT_EXPIRED'});
});
test('service forwards calendar, rejects wrong relative query and never debits funds', async () => {
  let observed;
  const service=new BankService({store:createBankStore(),now:()=>now,planner:{configured:true,provider:'Mock',model:'test',plan:async(_text,_history,context)=>{observed=context;return{actions:[{type:'transfer',recipient:'王明',amount:'200'}],question:'',meta:{mode:'ai',provider:'Mock'}}}}});
  const {token}=service.create(); const r=await service.chat(token,{text:'昨天给王明转了200元吗'});
  assert.equal(observed.calendar.beijingDate,'2026-10-02');assert.equal(r.state.tasks.length,0);assert.equal(r.state.balance,1286000);assert.equal(r.state.ledger.length,0);
});
