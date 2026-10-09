// Scoring facts transcribed from Suzhou Bank V.202308, page 1.
// UI wording is condensed for this independent fictional demo, not a bank-issued assessment.
const VERSION = 'suzhou-v202308-finp-v1';
const SOURCE = Object.freeze({ name: '苏州银行个人投资者风险承受能力评估问卷', version: 'V.202308',
  url: 'https://www.suzhoubank.com/suzhoubank/attachDir/2026/03/苏州银行个人投资者风险承受能力评估问卷（V.202308）.pdf' });
const SCORE_ROWS = Object.freeze([
  [-2,0,-2,-3,-10], [0,2,6,8,10], [2,4,8,10], [0,2,6,10], [0,2,6,8,10],
  [0,4,8,10], [0,4,6,10], [4,6,8,10], [2,6,10], [-5,0,5,10,15], [-2,0,2,4,5],
].map(row => Object.freeze(row)));
const DEFINITIONS = [
  ['财务状况','年龄区间',['18–25岁','26–50岁','51–60岁','61–65岁','65岁以上']],
  ['财务状况','家庭可计入的净资产（人民币）',['不超过15万元','超过15万，不超过50万元','超过50万，不超过100万元','超过100万，不超过1000万元','超过1000万元'],'扣除未清偿债务；不计自住房和实业投资，计入储蓄、保险及金融、实物投资。'],
  ['财务状况','上述净资产中，可用于金融投资的比例（不含储蓄）',['低于10%','10%至25%','25%至50%','高于50%'],'原版相邻区间共享端点，请按原版选项自行确认；系统不替你选答案。'],
  ['投资经验','最接近您的投资经历',['基本仅接触存款、国债','以存款国债为主，少量风险投资','多类金融资产较均衡','主要投资股票、基金、外汇等风险资产']],
  ['投资经验','风险投资经验年限',['没有经验','有经验但不足2年','2至5年','5至8年','8年以上']],
  ['投资经验','对风险与回报的态度',['厌恶风险，不希望本金损失，期待稳定回报','不希望本金损失，但可接受收益波动','愿承担有限本金损失，争取增长','愿承担较大本金损失，争取高回报']],
  ['投资风格','以100万元本金且未获保本承诺为背景，您倾向哪种机会',['确定获得1000元且归还本金','50%机会获得5万元，本金较可能归还','25%机会获得50万元，本金可能损失','10%机会获得100万元，本金较可能损失'],'保留原版的假设选择条件，不是我们提供的产品或收益承诺。'],
  ['投资风格','可接受的最长投资期限（不含存款、国债）',['1年以下','1至3年','3至5年','5年以上']],
  ['投资风格','主要投资目的',['保值','稳健增值','迅速增值']],
  ['风险承受能力','哪种波动会让您明显焦虑',['本金未损失，但收益低于预期','轻微本金损失','本金损失在10%以内','本金损失20%至50%','本金损失超过50%']],
  ['风险承受能力','“保本比高收益更重要”，您的态度',['非常同意','同意','无所谓','不同意','非常不同意']],
];
const LABELS = ['保守型','谨慎型','稳健型','进取型','激进型'];
function validAnswers(answers) { return Array.isArray(answers) && answers.length === 11 && answers.every((a,i) => typeof a === 'string' && /^[A-E]$/.test(a) && a.charCodeAt(0) - 65 < SCORE_ROWS[i].length); }
function assertAnswers(answers) { if (!validAnswers(answers)) throw Object.assign(new Error('请逐题完成新版11题问卷，使用各题有效选项；不能沿用旧三题答案或由AI代填。'), { code: 'INVALID_RISK_ANSWERS', status: 400 }); }
function scoreRisk(answers) {
  assertAnswers(answers);
  const score = answers.reduce((sum,a,i) => sum + SCORE_ROWS[i][a.charCodeAt(0)-65], 0);
  const riskLevel = score <= 15 ? 1 : score <= 35 ? 2 : score <= 60 ? 3 : score <= 80 ? 4 : 5;
  return { score, riskLevel, riskLabel: `C${riskLevel} ${LABELS[riskLevel-1]}`,
    noInvestmentExperience: answers[3] === 'A' || answers[4] === 'A' || answers[5] === 'A',
    // Separate Orbit eligibility gates. Do NOT modify the bank's raw score or grade.
    acceptsLoss: !['A','B'].includes(answers[5]) && answers[9] !== 'A',
    horizonDays: [0,365,1095,1825][answers[7].charCodeAt(0)-65],
    method: '苏州银行V.202308公开分值相加，按原版C1–C5区间分级；非正式适当性评估。',
  };
}
function publicQuestionnaire() {
  return { version: VERSION, source: { ...SOURCE }, wording: '题干为界面精简表述；完整原题见来源，选项和分值按原版对应。',
    questions: DEFINITIONS.map(([section,prompt,labels,note],i) => ({ id: `q${i+1}`, section, prompt, note: note || '', options: labels.map((label,j) => ({ value: String.fromCharCode(65+j), label })) })) };
}
function validStoredProfile(p) {
  if (p === null) return true;
  if (!p || !Number.isSafeInteger(p.revision) || p.revision < 1) return false;
  if (p.questionnaireVersion === VERSION) return validAnswers(p.answers) && Number.isFinite(p.assessedAt) && Number.isFinite(p.expiresAt);
  return !p.questionnaireVersion && Array.isArray(p.answers) && p.answers.length === 3 && p.answers.every(n => Number.isInteger(n) && n >= 0 && n <= 2);
}
function profileStatus(p, now) {
  if (!p) return { current: false, reason: 'NOT_ASSESSED' };
  if (p.questionnaireVersion !== VERSION) return { current: false, reason: 'LEGACY_VERSION' };
  if (p.assessedAt > now || p.expiresAt <= now) return { current: false, reason: 'EXPIRED' };
  return { current: true, reason: null };
}
function publicProfile(p, now) {
  if (!p) return null;
  const result = structuredClone(p);
  if (p.questionnaireVersion === VERSION) Object.assign(result,scoreRisk(p.answers));
  delete result.score;
  return { ...result, ...profileStatus(p,now), riskLabel: p.questionnaireVersion === VERSION ? scoreRisk(p.answers).riskLabel : '旧版三题教学测评（须重测）' };
}
function purchaseDays(profile, availableDays, fail) {
  if (availableDays === undefined) return profile.horizonDays;
  if (!Number.isInteger(availableDays) || availableDays < 0 || availableDays > 3650) fail('INVALID_LIQUIDITY_DAYS','资金可锁定天数必须是0至3650之间的整数。');
  if (profile.answers[7] === 'A' && availableDays >= 365) fail('LIQUIDITY_CONFLICT','交易期限与问卷“一年以下”的回答冲突，请重新核对。');
  return availableDays;
}
module.exports = { VERSION, SOURCE, SCORE_ROWS, validAnswers, assertAnswers, scoreRisk, publicQuestionnaire, validStoredProfile, profileStatus, publicProfile, purchaseDays };
