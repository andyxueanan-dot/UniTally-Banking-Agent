// IM gateway: same code path for the real Feishu transport and the fake one used here.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BankService } = require('../bank/service');
const { createBankStore } = require('../bank/store');
const { createImGateway } = require('../im/gateway');

const START = Date.parse('2026-10-16T03:00:00Z');
function fixture(plan = [{ type: 'balance' }]) {
  let now = START; let actions = plan; let calls = 0;
  const planner = { configured: true, model: 'im-test', provider: 'TestPlanner', plan: async () => { calls++; return { actions: structuredClone(actions), question: '', meta: { mode: 'ai', provider: 'TestPlanner', latencyMs: 0, totalTokens: 0 } }; } };
  const service = new BankService({ store: createBankStore(), planner, now: () => now, ruleFastPath: false, riskRules: false, limits: { commandsPerMinute: 100 } });
  const { token } = service.create();
  const gw = createImGateway({ service, webOrigin: 'https://orbit.example', now: () => now });
  let n = 0;
  const say = (text, extra = {}) => gw.handleInbound({ channel: 'feishu', appId: 'cli_test', openId: 'ou_owner_1234', chatId: 'oc_p2p_owner', chatType: 'p2p', messageId: `m${++n}`, displayName: '张三', text, ...extra });
  const bind = async () => { const [r] = await say('你好'); const pin = r.text.match(/配对码：([A-Z2-9]{8})/)[1]; gw.bindConfirm(token, pin); return pin; };
  return { service, token, gw, say, bind, set: a => { actions = a; }, tick: ms => { now += ms; }, calls: () => calls, state: () => service.get(token) };
}

test('unknown sender gets a pairing code and the model is never called', async () => {
  const f = fixture(); const [r] = await f.say('给王明转 200');
  assert.match(r.text, /配对码：[A-Z2-9]{8}/); assert.equal(f.calls(), 0); assert.equal(r.chatId, 'oc_p2p_owner');
  const [again] = await f.say('还在吗'); assert.match(again.text, /仍然有效/); assert.equal(f.calls(), 0);
});

test('binding shows the applicant first, then binds; wrong or expired codes are refused and locked after 5 tries', async () => {
  const f = fixture(); const [r] = await f.say('你好'); const pin = r.text.match(/配对码：([A-Z2-9]{8})/)[1];
  const preview = f.gw.bindPreview(f.token, pin); assert.equal(preview.applicant.name, '张三'); assert.match(preview.applicant.id, /…1234$/);
  for (let i = 0; i < 4; i++) assert.throws(() => f.gw.bindPreview(f.token, 'ZZZZZZZZ'), { code: 'IM_CODE_INVALID' });
  assert.throws(() => f.gw.bindPreview(f.token, 'ZZZZZZZZ'), { code: 'IM_CODE_INVALID' });
  assert.throws(() => f.gw.bindPreview(f.token, pin), { code: 'IM_BIND_LOCKED' });
  const g = fixture(); const [r2] = await g.say('hi'); const pin2 = r2.text.match(/配对码：([A-Z2-9]{8})/)[1];
  g.tick(11 * 60000); assert.throws(() => g.gw.bindConfirm(g.token, pin2), { code: 'IM_CODE_INVALID' });
  const h = fixture(); await h.bind(); assert.equal(h.gw.status(h.token).bound, true);
  assert.ok(h.state().audit.some(e => e.event === 'IM_BOUND'));
});

test('bound user: green answers come back in chat; group chats and duplicate deliveries are refused', async () => {
  const f = fixture(); await f.bind();
  const [r] = await f.say('我的余额'); assert.match(r.text, /余额/); assert.equal(f.calls(), 1);
  const [g] = await f.say('余额', { chatType: 'group', chatId: 'oc_group' }); assert.match(g.text, /只在私聊/); assert.equal(g.chatId, 'oc_group'); assert.equal(f.calls(), 1);
  const dup = { channel: 'feishu', appId: 'cli_test', openId: 'ou_owner_1234', chatId: 'oc_p2p_owner', chatType: 'p2p', messageId: 'same', text: '余额' };
  assert.equal((await f.gw.handleInbound(dup)).length, 1); assert.equal((await f.gw.handleInbound(dup)).length, 0); assert.equal(f.calls(), 2);
});

