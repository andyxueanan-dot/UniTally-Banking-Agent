// Explicit simulation subset: non-bound transfers, consumption and simulated AA receipts.
// Not a complete implementation of bank onboarding, bound-account exceptions or KYC.
const TYPES = Object.freeze({
  I: { label:'Ⅰ类演示账户', outDaily:null, outAnnual:null, inDaily:null, inAnnual:null, balanceCap:null, wealth:true },
  II: { label:'Ⅱ类演示账户', outDaily:1000000, outAnnual:20000000, inDaily:1000000, inAnnual:20000000, balanceCap:null, wealth:true },
  III: { label:'Ⅲ类演示账户', outDaily:200000, outAnnual:5000000, inDaily:null, inAnnual:null, balanceCap:200000, wealth:false },
});
const OUT = new Set(['transfer','card_purchase','pay_merchant_order']);
const IN = new Set(['simulate_aa_payment']);
const day = now => new Date(now+8*3600000).toISOString().slice(0,10);
function definition(s) { const type=s.accountProfile?.accountClass || 'I'; if (!TYPES[type]) throw Object.assign(Error('账户类别无法确认，操作已停止。'),{code:'ACCOUNT_POLICY_INVALID',status:503}); return {type,...TYPES[type]}; }
function totals(s, now, direction, excludeId) {
  const types = direction==='out' ? OUT : IN; const today=day(now);let daily=0,annual=0;
  for(const t of s.tasks){if(t.id===excludeId || !types.has(t.action.type) || !['SUCCEEDED','PENDING_REVIEW'].includes(t.status))continue;
    const date=t.status==='SUCCEEDED'&&Number.isFinite(t.completedAt)?day(t.completedAt):t.executionDay;
    if(typeof date!=='string'||!Number.isSafeInteger(t.action.cents))throw Object.assign(Error('额度记录不完整，请人工核对。'),{code:'ACCOUNT_QUOTA_INVALID',status:503});
    if(date===today)daily+=t.action.cents;if(date.slice(0,4)===today.slice(0,4))annual+=t.action.cents;
  }return{daily,annual};
}
function checkAccountAction(s,a,now,fail,excludeId) {
  const p=definition(s);
  if(p.type==='III' && ['wealth_buy','card_credit_request'].includes(a.type))fail('ACCOUNT_BUSINESS_NOT_ALLOWED','此Ⅲ类演示账户不开放理财申购或信用业务意向；验证身份不能改变业务资格。');
  if(OUT.has(a.type)||IN.has(a.type)){
    const direction=OUT.has(a.type)?'out':'in'; const u=totals(s,now,direction,excludeId);const capDay=p[direction+'Daily'],capYear=p[direction+'Annual'];
    if(!Number.isSafeInteger(a.cents)||a.cents<=0)fail('ACCOUNT_AMOUNT_INVALID','无法核验额度的操作金额。');
    if(capDay!==null&&u.daily+a.cents>capDay)fail('ACCOUNT_DAILY_LIMIT',`${p.label}的${direction==='out'?'出金':'入金'}日累计限额已不足；即使完成验证码或设备验证也不能越过此限额。`);
    if(capYear!==null&&u.annual+a.cents>capYear)fail('ACCOUNT_ANNUAL_LIMIT',`${p.label}的${direction==='out'?'出金':'入金'}年累计限额已不足；请核对账户规则。`);
    if(direction==='in'&&p.balanceCap!==null&&s.balance+a.cents>p.balanceCap)fail('ACCOUNT_BALANCE_LIMIT','Ⅲ类演示账户入账后余额将超过2000元，已拒绝模拟入账。');
  }
}
function checkAccountBalance(s,fail){const p=definition(s);if(p.balanceCap!==null&&s.balance>p.balanceCap)fail('ACCOUNT_BALANCE_LIMIT','账户余额超过当前类别上限，交易未提交。');}
function publicAccountPolicy(s,now){const p=definition(s);return{accountClass:p.type,label:p.label,cardKind:'DEBIT',creditLimit:null,
  outDailyLimit:p.outDaily,outAnnualLimit:p.outAnnual,balanceCap:p.balanceCap,outgoing:totals(s,now,'out'),incoming:totals(s,now,'in'),wealthAllowed:p.wealth,
  scope:'仅统计本演示新产生的非绑定转账、模拟刷卡/订单付款及AA模拟入账；不含预置示例账单，不覆盖真实开户、绑定账户例外或贷款规则。',
  note:'Ⅰ类无本模板统一分类额度，不等于无限制；仍检查可用余额、卡消费限额、业务资格与授权。信用额度申请不等于消费限额调整。'};}
module.exports={TYPES,publicAccountPolicy,checkAccountAction,checkAccountBalance};
