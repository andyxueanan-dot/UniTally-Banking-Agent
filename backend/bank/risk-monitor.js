// 异常熔断 beyond failed verification: behaviour patterns that look like account takeover, coercion
// or prompt-injection probing. A hit locks sensitive operations (queries keep working) and opens a
// human-takeover case with the evidence. Thresholds are deliberately simple and explainable.
const MINUTE = 60000;
const DEFAULT_RULES = Object.freeze({
  windowMs: 10 * MINUTE,
  distinctRecipients: 4,      // executed transfers to this many different people within the window
  sameRecipient: 4,           // executed transfers to the same person within the window
  hourlyOutflowCents: 2000000, // more than ¥20,000 leaving the account within 60 minutes …
  hourlyOutflowEvents: 3,       // … spread over at least this many payments (one verified large payment is not suspicious)
  blockedAttempts: 5,         // refused / invalid plans within the window (probing)
  lockMs: 10 * MINUTE,
});

function events(s) { if (!Array.isArray(s.riskEvents)) s.riskEvents = []; return s.riskEvents; }
function record(s, kind, now, detail = {}) {
  const list = events(s); list.push({ at: now, kind, ...detail });
  if (list.length > 300) s.riskEvents = list.slice(-200);
}
/** Returns the first rule that fires, or null. Pure apart from reading s.riskEvents. */
function evaluate(s, now, rules = DEFAULT_RULES) {
  // Evidence that already caused a lock is not counted again once the lock ends.
  const since = events(s).filter(e => e.kind === 'risk_locked').reduce((t, e) => Math.max(t, e.at), -Infinity);
  const live = events(s).filter(e => e.at > since);
  const recent = live.filter(e => e.at > now - rules.windowMs);
  const transfers = recent.filter(e => e.kind === 'transfer_executed');
  const distinct = new Set(transfers.map(e => e.recipientId));
  if (distinct.size >= rules.distinctRecipients) return { rule: 'MANY_RECIPIENTS', text: `${rules.windowMs / MINUTE} 分钟内向 ${distinct.size} 个不同收款人转账` };
  const byRecipient = transfers.reduce((m, e) => m.set(e.recipientId, (m.get(e.recipientId) || 0) + 1), new Map());
  const repeated = [...byRecipient.entries()].find(([, n]) => n >= rules.sameRecipient);
  if (repeated) return { rule: 'REPEATED_RECIPIENT', text: `${rules.windowMs / MINUTE} 分钟内向同一收款人转账 ${repeated[1]} 次` };
  const outflows = live.filter(e => e.at > now - 60 * MINUTE && e.kind === 'outflow');
  const outflow = outflows.reduce((n, e) => n + e.cents, 0);
  if (outflows.length >= rules.hourlyOutflowEvents && outflow > rules.hourlyOutflowCents) return { rule: 'HOURLY_OUTFLOW', text: `60 分钟内累计转出 ¥${(outflow / 100).toFixed(2)}` };
  const blocked = recent.filter(e => e.kind === 'blocked').length;
  if (blocked >= rules.blockedAttempts) return { rule: 'REPEATED_BLOCKED', text: `${rules.windowMs / MINUTE} 分钟内 ${blocked} 次请求被安全规则拦截（疑似试探）` };
  return null;
}
module.exports = { DEFAULT_RULES, record, evaluate, events };
