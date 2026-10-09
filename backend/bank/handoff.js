// Human takeover (人工接管). A case packages what the agent was doing so a person can pick it up.
// The person can claim it, leave notes, hand the work back to the user as a fresh draft, approve or
// reject a reversal, or close it. The person can never confirm a payment on the user's behalf:
// anything that moves money still becomes an ordinary task the user must confirm and verify.
const OPEN_STATES = new Set(['OPEN', 'CLAIMED']);
const KINDS = new Set(['workflow', 'task', 'chat', 'risk', 'reversal']);

function ensureHandoffs(s) {
  if (!Array.isArray(s.handoffs)) s.handoffs = [];
  for (const c of s.handoffs) if (!c || typeof c.id !== 'string' || !KINDS.has(c.kind) || !Array.isArray(c.notes))
    throw Object.assign(new Error('人工接管记录异常，已停止操作。'), { code: 'HANDOFF_STATE_INVALID', status: 503 });
  return s.handoffs;
}
function openCase(s, { kind, sourceId = null, reason, context = {} }, now, id) {
  const cases = ensureHandoffs(s);
  const existing = cases.find(c => c.kind === kind && c.sourceId === sourceId && OPEN_STATES.has(c.status));
  if (existing) { existing.notes.push({ at: now, by: 'system', text: `再次请求人工：${String(reason).slice(0, 200)}` }); existing.updatedAt = now; return existing; }
  if (cases.filter(c => OPEN_STATES.has(c.status)).length >= 30) throw Object.assign(new Error('待处理的人工接管已达上限，请先处理已有记录。'), { code: 'HANDOFF_LIMIT', status: 429 });
  const c = { id: `HO-${id().slice(0, 10).toUpperCase()}`, kind, sourceId, status: 'OPEN', reason: String(reason).slice(0, 300),
    createdAt: now, updatedAt: now, agent: null, context: structuredClone(context), notes: [], resolution: null,
    note: '演示：由同一浏览器切换到"客服工作台"扮演客服；客服不能替用户确认或验证任何资金操作。' };
  cases.push(c);
  if (cases.length > 100) s.handoffs = cases.filter(x => OPEN_STATES.has(x.status)).concat(cases.filter(x => !OPEN_STATES.has(x.status)).slice(-60));
  return c;
}
function findCase(s, caseId) { return ensureHandoffs(s).find(c => c.id === caseId) || null; }
function publicHandoffs(s) { return structuredClone(ensureHandoffs(s)).reverse(); }
module.exports = { ensureHandoffs, openCase, findCase, publicHandoffs, OPEN_STATES };
