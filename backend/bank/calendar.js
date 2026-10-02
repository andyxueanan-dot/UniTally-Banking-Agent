// Accounting calendar is Beijing time, independently of the process TZ.
const DAY = 86400000;
const OFFSET = 8 * 3600000;
const DAY_KEYS = ['day_before_yesterday', 'yesterday', 'today', 'tomorrow', 'day_after_tomorrow'];
const QUERY_KEYS = ['today', 'yesterday', 'day_before_yesterday', 'this_week', 'last_week'];
const isoDay = timestamp => new Date(timestamp).toISOString().slice(0, 10);
function beijingDate(now) { return isoDay(now + OFFSET); }
function calendarContext(now) {
  if (!Number.isFinite(now)) throw Error('Invalid reference time');
  const local = new Date(now + OFFSET);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const monday = start - ((local.getUTCDay() + 6) % 7) * DAY;
  const range = (from, to) => ({ startDate: isoDay(from), endDate: isoDay(to), startUtc: new Date(from - OFFSET).toISOString(), endExclusiveUtc: new Date(to + DAY - OFFSET).toISOString() });
  return { timeZone: 'Asia/Shanghai', utcOffset: '+08:00', utcNow: new Date(now).toISOString(), utcDate: isoDay(now),
    beijingNow: local.toISOString().slice(0, 19) + '+08:00', beijingDate: isoDay(start), weekStartsOn: 'Monday',
    relativeDates: Object.fromEntries(DAY_KEYS.map((key, i) => [key, isoDay(start + (i - 2) * DAY)])),
    ranges: { today: range(start, start), yesterday: range(start - DAY, start - DAY), day_before_yesterday: range(start - 2 * DAY, start - 2 * DAY), this_week: range(monday, monday + 6 * DAY), last_week: range(monday - 7 * DAY, monday - DAY) },
    note: '相对日期必须查此表，不自行加减。范围按北京时间自然日，UTC区间左闭右开；本周是周一至周日，不代表有未来交易。' };
}
function localScheduledInstant(key, time, now) {
  if (!DAY_KEYS.includes(key) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time || '')) throw Object.assign(Error('请明确日期和具体时分，不能猜测“早上”是几点。'), { code: 'EXPLICIT_TIME_REQUIRED' });
  return `${calendarContext(now).relativeDates[key]}T${time}:00+08:00`;
}
function relativeKeys(text) {
  const mapping = { 前天: 'day_before_yesterday', 昨天: 'yesterday', 昨日: 'yesterday', 今天: 'today', 今日: 'today', 明天: 'tomorrow', 明日: 'tomorrow', 后天: 'day_after_tomorrow', 本周: 'this_week', 这周: 'this_week', 上周: 'last_week', 上星期: 'last_week' };
  return [...new Set((text.match(/前天|昨天|昨日|今天|今日|明天|明日|后天|本周|这周|上周|上星期/g) || []).map(word => mapping[word]))];
}
function enforceTemporalPlan(plan, text, referenceNow, completedNow) {
  const refs = relativeKeys(text);
  const relevant = refs.length || plan.actions.some(a => a.relativeDateKey);
  if (relevant && beijingDate(referenceNow) !== beijingDate(completedNow)) throw Object.assign(Error('规划期间已跨过北京时间午夜，请重新确认日期后重试；未创建新操作。'), { code: 'DATE_CONTEXT_EXPIRED' });
  const clarify = reason => ({ ...plan, actions: [], question: reason });
  const actions = plan.actions.map(a => ({ ...a }));
  for (const a of actions) {
    if (['analyze', 'transactions'].includes(a.type) && refs.length) {
      if (refs.length !== 1 || !QUERY_KEYS.includes(refs[0])) return clarify('请明确一个账单日期或周范围；多个相对日期或日期消歧问题不能自动改成某一天的查询。');
      if (a.period !== refs[0]) return clarify('模型提取的账单期间与原话不一致，已停止查询；请确认具体日期或周范围。');
      if (/转账|转了|转过|转出/.test(text) && (a.type !== 'transactions' || a.category !== '转账')) return clarify('你询问的是历史转账，不能用消费总额或全部账单笔数代替，请确认转账查询范围。');
    }
    if (a.type === 'schedule_transfer') {
      if (a.relativeDateKey) {
        if (a.executeAt || refs.length !== 1 || a.relativeDateKey !== refs[0]) return clarify('预约日期存在冲突，请明确日期和具体时分。');
        // Only an explicit numeric clock expression can authorize conversion in this version.
        const clock = text.match(/(?:早上|上午|下午|晚上|中午)?\s*(\d{1,2})\s*(?::|：|点)(?:(\d{1,2})(?:分)?)?/);
        if (!clock || /半|一刻|三刻/.test(text)) return clarify('请补充明确的24小时制时间，例如09:00；不能替你猜测“早上”或含糊时刻。');
        let hour = Number(clock[1]); const minute = Number(clock[2] || 0);
        if (/下午|晚上/.test(clock[0]) && hour < 12) hour += 12;
        if (/上午|早上/.test(clock[0]) && hour === 12 || /中午/.test(clock[0]) && hour !== 12) return clarify('这个时刻可能有歧义，请使用24小时制HH:mm确认。');
        const expected = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
        if (a.localTime !== expected) return clarify('模型提取的时间与原话不一致，请使用24小时制明确确认。');
        a.executeAt = localScheduledInstant(a.relativeDateKey, a.localTime, referenceNow);
        delete a.relativeDateKey; delete a.localTime;
      } else if (refs.length) {
        // Do not accept a model-calculated absolute timestamp for a relative request.
        return clarify('相对日期预约必须由后台按北京时间换算，请给出例如“明天09:00”，再核对具体日期。');
      }
    }
    if (a.type === 'transfer' && refs.length) return clarify('你的需求包含日期条件，不能当成立即转账；历史记录请查询，未来预约请明确日期和具体时间。');
    if (a.type !== 'schedule_transfer' && (a.relativeDateKey || a.localTime)) return clarify('当前操作不支持这种相对日期参数，请明确所需业务。');
    if (refs.length && ['reserve_budget','prepare_merchant_order'].includes(a.type)) return clarify('生日预算或配送日期目前请使用明确的带时区日期；不会让模型自行推算相对日期。');
  }
  return { ...plan, actions };
}
module.exports = { DAY_KEYS, QUERY_KEYS, calendarContext, beijingDate, localScheduledInstant, relativeKeys, enforceTemporalPlan };
