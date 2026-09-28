const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorkflow, validateGraph, readyNodes, recordRead, bindTask, settleTask, failNode, pauseWorkflow, resumeWorkflow, cancelWorkflow } = require('../bank/workflow');
const now = 100000;
const basic = () => createWorkflow({ goal: '先查询再转账，最后查询卡片', actions: [{ type: 'balance' }, { type: 'transfer' }, { type: 'cards' }] }, now);
test('graph validates missing, duplicate, self and cyclic dependencies', () => {
  for (const nodes of [[], [{ id: 'a', action: {}, dependsOn: ['missing'] }], [{ id: 'a', action: { type: 'balance' }, dependsOn: ['a'] }]]) assert.throws(() => validateGraph(nodes));
  assert.throws(() => validateGraph([{ id: 'a', action: { type: 'balance' }, dependsOn: ['b'] }, { id: 'b', action: { type: 'balance' }, dependsOn: ['a'] }]), { code: 'CYCLIC_GRAPH' });
});
test('dependency order cannot be bypassed even when executing a read node', () => {
  const f = basic(); assert.deepEqual(readyNodes(f).map(n => n.id), ['step-1']);
  assert.throws(() => recordRead(f, 'step-3', {}, now), { code: 'NODE_NOT_READY' });
  recordRead(f, 'step-1', { balance: 1000 }, now); assert.deepEqual(readyNodes(f).map(n => n.id), ['step-2']);
});
test('approval is not success; receipt settlement unlocks dependencies exactly once', () => {
  const f = basic(); recordRead(f, 'step-1', {}, now); bindTask(f, 'step-2', { id: 'task-a' }, now);
  assert.equal(f.status, 'AWAITING_CONFIRMATION'); assert.equal(readyNodes(f).length, 0);
  settleTask(f, { id: 'task-a', status: 'PENDING_REVIEW' }, now); assert.equal(f.status, 'WAITING_SETTLEMENT'); assert.equal(readyNodes(f).length, 0);
  settleTask(f, { id: 'task-a', status: 'SUCCEEDED', receipt: { id: 'receipt-a' } }, now);
  settleTask(f, { id: 'task-a', status: 'SUCCEEDED', receipt: { id: 'receipt-a' } }, now);
  recordRead(f, 'step-3', {}, now); assert.equal(f.status, 'SUCCEEDED'); assert.equal(f.nodes[1].attempts, 1);
});
test('pause preserves completed nodes, removes unconfirmed authorization and resumes from boundary', () => {
  const f = basic(); recordRead(f, 'step-1', {}, now); bindTask(f, 'step-2', { id: 'task-a' }, now);
  pauseWorkflow(f, now); assert.equal(readyNodes(f).length, 0); assert.equal(f.nodes[1].taskId, undefined);
  resumeWorkflow(f, now); assert.equal(f.nodes[0].status, 'SUCCEEDED'); assert.equal(readyNodes(f)[0].id, 'step-2');
  bindTask(f, 'step-2', { id: 'task-b' }, now); assert.throws(() => settleTask(f, { id: 'task-a', status: 'SUCCEEDED' }, now), { code: 'TASK_NODE_MISMATCH' });
});
test('handoff is explicitly local preparation, not a fictitious human response', () => {
  const f = basic(); pauseWorkflow(f, now, { handoff: true, reason: '需要核查收款人' });
  assert.equal(f.status, 'HANDOFF'); assert.equal(f.handoff.status, 'PREPARED_NOT_SENT'); assert.match(f.handoff.note, /没有真人客服/); assert.equal(readyNodes(f).length, 0);
});
test('failure blocks downstream actions and explicit resume can retry only failed node', () => {
  const f = basic(); recordRead(f, 'step-1', {}, now); failNode(f, 'step-2', '余额不足', now);
  assert.equal(f.status, 'NEEDS_ATTENTION'); assert.equal(readyNodes(f).length, 0); resumeWorkflow(f, now);
  assert.equal(readyNodes(f)[0].id, 'step-2'); assert.equal(f.nodes[0].attempts, 1);
});
test('cancellation preserves finished side effects and refuses pending settlements', () => {
  const f = basic(); recordRead(f, 'step-1', {}, now); cancelWorkflow(f, now);
  assert.equal(f.nodes[0].status, 'SUCCEEDED'); assert.equal(f.nodes[1].status, 'CANCELLED');
  const g = basic(); recordRead(g, 'step-1', {}, now); bindTask(g, 'step-2', { id: 't' }, now); settleTask(g, { id: 't', status: 'PENDING_REVIEW' }, now);
  assert.throws(() => cancelWorkflow(g, now), { code: 'WORKFLOW_PENDING_SETTLEMENT' });
});
test('a real diamond DAG permits independent reads but joins only after both finish', () => {
  const f = createWorkflow({ goal: '并行核对', nodes: [{ id: 'balance', dependsOn: [], action: { type: 'balance' } }, { id: 'cards', dependsOn: [], action: { type: 'cards' } }, { id: 'transfer', dependsOn: ['balance', 'cards'], action: { type: 'transfer' } }] }, now);
  assert.equal(readyNodes(f).length, 2); recordRead(f, 'balance', {}, now);
  assert.throws(() => bindTask(f, 'transfer', { id: 't' }, now), { code: 'NODE_NOT_READY' }); recordRead(f, 'cards', {}, now);
  assert.equal(readyNodes(f)[0].id, 'transfer');
});
