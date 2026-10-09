// Cross-scene life events (赛题场景 6): "检测到我爱人生日 → 当月锁定 1000 元 → 生日前 2 天订鲜花蛋糕".
// The model may only name the event and its date; this module checks the date against the user's words
// and stored important dates, then expands it into a fixed DAG whose nodes reference upstream results.
// Every write node is still prepared as an ordinary task and confirmed on its own.
const DAY = 86400000;
const OFFSET = 8 * 3600000;
const FLOWER = { id: 'flower-demo', cents: 19900 };
const CAKE = { id: 'cake-demo', cents: 26900 };
const MIN_BUDGET = FLOWER.cents + CAKE.cents;

const localDay = now => new Date(now + OFFSET).toISOString().slice(0, 10);
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const validDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;

// Fictional "important dates" a real bank app would know from the user's own calendar/contacts settings.
function defaultEvents(now) {
  const today = localDay(now); const [y, m] = today.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, 15)).toISOString().slice(0, 10); // 15th of next month
  return [{ id: 'evt-spouse-birthday', label: '爱人生日', relation: '爱人', date: next, source: '演示账户预设的重要日期（虚构）', recurring: 'yearly' }];
}
function ensureLifeEvents(s, now) {
  if (!Array.isArray(s.lifeEvents)) s.lifeEvents = defaultEvents(s.createdAt || now);
  for (const e of s.lifeEvents) if (!e || typeof e.id !== 'string' || typeof e.label !== 'string' || !validDate(e.date))
    throw Object.assign(new Error('重要日期记录异常，已停止操作。'), { code: 'LIFE_EVENTS_INVALID', status: 503 });
  return s.lifeEvents;
}
function upcomingEvents(s, now, withinDays = 60) {
  const today = localDay(now); const limit = addDays(today, withinDays);
  return ensureLifeEvents(s, now).filter(e => e.date > today && e.date <= limit)
    .map(e => ({ ...e, daysLeft: Math.round((Date.parse(`${e.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Deterministic reading of a date the user actually said. Returns null when the sentence names no date.
function dateFromText(text, now) {
  const today = localDay(now); const [y, m] = today.split('-').map(Number);
  const pick = (year, month, day) => {
    const d = new Date(Date.UTC(year, month - 1, day)); if (d.getUTCMonth() !== month - 1) return 'INVALID';
    return d.toISOString().slice(0, 10);
  };
  let match = text.match(/下个?月\s*(\d{1,2})\s*[号日]/);
  if (match) { const month = m === 12 ? 1 : m + 1; return pick(m === 12 ? y + 1 : y, month, Number(match[1])); }
  match = text.match(/(?:这个?月|本月)\s*(\d{1,2})\s*[号日]/);
  if (match) return pick(y, m, Number(match[1]));
  match = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[号日]/);
  if (match) {
    const month = Number(match[1]); const day = Number(match[2]);
    const candidate = pick(y, month, day); if (candidate === 'INVALID') return 'INVALID';
    return candidate > today ? candidate : pick(y + 1, month, day);
  }
  return null;
}

/**
 * Validate a life_event_plan action against the sentence and stored events, then build the DAG.
 * Returns { clarify } or { goal, nodes, event }.
 */
function expandLifeEventPlan(action, s, now, text, { money }) {
  const events = ensureLifeEvents(s, now); const today = localDay(now);
  const said = dateFromText(text, now);
  if (said === 'INVALID') return { clarify: '你说的日期不存在，请确认是几月几号。' };
  // Match a stored date only by its relation ("爱人"), never by a generic word like "生日".
  const stored = events.find(e => text.includes(e.relation) || (typeof action.label === 'string' && action.label.includes(e.relation)));
  const date = said || stored?.date || null;
  if (!date) return { clarify: '请告诉我具体日期，例如“下个月15号是我爱人生日”；我不会替你猜日期。' };
  if (validDate(action.eventDate) && action.eventDate !== date)
    return { clarify: `模型理解的日期（${action.eventDate}）与你说的不一致（${date}），已停止；请再确认一次日期。` };
  const deliveryDate = addDays(date, -2);
  if (deliveryDate <= today) return { clarify: `离 ${date} 不足 3 天，来不及按“提前 2 天”安排配送；需要的话请直接告诉我想怎么处理。` };
  if (Date.parse(`${date}T00:00:00+08:00`) - now > 366 * DAY) return { clarify: '目标日期超过一年，暂不提前锁定资金。' };
  let amount = '1000';
  if (action.amount != null) {
    if (typeof action.amount !== 'string' || !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(action.amount)) return { clarify: '预算金额格式不正确，请用人民币元，例如 1000。' };
    amount = action.amount;
  }
  const [whole, frac = ''] = amount.split('.'); const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (cents < MIN_BUDGET) return { clarify: `预算至少需要 ${money(MIN_BUDGET)} 才够鲜花和蛋糕两项虚构报价，请调整金额。` };
  const label = (stored?.label || (typeof action.label === 'string' && action.label.trim()) || '重要日子').slice(0, 40);
  const eventAt = `${date}T00:00:00+08:00`; const deliveryAt = `${deliveryDate}T10:00:00+08:00`;
  const ref = (node, path) => ({ $ref: node, path });
  const nodes = [
    { id: 'reserve', dependsOn: [], action: { type: 'reserve_budget', amount, label: `${label}预算`, eventAt } },
    { id: 'flower', dependsOn: ['reserve'], action: { type: 'prepare_merchant_order', budgetId: ref('reserve', 'budget.id'), productId: FLOWER.id, deliveryAt } },
    { id: 'cake', dependsOn: ['reserve'], action: { type: 'prepare_merchant_order', budgetId: ref('reserve', 'budget.id'), productId: CAKE.id, deliveryAt } },
    { id: 'pay-flower', dependsOn: ['flower'], action: { type: 'pay_merchant_order', orderId: ref('flower', 'order.id') } },
    { id: 'pay-cake', dependsOn: ['cake'], action: { type: 'pay_merchant_order', orderId: ref('cake', 'order.id') } },
  ];
  return { event: { label, date, deliveryDate, cents, storedEventId: stored?.id || null },
    goal: `${label}（${date}）：现在锁定 ${money(cents)}，${deliveryDate} 送达鲜花和蛋糕`, nodes };
}

// Replace {$ref, path} placeholders with values from finished upstream nodes.
function resolveRefs(flow, action) {
  const out = {};
  for (const [key, value] of Object.entries(action)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.$ref === 'string') {
      const source = flow.nodes.find(n => n.id === value.$ref);
      if (!source || source.status !== 'SUCCEEDED') return { error: `上游步骤 ${value.$ref} 尚未完成，不能取得${key}。` };
      const resolved = String(value.path).split('.').reduce((obj, part) => (obj == null ? undefined : obj[part]), source.result);
      if (typeof resolved !== 'string' || !resolved) return { error: `上游步骤 ${value.$ref} 没有返回可用的${key}，已停止。` };
      out[key] = resolved;
    } else out[key] = value;
  }
  return { action: out };
}

module.exports = { ensureLifeEvents, upcomingEvents, dateFromText, expandLifeEventPlan, resolveRefs, MIN_BUDGET, localDay, addDays };