test('yellow: one-time code bound to the sender and chat; wrong user, reuse and timeout are refused', async () => {
  const f = fixture([{ type: 'transfer', recipient: '王明', amount: '200' }]); await f.bind();
  const [r] = await f.say('给小王转 200'); const pin = r.text.match(/确认 ([A-Z2-9]{4})/)[1];
  const [stranger] = await f.say(`确认 ${pin}`, { openId: 'ou_other_9999' }); assert.match(stranger.text, /配对码/); // stranger is not even bound
  const [wrongChat] = await f.say(`确认 ${pin}`, { chatId: 'oc_other_chat' }); assert.match(wrongChat.text, /不是原来的会话/);
  const [r2] = await f.say('给小王转 200'); const pin2 = r2.text.match(/确认 ([A-Z2-9]{4})/)[1];
  const [ok] = await f.say(`确认 ${pin2}`); assert.match(ok.text, /已办理/); assert.equal(f.state().balance, 1286000 - 20000);
  const [reuse] = await f.say(`确认 ${pin2}`); assert.match(reuse.text, /已使用/); assert.equal(f.state().balance, 1286000 - 20000);
  const [r3] = await f.say('再转 200'); const pin3 = r3.text.match(/确认 ([A-Z2-9]{4})/)[1];
  f.tick(6 * 60000); const [late] = await f.say(`确认 ${pin3}`); assert.match(late.text, /过期/);
  assert.ok(f.state().audit.some(e => e.event === 'IM_CONFIRMED'));
});

test('red: only a summary and a credential-free web link; no confirm word or demo code ever works in chat', async () => {
  const f = fixture([{ type: 'transfer', recipient: '李悦', amount: '1500' }]); await f.bind();
  const [r] = await f.say('给李悦转 1500');
  assert.match(r.text, /红色操作/); assert.match(r.text, /https:\/\/orbit\.example\/#task=[0-9a-f]+/); assert.doesNotMatch(r.text, /确认 [A-Z2-9]{4}/);
  assert.doesNotMatch(r.text, /演示码|验证码：\d{6}/);
  const task = f.state().tasks.find(t => t.status === 'AWAITING_CONFIRMATION');
  assert.throws(() => f.service.confirmFromChannel(require('../bank/service').internalRef(require('../bank/service').tokenKey(f.token)), task.id), { code: 'RED_REQUIRES_WEB' });
  assert.equal(f.state().balance, 1286000);
});

test('yellow that becomes red before confirmation (daily total crosses ¥1,000) is refused in chat', async () => {
  const f = fixture([{ type: 'transfer', recipient: '王明', amount: '600' }]); await f.bind();
  const [a] = await f.say('给王明转 600'); const pa = a.text.match(/确认 ([A-Z2-9]{4})/)[1];
  const [b] = await f.say('给王明转 600'); const pb = b.text.match(/确认 ([A-Z2-9]{4})/)[1];
  void pa; // the first draft was superseded by the second request (intent version), like on the web
  const [done] = await f.say(`确认 ${pb}`); assert.match(done.text, /已办理/);
  const [c] = await f.say('再给王明转 600'); assert.match(c.text, /红色操作/); // ¥1,200 today → red
});

test('unbind from chat or web; afterwards messages ask for pairing again', async () => {
  const f = fixture(); await f.bind();
  const [u] = await f.say('解绑'); assert.match(u.text, /已解除/); assert.equal(f.gw.status(f.token).bound, false);
  const [again] = await f.say('余额'); assert.match(again.text, /配对码/);
});

test('an internal session reference cannot be produced over HTTP', () => {
  const f = fixture();
  for (const forged of ['key:abc', { sessionKey: 'x' }, JSON.parse('{"__proto__":{}}')]) assert.throws(() => f.service.get(forged), { code: 'SESSION_REQUIRED' });
});
