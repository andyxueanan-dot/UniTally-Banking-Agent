const { randomBytes } = require('node:crypto');
const flowError = (code, message) => Object.assign(new Error(message), { code, status: 409 });
const DONE = new Set(['SUCCEEDED', 'CANCELLED', 'FAILED']);

function validateGraph(nodes) {
  if (!Array.isArray(nodes) || nodes.length < 1 || nodes.length > 12) throw flowError('INVALID_GRAPH', '工作流须包含 1～12 个受控节点。');
  const ids = new Set(nodes.map(n => n.id));
  if (ids.size !== nodes.length || nodes.some(n => typeof n.id !== 'string' || !/^[a-z][a-z0-9_-]{0,40}$/.test(n.id) || !Array.isArray(n.dependsOn) || !n.action || typeof n.action.type !== 'string')) throw flowError('INVALID_GRAPH', '节点ID、依赖或动作格式不正确。');
  if (nodes.some(n => n.dependsOn.some(id => !ids.has(id) || id === n.id) || new Set(n.dependsOn).size !== n.dependsOn.length)) throw flowError('INVALID_GRAPH', '依赖必须指向其他已存在的唯一节点。');
  const visiting = new Set(); const visited = new Set();
  const visit = id => {
    if (visiting.has(id)) throw flowError('CYCLIC_GRAPH', '任务依赖出现环路，不能执行。');
    if (visited.has(id)) return;
    visiting.add(id); nodes.find(n => n.id === id).dependsOn.forEach(visit); visiting.delete(id); visited.add(id);
  };
  nodes.forEach(n => visit(n.id));
}
function createWorkflow({ goal, actions, nodes }, now = Date.now()) {
  const graph = nodes || actions.map((action, i) => ({ id: `step-${i + 1}`, action: structuredClone(action), dependsOn: i ? [`step-${i}`] : [] }));
  validateGraph(graph);
  return { id: randomBytes(12).toString('hex'), goal: String(goal).slice(0, 500), status: 'READY', revision: 1, createdAt: now, updatedAt: now,
    nodes: graph.map(n => ({ id: n.id, action: structuredClone(n.action), dependsOn: [...n.dependsOn], status: 'PENDING', attempts: 0 })),
    events: [{ at: now, event: 'WORKFLOW_CREATED', detail: '节点依赖已校验；敏感节点必须逐项确认。' }] };
}
function refresh(flow, now) {
  flow.updatedAt = now;
  if (['PAUSED', 'HANDOFF', 'CANCELLED'].includes(flow.status)) return flow;
  if (flow.nodes.every(n => n.status === 'SUCCEEDED')) flow.status = 'SUCCEEDED';
  else if (flow.nodes.some(n => n.status === 'FAILED' || n.status === 'CANCELLED')) flow.status = 'NEEDS_ATTENTION';
  else if (flow.nodes.some(n => n.status === 'WAITING_CONFIRMATION')) flow.status = 'AWAITING_CONFIRMATION';
  else if (flow.nodes.some(n => n.status === 'WAITING_SETTLEMENT')) flow.status = 'WAITING_SETTLEMENT';
  else flow.status = 'READY';
  return flow;
}
function readyNodes(flow) {
  if (['PAUSED', 'HANDOFF', 'CANCELLED', 'SUCCEEDED', 'NEEDS_ATTENTION'].includes(flow.status)) return [];
  return flow.nodes.filter(n => n.status === 'PENDING' && n.dependsOn.every(id => flow.nodes.find(dep => dep.id === id).status === 'SUCCEEDED'));
}
function requireReady(flow, nodeId) {
  const node = readyNodes(flow).find(n => n.id === nodeId);
  if (!node) throw flowError('NODE_NOT_READY', '上游步骤尚未完成、工作流已暂停，或这个节点已经执行。');
  return node;
}
function recordRead(flow, nodeId, result, now) {
  const n = requireReady(flow, nodeId); n.status = 'SUCCEEDED'; n.result = structuredClone(result); n.completedAt = now; n.attempts += 1;
  flow.events.push({ at: now, event: 'READ_NODE_COMPLETED', nodeId }); refresh(flow, now);
}
function bindTask(flow, nodeId, task, now) {
  const n = requireReady(flow, nodeId); n.taskId = task.id; n.status = 'WAITING_CONFIRMATION'; n.attempts += 1;
  flow.events.push({ at: now, event: 'NODE_AWAITING_APPROVAL', nodeId, taskId: task.id }); refresh(flow, now);
}
function settleTask(flow, task, now) {
  const n = flow.nodes.find(n => n.taskId === task.id);
  if (!n) throw flowError('TASK_NODE_MISMATCH', '这项授权不属于该工作流的任何节点。');
  if (n.status === 'SUCCEEDED' && task.status === 'SUCCEEDED') return flow;
  if (task.status === 'SUCCEEDED') { n.status = 'SUCCEEDED'; n.receiptId = task.receipt?.id; n.result = task.result; n.completedAt = now; }
  else if (task.status === 'PENDING_REVIEW') n.status = 'WAITING_SETTLEMENT';
  else if (['CANCELLED', 'SUPERSEDED', 'EXPIRED'].includes(task.status)) { n.status = task.status === 'CANCELLED' ? 'CANCELLED' : 'PENDING'; delete n.taskId; }
  else throw flowError('TASK_NOT_SETTLED', '任务尚未完成或进入对账，不得宣布节点成功。');
  flow.events.push({ at: now, event: `TASK_${task.status}`, nodeId: n.id, taskId: task.id }); refresh(flow, now); return flow;
}
function failNode(flow, nodeId, message, now) {
  const n = requireReady(flow, nodeId); n.status = 'FAILED'; n.error = String(message).slice(0, 500); n.attempts += 1;
  flow.events.push({ at: now, event: 'NODE_FAILED', nodeId, detail: n.error }); refresh(flow, now);
}
function pauseWorkflow(flow, now, { handoff = false, reason = '用户暂停工作流' } = {}) {
  if (DONE.has(flow.status)) throw flowError('WORKFLOW_FINISHED', '已结束的工作流无需暂停。');
  flow.status = handoff ? 'HANDOFF' : 'PAUSED'; flow.updatedAt = now; flow.revision += 1;
  // Caller must invalidate any linked unconfirmed task. Pending settlements remain intact.
  for (const n of flow.nodes) if (n.status === 'WAITING_CONFIRMATION') { n.status = 'PENDING'; delete n.taskId; }
  flow.events.push({ at: now, event: handoff ? 'HANDOFF_PREPARED' : 'WORKFLOW_PAUSED', detail: reason });
  if (handoff) flow.handoff = { at: now, status: 'PREPARED_NOT_SENT', reason, note: '仅生成本地接管记录，没有真人客服接入；自动执行已暂停。' };
  return flow;
}
function resumeWorkflow(flow, now) {
  if (!['PAUSED', 'HANDOFF', 'NEEDS_ATTENTION'].includes(flow.status)) throw flowError('WORKFLOW_NOT_PAUSED', '该工作流不处于可恢复状态。');
  for (const n of flow.nodes) if (n.status === 'FAILED') { n.status = 'PENDING'; delete n.error; delete n.taskId; }
  if (flow.nodes.some(n => n.status === 'CANCELLED')) throw flowError('NODE_CANCELLED', '工作流中已有取消的节点，请重新提出需求，不能静默重新授权。');
  flow.status = 'READY'; flow.revision += 1;
  flow.events.push({ at: now, event: 'WORKFLOW_RESUMED', detail: '保留已完成节点；未完成敏感节点需要新的确认。' }); refresh(flow, now); return flow;
}
function cancelWorkflow(flow, now) {
  if (flow.status === 'SUCCEEDED') throw flowError('WORKFLOW_FINISHED', '工作流已完成；已执行业务不能整体撤回。');
  if (flow.nodes.some(n => n.status === 'WAITING_SETTLEMENT')) throw flowError('WORKFLOW_PENDING_SETTLEMENT', '存在待对账业务，请先核对结果，不能假装全部撤回。');
  for (const n of flow.nodes) if (n.status !== 'SUCCEEDED') { n.status = 'CANCELLED'; delete n.taskId; }
  flow.status = 'CANCELLED'; flow.updatedAt = now; flow.revision += 1;
  flow.events.push({ at: now, event: 'WORKFLOW_CANCELLED', detail: '仅取消尚未执行的节点，已完成业务保留原回执。' }); return flow;
}
module.exports = { validateGraph, createWorkflow, readyNodes, recordRead, bindTask, settleTask, failNode, pauseWorkflow, resumeWorkflow, cancelWorkflow };
