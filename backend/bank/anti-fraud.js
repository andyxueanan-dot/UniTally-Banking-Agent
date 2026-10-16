// 反诈干预 (learned from Revolut's scam intervention and Chinese banks' 转账前风险问询):
// a large first-time transfer is not blocked outright and not just "confirmed" either. The user answers
// three plain questions; any "yes" stops it and hands it to a person; all "no" starts a short cooling-off
// period, after which the usual red verification applies. Questions are fixed text, never model-written.
const THRESHOLD_CENTS = 200000; // ¥2,000
const COOLING_MS = 60000;       // demo: 60 seconds (banks use minutes to hours)
const QUESTIONS = Object.freeze([
  '有没有人正在通过电话、短信或网络指导你做这笔转账？',
  '对方是否自称客服、银行或公检法人员，或以"安全账户""退款""刷单返利""贷款解冻"为理由？',
  '对方是否让你开启屏幕共享、下载陌生 App，或向他提供验证码？',
]);
function needsCheck(s, action) {
  if (action.type !== 'transfer' || !Number.isSafeInteger(action.cents) || action.cents < THRESHOLD_CENTS) return false;
  return !s.tasks.some(t => t.status === 'SUCCEEDED' && t.action.type === 'transfer' && t.action.recipientId === action.recipientId);
}
module.exports = { THRESHOLD_CENTS, COOLING_MS, QUESTIONS, needsCheck };
