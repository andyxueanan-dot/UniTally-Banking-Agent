// Deterministic fast path for short, unambiguous READ-ONLY requests.
// Zero tokens, works without any model, and is labelled honestly as "规则解析".
// It never produces a write action: anything that smells like money movement,
// card control, scheduling, conditions or amounts is left to the model (or refused offline).
const PERIOD_WORDS = [
  ['前天', 'day_before_yesterday'], ['昨天', 'yesterday'], ['今天', 'today'],
  ['本周', 'this_week'], ['这周', 'this_week'], ['这星期', 'this_week'], ['上周', 'last_week'], ['上星期', 'last_week'],
  ['这个月', 'this_month'], ['本月', 'this_month'], ['这月', 'this_month'], ['当月', 'this_month'],
  ['上个月', 'last_month'], ['上月', 'last_month'],
  ['今年', 'this_year'], ['本年', 'this_year'], ['去年', 'last_year'],
  ['全部', 'all'], ['所有', 'all'], ['历史', 'all'],
];
// Any of these means the sentence may carry intent beyond a plain lookup.
const NOT_A_LOOKUP = /[0-9０-９]|[一二两三四五六七八九十百千万]+[元块万]|转|汇|付|冻|挂失|锁|解|取消|撤|买|购|赎|申请|限额|额度|改|设|订阅|代扣|AA|预约|定时|预留|预算|订单|鲜花|蛋糕|理财|测评|问卷|密码|不要|别|如果|要是|美元|马币|林吉特|欧元|港币|日元|给|向|收款|商户|咖啡|餐|分类|比|为什么|怎么|多在哪|忽略|管理员|系统|指令|提示|规则|密钥|key/i;
const POLITE = '(?:请|麻烦|帮我|帮忙|帮我看看|能不能|可以)?';
const LOOK = '(?:查|看|查询|查看|看看|查一下|看一下|查查|统计|分析|显示|告诉我)?(?:一下)?';
const MINE = '(?:我的|我|账户|账户的|现在|当前|目前)*';
const TAIL = '(?:是多少|有多少|多少|情况|怎么样|如何)?[?？。!！]*';
const BALANCE = new RegExp(`^${POLITE}${LOOK}${MINE}(?:余额|可用余额|还有多少钱|有多少钱|还剩多少钱|剩多少钱|账户里有多少)${TAIL}$`);
const CARDS = new RegExp(`^${POLITE}${LOOK}${MINE}(?:卡片|卡|银行卡|卡片状态|卡状态|有哪些卡|有几张卡|几张卡)${TAIL}$`);
const periodAlt = PERIOD_WORDS.map(([w]) => w).join('|');
const DETAILS = new RegExp(`^${POLITE}${LOOK}${MINE}(${periodAlt})?(?:的)?(?:账单明细|消费明细|交易明细|交易记录|消费记录|流水|明细)${TAIL}$`);
const SPEND = new RegExp(`^${POLITE}${LOOK}${MINE}(${periodAlt})?(?:的)?(?:消费|花费|花销|支出|开销|账单|花了多少钱|花了多少)(?:情况|分析|统计|总额|汇总)?${TAIL}$`);

function period(word) {
  if (!word) return 'this_month';
  const hit = PERIOD_WORDS.find(([w]) => w === word);
  return hit ? hit[1] : 'this_month';
}

/**
 * Returns { actions, question } for a plain lookup, or null when the sentence
 * should go to the model. Only ever returns balance / cards / analyze / transactions.
 */
function rulePlan(text) {
  if (typeof text !== 'string') return null;
  const t = text.replace(/\s+/g, '').trim();
  if (!t || t.length > 24 || NOT_A_LOOKUP.test(t)) return null;
  let m;
  if (BALANCE.test(t)) return { actions: [{ type: 'balance' }], question: '' };
  if (CARDS.test(t)) return { actions: [{ type: 'cards' }], question: '' };
  if ((m = t.match(DETAILS))) return { actions: [{ type: 'transactions', period: period(m[1]) }], question: '' };
  if ((m = t.match(SPEND))) return { actions: [{ type: 'analyze', period: period(m[1]) }], question: '' };
  return null;
}

module.exports = { rulePlan, PERIOD_WORDS };
