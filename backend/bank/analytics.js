// Deterministic accounting queries. Model text is never a source for numeric totals.
const PERIODS = ['this_month', 'last_month', 'compare', 'this_year', 'last_year', 'all'];
const CATEGORIES = ['餐饮', '购物', '交通', '订阅', '学习', '转账'];
const cny = value => `¥${(value / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function localDate(now) { return new Date(now + 8 * 3600000).toISOString().slice(0, 10); }
function bounds(period, now) {
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
  const rows = transactions.filter(t => t.date.startsWith(range.prefix) && (includeTransfers || t.type === 'expense') &&
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
  const filterLabel = [query.category, query.merchant].filter(Boolean).join(' · ');
  const delta = total - priorTotal;
  const first = drivers.find(d => d.deltaCents > 0);
  const comparisonText = comparison ? `；上月 ${cny(priorTotal)}，${delta >= 0 ? '增加' : '减少'} ${cny(Math.abs(delta))}。${first ? `增加最多的分类是${first.name}（+${cny(first.deltaCents)}）` : ''}` : '';
  const text = `${range.label}${filterLabel ? `（${filterLabel}）` : ''}消费共 ${rows.length} 笔，合计 ${cny(total)}${comparisonText}。\n${rows.length ? '' : '该期间/筛选没有已记录消费；不代表真实生活中没有消费。\n'}${anomalies.length ? `发现 ${anomalies.length} 组需核对记录，请展开对应交易证据；尚未确认重复扣款。` : '未发现同日同商户同金额的重复候选。'}\n统计只覆盖本地虚构记录，不包含转账，不是完整银行财务报表。`;
  return { type: 'analysis', risk: 'green', period: range.label, filters: { category: query.category || null, merchant: query.merchant || null },
    total, previous: priorTotal, categories, rows, anomalyIds: anomalies.flatMap(g => g.rowIds.slice(1)), anomalies, drivers,
    sourceRowIds: rows.map(t => t.id), coverage: { sampleOnly: true, from: rows.map(t => t.date).sort()[0] || null, to: rows.map(t => t.date).sort().at(-1) || null }, text };
}
function ledgerDetails(transactions, query = {}, now = Date.now()) {
  const { rows, range } = filterRows(transactions, { ...query, includeTransfers: true }, now);
  const expense = rows.filter(t => t.type === 'expense').reduce((n, t) => n + t.cents, 0);
  const transfers = rows.filter(t => t.type === 'transfer').reduce((n, t) => n + t.cents, 0);
  return { type: 'transactions', risk: 'green', period: range.label, rows, sourceRowIds: rows.map(t => t.id),
    expenseTotal: expense, transferTotal: transfers, text: `${range.label}共找到 ${rows.length} 条虚构账单记录：消费 ${cny(expense)}，转账 ${cny(transfers)}。两者分开统计，不把转账当成消费。` };
}
module.exports = { PERIODS, CATEGORIES, analyzeLedger, ledgerDetails, filterRows, duplicates, bounds };
