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
// GB/T 47746—2026 (人工与智能客服协同): the person picking up must not make the user repeat themselves.
// A deterministic summary: what the user wants, what is done, where it is stuck, a suggested next step.
function summarize(kind, reason, c = {}) {
  const nodes = Array.isArray(c.nodes) ? c.nodes : [];
  const done = nodes.filter(n => n.status === 'SUCCEEDED').length;
  const stuck = nodes.find(n => !['SUCCEEDED', 'PENDING', 'CANCELLED'].includes(n.status));
  const parts = {
    workflow: [`想办：${c.goal || '多步骤任务'}`, `进度：${done}/${nodes.length} 步已完成`, stuck ? `停在：${stuck.type}（${stuck.status}）` : '停在：等待处理', '建议：核实后"交还用户确认"，或关闭并说明原因'],
    task: [`想办：${c.title || '一项操作'}`, `等级：${c.risk === 'red' ? '红色（需强验证）' : '黄色'}`, '进度：尚未执行，没有资金变动', '建议：与用户核实意图后交还，由用户本人确认'],
    chat: [`用户原话：${c.lastUserText || '（无）'}`, '进度：对话中请求人工', '建议：先确认用户身份与诉求；涉及资金的操作仍由用户在页面确认'],
    risk: [`触发：${reason}`, c.title ? `相关操作：${c.title}` : '相关操作：无', '进度：敏感操作已暂停，查询可用', '建议：电话核实是否本人、是否有人指导操作，再决定解除或维持'],
    reversal: [`想办：${c.title || '撤回申请'}`, '进度：已提交，资金未动', '建议：联系收款方或商户确认后"同意退回"或"驳回"'],
  }[kind] || [reason];
  return parts.join('；');
}
function openCase(s, { kind, sourceId = null, reason, context = {} }, now, id) {
  const cases = ensureHandoffs(s);
  const existing = cases.find(c => c.kind === kind && c.sourceId === sourceId && OPEN_STATES.has(c.status));
  if (existing) { existing.notes.push({ at: now, by: 'system', text: `再次请求人工：${String(reason).slice(0, 200)}` }); existing.updatedAt = now; return existing; }
  if (cases.filter(c => OPEN_STATES.has(c.status)).length >= 30) throw Object.assign(new Error('待处理的人工接管已达上限，请先处理已有记录。'), { code: 'HANDOFF_LIMIT', status: 429 });
  const c = { id: `HO-${id().slice(0, 10).toUpperCase()}`, kind, sourceId, status: 'OPEN', reason: String(reason).slice(0, 300),
    createdAt: now, updatedAt: now, agent: null, context: structuredClone(context), notes: [], resolution: null, summary: summarize(kind, reason, context),
    note: '演示：由同一浏览器切换到"客服工作台"扮演客服；客服不能替用户确认或验证任何资金操作。' };
  cases.push(c);
  if (cases.length > 100) s.handoffs = cases.filter(x => OPEN_STATES.has(x.status)).concat(cases.filter(x => !OPEN_STATES.has(x.status)).slice(-60));
  return c;
}
function findCase(s, caseId) { return ensureHandoffs(s).find(c => c.id === caseId) || null; }
function publicHandoffs(s) { return structuredClone(ensureHandoffs(s)).reverse(); }
module.exports = { ensureHandoffs, openCase, findCase, publicHandoffs, OPEN_STATES };
