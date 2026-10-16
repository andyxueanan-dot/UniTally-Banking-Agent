// IM channel gateway (赛题："用户可通过 APP、IM 等渠道与 Agent 联通").
// Design follows OpenClaw's channel model (studied from its MIT source, not copied):
//  • a transport only parses inbound events and sends text; everything else is channel-agnostic;
//  • unknown senders get a one-time pairing code and never reach the model; the owner approves it
//    in the already signed-in web page, so a code shown on a projector cannot be hijacked;
//  • control words ("确认 XXXX") are intercepted by code before the model; model text has no authority;
//  • green answers in chat; yellow can be confirmed in chat with a task-bound one-time code;
//    red only gets a summary and a link to the web page (no credential in the link);
//  • replies always go back to the inbound chat; group chats are refused; deliveries are de-duplicated.
const { randomInt, createHash } = require('node:crypto');
const { internalRef } = require('../bank/service');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const PAIR_TTL = 10 * 60000; const CONFIRM_TTL = 5 * 60000; const SEEN_TTL = 24 * 3600000;
const PAIR_PER_MINUTE = 30; const BIND_ATTEMPTS = 5;
const code = n => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const hash = v => createHash('sha256').update(String(v)).digest('hex');
const mask = id => (id.length > 6 ? `${id.slice(0, 3)}…${id.slice(-4)}` : '***');
const fail = (code, message, status = 400) => { throw Object.assign(new Error(message), { code, status }); };

