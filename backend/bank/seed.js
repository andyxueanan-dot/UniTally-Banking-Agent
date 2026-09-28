function monthKey(now, offset = 0) {
  const china = new Date(now + 8 * 3600_000);
  return new Date(Date.UTC(china.getUTCFullYear(), china.getUTCMonth() + offset, 1)).toISOString().slice(0, 7);
}
function seedSession(now) {
  const thisMonth = monthKey(now);
  const lastMonth = monthKey(now, -1);
  const rows = [
    ['01', '校园食堂', '餐饮', 2800], ['03', '校园食堂', '餐饮', 3200],
    ['05', '周末聚餐', '餐饮', 24000], ['06', '咖啡店', '餐饮', 3600],
    ['08', '生鲜超市', '购物', 12800], ['09', '校园巴士', '交通', 1200],
    ['10', '云音乐会员', '订阅', 1800], ['11', '云盘会员', '订阅', 2500],
    ['12', '网约车', '交通', 4200], ['14', '网购耳机', '购物', 39900],
    ['16', '视频网站会员', '订阅', 2500], ['18', '咖啡店', '餐饮', 3600],
    ['18', '咖啡店', '餐饮', 3600], ['20', '书店', '学习', 6800],
  ];
  const previous = [['02', '校园食堂', '餐饮', 21000], ['08', '生活超市', '购物', 18000],
    ['12', '公共交通', '交通', 3800], ['16', '云音乐会员', '订阅', 1800], ['21', '书店', '学习', 6800]];
  const transactions = [...rows.map((r, i) => ({ id: `DEMO-C${i + 1}`, date: `${thisMonth}-${r[0]}`, merchant: r[1], category: r[2], cents: r[3], type: 'expense', source: '虚构演示账单' })),
    ...previous.map((r, i) => ({ id: `DEMO-P${i + 1}`, date: `${lastMonth}-${r[0]}`, merchant: r[1], category: r[2], cents: r[3], type: 'expense', source: '虚构演示账单' }))];
  return {
    createdAt: now, referenceMonth: thisMonth, balance: 1286000,
    contacts: [{ id: 'wang', name: '王明', alias: ['小王', '王明', '室友小王'], note: '室友小王', demoPhone: '00000001028', last4: '1028', balance: 0 },
      { id: 'li', name: '李悦', alias: ['小李', '李悦', '项目队友'], note: '项目队友', demoPhone: '00000006619', last4: '6619', balance: 0 },
      { id: 'chen1', name: '陈晨', alias: ['小陈', '陈晨'], last4: '3801', balance: 0 },
      { id: 'chen2', name: '陈晨', alias: ['小陈', '陈晨'], last4: '9526', balance: 0 }],
    cards: [{ id: 'card-8806', last4: '8806', name: '日常消费卡', status: 'ACTIVE', limit: 500000 },
      { id: 'card-6219', last4: '6219', name: '线上购物卡', status: 'ACTIVE', limit: 200000 }],
    transactions, ledger: [], tasks: [], history: [], audit: [], authFailures: 0, lockedUntil: 0,
  };
}
module.exports = { seedSession, monthKey };
