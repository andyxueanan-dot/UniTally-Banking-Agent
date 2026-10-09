// Deterministic accounting queries. Model text is never a source for numeric totals.
const { QUERY_KEYS, calendarContext } = require('./calendar');
const PERIODS = ['this_month', 'last_month', 'compare', 'this_year', 'last_year', 'all', ...QUERY_KEYS];
const CATEGORIES = ['餐饮', '购物', '交通', '订阅', '学习', '转账'];
const cny = value => `¥${(value / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function localDate(now) { return new Date(now + 8 * 3600000).toISOString().slice(0, 10); }
function bounds(period, now) {
  if (QUERY_KEYS.includes(period)) { const r = calendarContext(now).ranges[period]; return { ...r, label: `${r.startDate}${r.endDate === r.startDate ? '' : ' 至 ' + r.endDate}（北京时间）` }; }
  const today = localDate(now); const year = Number(today.slice(0, 4)); const month = Number(today.slice(5, 7));
  const previous = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
  if (period === 'last_month') return { prefix: previous, label: previous };
  if (period === 'this_year') return { prefix: `${year}-`, label: `${year} 年` };
  if (period === 'last_year') return { prefix: `${year - 1}-`, label: `${year - 1} 年` };
  if (period === 'all') return { prefix: '', label: '全部已有记录' };
  return { prefix: today.slice(0, 7), label: today.slice(0, 7) };
}
function filterRows(transactions, { period = 'this_month', category, merchant, includeTransfers = false } = {}, now = Date.now()) {
  if (!PERIODS.includes(period)) throw Object.assign(Error('不支持该账单期间。'), { code: 'INVALID_PERIOD' });
  if (category && !CATEGORIES.includes(category)) throw Object.assign(Error('请使用已支持的消费分类。'), { code: 'INVALID_CATEGORY' });
  if (merchant != null && (typeof merchant !== 'string' || merchant.length > 80)) throw Object.assign(Error('商户筛选必须是最多80字的文本。'), { code: 'INVALID_MERCHANT' });
  const range = bounds(period, now);
  const rows = transactions.filter(t => (range.startDate ? t.date >= range.startDate && t.date <= range.endDate : t.date.startsWith(range.prefix)) && (includeTransfers || t.type === 'expense') &&
    (!category || t.category === category) && (!merchant || t.merchant.includes(merchant)));
  return { rows, range };
}
function grouped(rows) { return rows.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + t.cents; return acc; }, {}); }
function duplicates(rows) {
  const grouped = new Map();
  for (const row of rows.filter(r => r.type === 'expense')) {
    const key = JSON.stringify([row.date, row.merchant, row.cents]);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return [...grouped.values()].filter(group => group.length > 1).map(group => ({
    id: `duplicate-${group[0].id}`, kind: 'possible_duplicate', merchant: group[0].merchant, date: group[0].date,
    cents: group[0].cents, rowIds: group.map(t => t.id), rows: group,
    assessment: '仅相同日期、商户与金额的记录候选，不能据此断言重复扣款。',
  }));
}
// Explainable alert rules over the whole history (no model involved). Each alert names the rule and evidence.
const median = values => { const v = [...values].sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : 0; };
function alerts(rows, history) {
  const out = []; const expenses = history.filter(t => t.type === 'expense');
  for (const row of rows.filter(r => r.type === 'expense')) {
    const earlier = expenses.filter(t => t.id !== row.id && t.date <= row.date);
    if (row.cents >= 30000 && !earlier.some(t => t.merchant === row.merchant))
      out.push({ id: `new-merchant-${row.id}`, kind: 'large_new_merchant', rowIds: [row.id], rows: [row], merchant: row.merchant, date: row.date, cents: row.cents,
        assessment: `首次出现的商户单笔 ${cny(row.cents)}（规则：新商户且 ≥ ¥300）。请确认是否本人消费。` });
    // Baseline = earlier spending in the same category only, so a row is judged against history, not the future.
    const peers = expenses.filter(t => t.id !== row.id && t.category === row.category && t.date < row.date).map(t => t.cents);
    const m = median(peers);
    if (peers.length >= 3 && row.cents >= 20000 && row.cents >= 3 * m)
      out.push({ id: `outlier-${row.id}`, kind: 'category_outlier', rowIds: [row.id], rows: [row], merchant: row.merchant, date: row.date, cents: row.cents,
        assessment: `${row.category}类单笔 ${cny(row.cents)}，是同类中位数 ${cny(m)} 的 ${(row.cents / m).toFixed(1)} 倍（规则：≥ 3 倍且 ≥ ¥200）。` });
  }
  return out;
}
function analyzeLedger(transactions, query = {}, now = Date.now()) {
  const { rows, range } = filterRows(transactions, query, now);
  const total = rows.reduce((n, t) => n + t.cents, 0);
  const categoryMap = grouped(rows);
  const categories = Object.entries(categoryMap).map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents);
  const previous = filterRows(transactions, { ...query, period: 'last_month' }, now).rows;
  const priorTotal = previous.reduce((n, t) => n + t.cents, 0);
  const previousMap = grouped(previous);
  const comparison = query.period === 'compare';
  const drivers = comparison ? [...new Set([...Object.keys(categoryMap), ...Object.keys(previousMap)])].map(name => ({ name,
    currentCents: categoryMap[name] || 0, previousCents: previousMap[name] || 0, deltaCents: (categoryMap[name] || 0) - (previousMap[name] || 0),
    rowIds: rows.filter(t => t.category === name).map(t => t.id), previousRowIds: previous.filter(t => t.category === name).map(t => t.id),
  })).sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents)) : [];
  const anomalies = duplicates(rows);
  const unusual = alerts(rows, transactions);
  const filterLabel = [query.category, query.merchant].filter(Boolean).join(' · ');
  const delta = total - priorTotal;
  const first = drivers.find(d => d.deltaCents > 0);
  const comparisonText = comparison ? `；上月 ${cny(priorTotal)}，${delta >= 0 ? '增加' : '减少'} ${cny(Math.abs(delta))}。${first ? `增加最多的分类是${first.name}（+${cny(first.deltaCents)}）` : ''}` : '';
  const text = `${range.label}${filterLabel ? `（${filterLabel}）` : ''}消费共 ${rows.length} 笔，合计 ${cny(total)}${comparisonText}。\n${rows.length ? '' : '该期间/筛选没有已记录消费；不代表真实生活中没有消费。\n'}${anomalies.length ? `发现 ${anomalies.length} 组同日同商户同金额的记录，请核对是否重复扣款。` : '未发现同日同商户同金额的重复候选。'}${unusual.length ? `另有 ${unusual.length} 笔异常提醒：${unusual.map(a => `${a.merchant} ${cny(a.cents)}`).join('、')}。` : ''}\n统计只覆盖本地虚构记录，不包含转账，不是完整银行财务报表。`;
  return { type: 'analysis', risk: 'green', period: range.label, filters: { category: query.category || null, merchant: query.merchant || null },
    total, previous: priorTotal, categories, rows, anomalyIds: anomalies.flatMap(g => g.rowIds.slice(1)), anomalies, alerts: unusual, drivers,
    sourceRowIds: rows.map(t => t.id), coverage: { sampleOnly: true, from: rows.map(t => t.date).sort()[0] || null, to: rows.map(t => t.date).sort().at(-1) || null }, text };
}
function ledgerDetails(transactions, query = {}, now = Date.now()) {
  const { rows, range } = filterRows(transactions, { ...query, includeTransfers: true }, now);
  const expense = rows.filter(t => t.type === 'expense').reduce((n, t) => n + t.cents, 0);
  const transfers = rows.filter(t => t.type === 'transfer').reduce((n, t) => n + t.cents, 0);
  return { type: 'transactions', risk: 'green', period: range.label, rows, sourceRowIds: rows.map(t => t.id),
    expenseTotal: expense, transferTotal: transfers, text: `${range.label}共找到 ${rows.length} 条虚构账单记录：消费 ${cny(expense)}，转账 ${cny(transfers)}。两者分开统计，不把转账当成消费。` };
}
const REPORT_PERIODS = ['this_month', 'last_month', 'this_year', 'last_year'];
// 月度 / 年度账单报告: a fixed structure built only from ledger rows, so every number can be traced.
function billReport(transactions, { period = 'last_month' } = {}, now = Date.now()) {
  if (!REPORT_PERIODS.includes(period)) throw Object.assign(Error('账单报告只支持本月、上月、今年、去年。'), { code: 'INVALID_PERIOD' });
  const yearly = period.endsWith('year');
  const previousPeriod = { this_month: 'last_month', this_year: 'last_year' }[period];
  const range = bounds(period, now);
  const inRange = transactions.filter(t => t.date.startsWith(range.prefix));
  const spend = inRange.filter(t => t.type === 'expense');
  const total = spend.reduce((n, t) => n + t.cents, 0);
  const transfersOut = inRange.filter(t => t.type === 'transfer').reduce((n, t) => n + t.cents, 0);
  const inflow = inRange.filter(t => ['aa_receipt', 'refund', 'investment_redeem'].includes(t.type)).reduce((n, t) => n + t.cents, 0);
  const categories = Object.entries(grouped(spend)).map(([name, cents]) => ({ name, cents, share: total ? Math.round(cents / total * 1000) / 10 : 0 })).sort((a, b) => b.cents - a.cents);
  const merchants = Object.entries(spend.reduce((m, t) => { m[t.merchant] = (m[t.merchant] || 0) + t.cents; return m; }, {}))
    .map(([name, cents]) => ({ name, cents, count: spend.filter(t => t.merchant === name).length })).sort((a, b) => b.cents - a.cents).slice(0, 5);
  let previousTotal = null;
  if (previousPeriod) previousTotal = transactions.filter(t => t.type === 'expense' && t.date.startsWith(bounds(previousPeriod, now).prefix)).reduce((n, t) => n + t.cents, 0);
  else if (period === 'last_month') { const [y, m] = range.prefix.split('-').map(Number); const p = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7); previousTotal = transactions.filter(t => t.type === 'expense' && t.date.startsWith(p)).reduce((n, t) => n + t.cents, 0); }
  else if (period === 'last_year') { const y = Number(range.prefix.slice(0, 4)) - 1; previousTotal = transactions.filter(t => t.type === 'expense' && t.date.startsWith(`${y}-`)).reduce((n, t) => n + t.cents, 0); }
  const subscriptions = spend.filter(t => t.category === '订阅').reduce((n, t) => n + t.cents, 0);
  const duplicateGroups = duplicates(spend); const unusual = alerts(spend, transactions);
  const days = new Set(spend.map(t => t.date)).size;
  const highlights = [];
  if (categories[0]) highlights.push(`最大支出是${categories[0].name}，${cny(categories[0].cents)}，占 ${categories[0].share}%。`);
  if (previousTotal) { const d = total - previousTotal; highlights.push(`比${yearly ? '上一年' : '上个月'}${d >= 0 ? '多' : '少'} ${cny(Math.abs(d))}（${previousTotal ? Math.round(d / previousTotal * 100) : 0}%）。`); }
  if (subscriptions) highlights.push(`订阅类合计 ${cny(subscriptions)}，可以在"订阅与代扣"里逐项检查是否还在使用。`);
  if (duplicateGroups.length) highlights.push(`有 ${duplicateGroups.length} 组同日同商户同金额的扣款，建议核对是否重复。`);
  if (unusual.length) highlights.push(`有 ${unusual.length} 笔异常提醒：${unusual.map(a => a.merchant).join('、')}。`);
  if (!spend.length) highlights.push('这一期没有消费记录。');
  return { type: 'report', risk: 'green', period: range.label, periodKey: period, yearly, total, count: spend.length, activeDays: days,
    transfersOut, inflow, previousTotal, categories, topMerchants: merchants, subscriptions, duplicates: duplicateGroups, alerts: unusual, highlights,
    sourceRowIds: inRange.map(t => t.id),
    text: `${range.label}账单报告：消费 ${spend.length} 笔，合计 ${cny(total)}；转出 ${cny(transfersOut)}，退回/到账 ${cny(inflow)}。${highlights.join('')}` };
}
module.exports = { PERIODS, CATEGORIES, REPORT_PERIODS, analyzeLedger, ledgerDetails, billReport, filterRows, duplicates, alerts, bounds };