function createImGateway({ service, webOrigin = '', now = () => Date.now(), channelName = '飞书' }) {
  const store = service.store;
  const queues = new Map(); // per IM user serialization
  const im = db => {
    db.im ||= { bindings: [], pairings: [], seen: {}, confirms: [], issued: [] };
    for (const k of ['bindings', 'pairings', 'confirms', 'issued']) if (!Array.isArray(db.im[k])) db.im[k] = [];
    if (!db.im.seen || typeof db.im.seen !== 'object') db.im.seen = {};
    return db.im;
  };
  const who = msg => `${msg.channel}:${msg.appId || '-'}:${msg.openId}`;
  const sessionAudit = (db, key, event, detail) => {
    const s = db.sessions[key]; if (!s) return;
    s.audit.push({ id: hash(`${key}${event}${now()}${Math.random()}`).slice(0, 24), at: now(), event, detail, taskId: null });
  };

  function serial(id, fn) {
    const prev = queues.get(id) || Promise.resolve();
    const next = prev.then(fn, fn); queues.set(id, next.finally(() => { if (queues.get(id) === next) queues.delete(id); }));
    return next;
  }

  // ----- inbound -----
  async function handleInbound(msg) {
    if (!msg || typeof msg.text !== 'string' || !msg.openId || !msg.chatId || !msg.messageId) return [];
    // De-duplicate redeliveries before anything else.
    const fresh = store.transact(db => {
      const state = im(db); const t = now();
      for (const [id, at] of Object.entries(state.seen)) if (at < t - SEEN_TTL) delete state.seen[id];
      if (state.seen[`${msg.channel}:${msg.messageId}`]) return false;
      state.seen[`${msg.channel}:${msg.messageId}`] = t; return true;
    });
    if (!fresh) return [];
    if (msg.chatType && msg.chatType !== 'p2p') return [reply(msg, `为保护账户安全，Orbit 只在私聊中办理业务，请直接私聊我。`)];
    return serial(who(msg), () => route(msg));
  }
  const reply = (msg, text) => ({ chatId: msg.chatId, text });

  async function route(msg) {
    const text = msg.text.trim().slice(0, 1000);
    const binding = store.read().im?.bindings?.find(b => b.who === who(msg));
    if (!binding) return [reply(msg, issuePairing(msg))];
    const ref = internalRef(binding.sessionKey);
    let m;
    if (/^解绑$/.test(text)) { unbindWho(who(msg)); return [reply(msg, `已解除与 Orbit 演示账户的绑定。之后发消息会重新收到配对码。`)]; }
    if ((m = text.match(/^(确认|取消)\s*([A-Z2-9]{4})$/i))) return [reply(msg, await confirmOrCancel(msg, ref, m[1], m[2].toUpperCase()))];
    if (/^(帮助|help|\?)$/i.test(text)) return [reply(msg, HELP)];
    let result;
    // Without an AI key the bot still demos the flow with the same fixed cases as the web page (labelled 固定案例).
    const demo = !service.planner?.configured ? OFFLINE_CASES[text.replace(/\s+/g, ' ')] : undefined;
    try { result = await service.chat(ref, demo ? { text, demo } : { text }); }
    catch (e) {
      if (e.code === 'SESSION_REQUIRED') { unbindWho(who(msg)); return [reply(msg, '绑定的演示账户已失效，已自动解绑；请重新发消息获取配对码。')]; }
      if (e.code === 'AI_NOT_CONFIGURED') return [reply(msg, `现在没有接入 AI。可以发这些固定案例：${Object.keys(OFFLINE_CASES).join('、')}；余额、卡片、账单查询也能直接问。`)];
      return [reply(msg, `没有办成：${e.message}`)];
    }
    return [reply(msg, render(msg, binding, result))];
  }

  function render(msg, binding, result) {
    const lines = [result.message.text];
    for (const r of result.message.results || []) {
      if (r.type !== 'proposal') continue;
      const task = result.state.tasks.find(t => t.id === r.taskId);
      if (!task) continue;
      if (task.risk === 'red') {
        lines.push(`\n【红色操作】${task.title}\n需要在 Orbit 网页完成身份验证：${webOrigin ? `${webOrigin}/#task=${task.id}` : `打开 Orbit 网页「待办事项」（#task=${task.id}）`}\n（请在你绑定时使用的那个已登录浏览器里打开；本链接不含任何登录凭证。）`);
        store.transact(db => sessionAudit(db, binding.sessionKey, 'IM_RED_REDIRECTED', `${task.id}：红色操作只在网页验证。`));
      } else {
        const c = issueConfirm(msg, binding, task);
        lines.push(`\n【待你确认】${task.title}\n回复「确认 ${c}」执行，回复「取消 ${c}」放弃；5 分钟内有效，只能用一次。`);
      }
    }
    return lines.join('\n');
  }

  function issuePairing(msg) {
    return store.transact(db => {
      const state = im(db); const t = now();
      state.pairings = state.pairings.filter(p => p.expiresAt > t);
      state.issued = state.issued.filter(at => at > t - 60000);
      const mine = state.pairings.find(p => p.who === who(msg));
      if (mine) return `你还没有绑定 Orbit 演示账户。上次发给你的配对码仍然有效（${Math.ceil((mine.expiresAt - t) / 60000)} 分钟内）。`;
      if (state.issued.length >= PAIR_PER_MINUTE) return '现在申请绑定的人太多，请一分钟后再发消息。';
      const pin = code(8);
      state.pairings.push({ codeHash: hash(pin), who: who(msg), channel: msg.channel, openIdMasked: mask(msg.openId), displayName: String(msg.displayName || '').slice(0, 20), expiresAt: t + PAIR_TTL, attempts: 0 });
      state.issued.push(t);
      return `你还没有绑定 Orbit 演示账户。\n配对码：${pin}\n请在 10 分钟内打开 Orbit 网页「个人中心 → IM 渠道」输入；网页会显示是谁在申请，确认后才生效。绑定前我不会调用 AI，也看不到你的账户。`;
    });
  }

  function issueConfirm(msg, binding, task) {
    return store.transact(db => {
      const state = im(db); const t = now();
      state.confirms = state.confirms.filter(c => c.expiresAt > t - 3600000).slice(-500);
      let pin; do pin = code(4); while (state.confirms.some(c => c.code === pin && !c.used && c.expiresAt > t));
      state.confirms.push({ code: pin, taskId: task.id, who: who(msg), chatId: msg.chatId, sessionKey: binding.sessionKey, expiresAt: t + CONFIRM_TTL, used: false });
      sessionAudit(db, binding.sessionKey, 'IM_CONFIRM_ISSUED', `${task.id}：IM 确认码已发出（5 分钟，一次性）。`);
      return pin;
    });
  }

  async function confirmOrCancel(msg, ref, verb, pin) {
    const check = store.transact(db => {
      const state = im(db); const t = now();
      const c = state.confirms.find(x => x.code === pin);
      const reject = reason => { sessionAudit(db, c?.sessionKey || '', 'IM_CONFIRM_REJECTED', `${pin}：${reason}`); return { error: reason }; };
      if (!c) return { error: '确认码不存在' };
      if (c.used) return reject('确认码已使用');
      if (c.expiresAt <= t) return reject('确认码已过期');
      if (c.who !== who(msg)) return reject('不是发起人本人');
      if (c.chatId !== msg.chatId) return reject('不是原来的会话');
      c.used = true; c.usedAt = t; return { taskId: c.taskId };
    });
    if (check.error) return `没有执行：${check.error}。如需办理请重新发起。`;
    try {
      if (verb === '取消') { service.cancel(ref, check.taskId); return '已取消，没有资金或卡片变动。'; }
      const out = service.confirmFromChannel(ref, check.taskId);
      if (out.error) return `没有执行：${out.error.message}`;
      const task = out.task;
      return task.status === 'SUCCEEDED' ? `已办理：${task.title}\n回执 ${task.receipt?.id}${task.result?.text ? `\n${task.result.text}` : ''}`
        : task.status === 'PENDING_REVIEW' ? '接口超时，结果待核对；资金已预留，请勿重复发起。' : `状态：${task.status}`;
    } catch (e) { return `没有执行：${e.message}`; }
  }

  // ----- web side (signed-in page) -----
  function findPairing(state, pin) {
    const t = now(); return state.pairings.find(p => p.codeHash === hash(String(pin || '').toUpperCase().replace(/\s/g, '')) && p.expiresAt > t);
  }
  function bindPreview(token, pin) {
    const key = service.sk(token);
    // A failed attempt must be committed before we report it, otherwise the lockout would never count.
    const out = store.transact(db => {
      if (!db.sessions[key]) fail('SESSION_REQUIRED', '演示会话已失效。', 401);
      const state = im(db); const s = db.sessions[key];
      if ((s.imBindLockedUntil || 0) > now()) return { error: ['IM_BIND_LOCKED', '配对码输错次数过多，请 10 分钟后再试。', 429] };
      const p = findPairing(state, pin);
      if (!p) { s.imBindFailures = (s.imBindFailures || 0) + 1; if (s.imBindFailures >= BIND_ATTEMPTS) { s.imBindLockedUntil = now() + PAIR_TTL; s.imBindFailures = 0; } return { error: ['IM_CODE_INVALID', '配对码不存在或已过期。', 400] }; }
      return { applicant: { channel: channelName, name: p.displayName || '（未提供昵称）', id: p.openIdMasked }, expiresAt: p.expiresAt };
    });
    if (out.error) fail(...out.error);
    return out;
  }
  function bindConfirm(token, pin) {
    const key = service.sk(token);
    const out = store.transact(db => {
      if (!db.sessions[key]) fail('SESSION_REQUIRED', '演示会话已失效。', 401);
      const state = im(db);
      if ((db.sessions[key].imBindLockedUntil || 0) > now()) fail('IM_BIND_LOCKED', '配对码输错次数过多，请 10 分钟后再试。', 429);
      const p = findPairing(state, pin);
      if (!p) fail('IM_CODE_INVALID', '配对码不存在或已过期。');
      state.pairings = state.pairings.filter(x => x !== p);
      state.bindings = state.bindings.filter(b => b.who !== p.who && b.sessionKey !== key);
      state.bindings.push({ who: p.who, channel: p.channel, sessionKey: key, openIdMasked: p.openIdMasked, displayName: p.displayName, boundAt: now() });
      db.sessions[key].imBindFailures = 0;
      sessionAudit(db, key, 'IM_BOUND', `已绑定 ${channelName} 用户 ${p.openIdMasked}；可在 IM 发"解绑"或在网页解除。`);
      return { bound: true, who: p.who };
    });
    return { bound: out.bound, status: status(token) };
  }
  function unbindWho(id) {
    store.transact(db => { const state = im(db); const b = state.bindings.find(x => x.who === id); state.bindings = state.bindings.filter(x => x.who !== id); if (b) sessionAudit(db, b.sessionKey, 'IM_UNBOUND', `已解除与 ${b.openIdMasked} 的绑定。`); });
  }
  function unbind(token) {
    const key = service.sk(token);
    const b = store.read().im?.bindings?.find(x => x.sessionKey === key);
    if (b) unbindWho(b.who);
    return status(token);
  }
  function status(token) {
    const key = service.sk(token);
    const b = store.read().im?.bindings?.find(x => x.sessionKey === key);
    return { channel: channelName, bound: Boolean(b), user: b ? { name: b.displayName || null, id: b.openIdMasked, boundAt: b.boundAt } : null };
  }
  return { handleInbound, bindPreview, bindConfirm, unbind, status };
}

const OFFLINE_CASES = Object.freeze({ '给小王转 200': 'transfer', '给李悦转 1200': 'large', '这个月的账单报告': 'bill_report', '挂失 8806': 'freeze', '转人工': 'handoff' });
const HELP = '可以直接用一句话办业务，例如：\n· 我的余额\n· 这个月的账单报告\n· 给小王转 200（会给你一个确认码）\n· 下个月15号是我爱人生日\n· 转人工\n红色操作（大额转账、挂失、改密码等）需要回到网页完成验证。发"解绑"可解除绑定。';
module.exports = { createImGateway, ALPHABET };
