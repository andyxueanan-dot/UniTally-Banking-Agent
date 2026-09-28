import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { getCurrencySymbol } from '@/lib/currencies';
import { getHistoricalRate } from '@/lib/exchangeRates';
import { ChevronLeft, ChevronRight, ChevronDown, Check, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import CategoryIcon from '@/components/CategoryIcon';
import OptionPicker from '@/components/OptionPicker';
import DatePicker from '@/components/DatePicker';
import { translations } from '@/lib/i18n';

function getDateFromDatetime(datetime: string): string {
  return datetime.split('T')[0];
}

export default function ExpenseCalendar() {
  const { transactions, categories, wallets, platforms, currencies, primaryCurrency, latestRate, language } = useApp();
  const t = translations[language];
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [chartCurrency, setChartCurrency] = useState(primaryCurrency);
  const [filterWallet, setFilterWallet] = useState('all');
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [showPlatformPicker, setShowPlatformPicker] = useState(false);
  const [showDateFilterModal, setShowDateFilterModal] = useState(false);
  const [tempStartDate, setTempStartDate] = useState('');
  const [tempEndDate, setTempEndDate] = useState('');
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const otherCurrencies = currencies.slice(1);

  const CurrencySelector = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
    const [showDropdown, setShowDropdown] = useState(false);
    
    if (currencies.length >= 3) {
      return (
        <div className="flex gap-1 relative">
          <button
            onClick={() => onChange(primaryCurrency)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              value === primaryCurrency ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
            }`}
          >
            {primaryCurrency}
          </button>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1 ${
              value !== primaryCurrency ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
            }`}
          >
            {value !== primaryCurrency ? value : (language === 'zh' ? '其他' : 'Other')}
            <ChevronDown className="w-3 h-3" />
          </button>
          {showDropdown && (
            <div className="absolute top-full right-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-lg overflow-hidden min-w-[80px]">
              {otherCurrencies.map(code => (
                <button
                  key={code}
                  onClick={() => {
                    onChange(code);
                    setShowDropdown(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-secondary transition-colors flex items-center justify-between ${
                    value === code ? 'bg-primary/10 text-primary' : 'text-foreground'
                  }`}
                >
                  <span>{code}</span>
                  {value === code && <Check className="w-3 h-3" />}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="flex gap-1">
        {currencies.map(c => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              value === c ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
    );
  };

  const expenseTransactions = useMemo(() =>
    transactions.filter(tx => tx.type === 'expense' && tx.category !== 'transfer' && tx.type !== 'transfer'),
    [transactions]
  );

  const dailyTotals = useMemo(() => {
    const totals: Record<string, Record<string, number>> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      totals[dateStr] = {};
      currencies.forEach(c => { totals[dateStr][c] = 0; });

      const dayTxs = expenseTransactions.filter(tx => getDateFromDatetime(tx.datetime) === dateStr);
      for (const tx of dayTxs) {
        if (totals[dateStr][tx.currency] !== undefined) {
          totals[dateStr][tx.currency] += tx.amount;
        }
      }
    }
    return totals;
  }, [expenseTransactions, year, month, daysInMonth, currencies]);

  const barData = useMemo(() => {
    const data: { day: number; amount: number; date: string }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      let total = 0;
      const dayTxs = expenseTransactions.filter(tx => getDateFromDatetime(tx.datetime) === dateStr);
      for (const tx of dayTxs) {
        if (tx.currency === chartCurrency) {
          total += tx.amount;
        } else {
          const rate = getHistoricalRate(tx.currency, chartCurrency, dateStr);
          total += tx.amount * rate;
        }
      }
      data.push({ day: d, amount: parseFloat(total.toFixed(2)), date: dateStr });
    }
    return data;
  }, [expenseTransactions, daysInMonth, year, month, chartCurrency]);

  const selectedDayTxs = selectedDate
    ? expenseTransactions.filter(tx => getDateFromDatetime(tx.datetime) === selectedDate)
    : [];

  const pieData = useMemo(() => {
    if (!selectedDate) return [];
    const catTotals: Record<string, number> = {};
    for (const tx of selectedDayTxs) {
      let amount = tx.amount;
      if (tx.currency !== chartCurrency) {
        amount *= getHistoricalRate(tx.currency, chartCurrency, selectedDate);
      }
      catTotals[tx.category] = (catTotals[tx.category] || 0) + amount;
    }
    return Object.entries(catTotals).map(([catId, value]) => {
      const cat = categories.find(c => c.id === catId);
      const translatedName = t.categories[catId as keyof typeof t.categories] || cat?.name || catId;
      return { name: translatedName, value: parseFloat(value.toFixed(2)), color: cat?.color || '#94a3b8', icon: cat?.icon || '📦' };
    });
  }, [selectedDate, selectedDayTxs, chartCurrency, categories, t.categories]);

  const categoryPieData = useMemo(() => {
    const filtered = transactions.filter(tx => {
      if (tx.type === 'income' || tx.type === 'transfer' || tx.category === 'transfer') return false;
      if (filterWallet !== 'all' && tx.walletId !== filterWallet) return false;
      if (filterPlatform !== 'all' && tx.platformId !== filterPlatform) return false;
      const txDate = getDateFromDatetime(tx.datetime);
      if (filterStartDate && txDate < filterStartDate) return false;
      if (filterEndDate && txDate > filterEndDate) return false;
      return true;
    });

    const catTotals: Record<string, number> = {};
    for (const tx of filtered) {
      let amount = tx.amount;
      if (tx.currency !== primaryCurrency) {
        amount /= latestRate || 1;
      }
      catTotals[tx.category] = (catTotals[tx.category] || 0) + amount;
    }

    return Object.entries(catTotals)
      .map(([catId, value]) => {
        const cat = categories.find(c => c.id === catId);
        const translatedName = t.categories[catId as keyof typeof t.categories] || cat?.name || catId;
        return { name: translatedName, value: parseFloat(value.toFixed(2)), color: cat?.color || '#94a3b8', icon: cat?.icon || '📦' };
      })
      .sort((a, b) => b.value - a.value);
  }, [transactions, categories, filterWallet, filterPlatform, filterStartDate, filterEndDate, primaryCurrency, latestRate, t.categories]);

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-foreground mb-5">{t.calendar.title}</h2>

      <div className="glass-card mb-5">
        <h3 className="text-lg font-semibold text-foreground mb-4">{t.dashboard.totalExpenseByCategory}</h3>

        <div className="flex gap-3 mb-4">
          <button
            onClick={() => setShowWalletPicker(true)}
            className="bg-secondary text-foreground rounded-xl px-3 py-2 text-sm outline-none flex-1 flex items-center justify-between"
          >
            <span>{filterWallet === 'all' ? t.dashboard.allWallets : wallets.find(w => w.id === filterWallet)?.name}</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => setShowPlatformPicker(true)}
            className="bg-secondary text-foreground rounded-xl px-3 py-2 text-sm outline-none flex-1 flex items-center justify-between"
          >
            <span>{filterPlatform === 'all' ? t.dashboard.allPlatforms : (t.platforms[filterPlatform as keyof typeof t.platforms] || platforms.find(p => p.id === filterPlatform)?.name)}</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => {
              setTempStartDate(filterStartDate);
              setTempEndDate(filterEndDate);
              setShowDateFilterModal(true);
            }}
            className="bg-secondary text-foreground rounded-xl px-3 py-2 text-sm outline-none flex-1 flex items-center justify-between"
          >
            <span className="truncate">
              {filterStartDate || filterEndDate
                ? `${filterStartDate || '...'} ~ ${filterEndDate || '...'}`
                : (language === 'zh' ? '全部时间' : 'All Time')}
            </span>
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {categoryPieData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={categoryPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {categoryPieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [`${getCurrencySymbol(primaryCurrency)}${value}`, '']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 mt-3">
              {categoryPieData.map(p => (
                <div key={p.name} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                  <span>{p.icon} {p.name}</span>
                  <span className="font-medium text-foreground">{getCurrencySymbol(primaryCurrency)}{p.value}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-10 text-muted-foreground text-sm">{t.dashboard.noData}</div>
        )}
      </div>

      <div className="glass-card mb-5 overflow-hidden relative">
        <div className="absolute inset-0 gradient-primary opacity-5 rounded-3xl" />

        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-secondary transition-colors">
              <ChevronLeft className="w-5 h-5 text-foreground" />
            </button>
            <span className="text-lg font-semibold text-foreground">
              {language === 'zh' ? `${year}年${month + 1}月` : `${t.months[month]} ${year}`}
            </span>
            <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-secondary transition-colors">
              <ChevronRight className="w-5 h-5 text-foreground" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {t.weekdays.map(d => (
              <div key={d} className="text-center text-xs text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((day, i) => {
              if (day === null) return <div key={i} />;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = selectedDate === dateStr;
              const dayTotal = dailyTotals[dateStr] || {};
              const hasExpense = currencies.some(c => (dayTotal[c] || 0) > 0);

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={`p-1.5 rounded-xl text-center transition-all duration-200 min-h-[52px] flex flex-col items-center justify-start ${
                    isSelected ? 'bg-primary text-primary-foreground accent-glow' : hasExpense ? 'bg-secondary/50 hover:bg-secondary' : 'hover:bg-secondary/30'
                  }`}
                >
                  <span className="text-sm font-medium">{day}</span>
                  {hasExpense && (
                    <div className="mt-0.5 space-y-0">
                      {currencies.map(c => dayTotal[c] > 0 ? (
                        <div key={c} className={`text-[8px] leading-tight ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                          {getCurrencySymbol(c)}{dayTotal[c].toFixed(0)}
                        </div>
                      ) : null)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {!selectedDate ? (
        <div className="glass-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">{t.calendar.monthlyStats}</h3>
            <CurrencySelector value={chartCurrency} onChange={setChartCurrency} />
          </div>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData}>
                <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [`${getCurrencySymbol(chartCurrency)}${value}`, t.calendar.expense]}
                />
                <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-10 text-muted-foreground text-sm">{t.calendar.noExpense}</div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {pieData.length > 0 && (
            <div className="glass-card">
              <h3 className="text-sm font-semibold text-foreground mb-3">{selectedDate} {t.calendar.dailyComposition} ({chartCurrency})</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '12px',
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [`${getCurrencySymbol(chartCurrency)}${value}`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-2">
                {pieData.map(p => (
                  <div key={p.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                    <CategoryIcon icon={p.icon} color={p.color} size={12} />
                    <span>{p.name} {getCurrencySymbol(chartCurrency)}{p.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="glass-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">{t.calendar.dailyFlow}</h3>
              <CurrencySelector value={chartCurrency} onChange={setChartCurrency} />
            </div>
            {selectedDayTxs.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">{t.calendar.noExpenseDay}</div>
            ) : (
              <div className="space-y-2">
                {selectedDayTxs.map(tx => {
                  const cat = categories.find(c => c.id === tx.category);
                  const translatedName = t.categories[tx.category as keyof typeof t.categories] || cat?.name || tx.category;
                  return (
                    <div key={tx.id} className="flex items-center gap-3 p-2 rounded-xl bg-secondary/50">
                      <CategoryIcon icon={cat?.icon || '📦'} color={cat?.color} size={18} />
                      <span className="flex-1 text-sm text-foreground">{translatedName}</span>
                      <span className="text-sm font-medium text-expense">
                        -{getCurrencySymbol(tx.currency)}{tx.amount.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <OptionPicker
        open={showWalletPicker}
        value={filterWallet}
        onChange={setFilterWallet}
        onClose={() => setShowWalletPicker(false)}
        options={[
          { id: 'all', name: t.dashboard.allWallets },
          ...wallets.map(w => ({ id: w.id, name: w.name, color: w.color }))
        ]}
        title={language === 'zh' ? '选择钱包' : 'Select Wallet'}
      />

      <OptionPicker
        open={showPlatformPicker}
        value={filterPlatform}
        onChange={setFilterPlatform}
        onClose={() => setShowPlatformPicker(false)}
        options={[
          { id: 'all', name: t.dashboard.allPlatforms },
          ...platforms.map(p => ({ id: p.id, name: t.platforms[p.id as keyof typeof t.platforms] || p.name, icon: p.icon }))
        ]}
        title={language === 'zh' ? '选择平台' : 'Select Platform'}
      />

      {showDateFilterModal && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center" onClick={() => setShowDateFilterModal(false)}>
          <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm modal-overlay" />
          <div
            className="relative w-full sm:max-w-md glass-card rounded-t-3xl sm:rounded-3xl modal-content overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
              <button
                onClick={() => setShowDateFilterModal(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <h3 className="text-base font-semibold text-foreground">
                {language === 'zh' ? '选择时间范围' : 'Select Date Range'}
              </h3>
              <button
                onClick={() => {
                  setFilterStartDate(tempStartDate);
                  setFilterEndDate(tempEndDate);
                  setShowDateFilterModal(false);
                }}
                className="text-primary hover:text-primary/80 transition-colors font-medium"
              >
                {language === 'zh' ? '确定' : 'OK'}
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  {language === 'zh' ? '起始日期' : 'Start Date'}
                </label>
                <button
                  onClick={() => setShowStartDatePicker(true)}
                  className="w-full bg-secondary text-foreground rounded-xl px-4 py-3 text-sm outline-none flex items-center justify-between"
                >
                  <span>{tempStartDate || (language === 'zh' ? '选择起始日期' : 'Select start date')}</span>
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  {language === 'zh' ? '终止日期' : 'End Date'}
                </label>
                <button
                  onClick={() => setShowEndDatePicker(true)}
                  className="w-full bg-secondary text-foreground rounded-xl px-4 py-3 text-sm outline-none flex items-center justify-between"
                >
                  <span>{tempEndDate || (language === 'zh' ? '选择终止日期' : 'Select end date')}</span>
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setTempStartDate('');
                    setTempEndDate('');
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-secondary text-muted-foreground text-sm"
                >
                  {language === 'zh' ? '清除' : 'Clear'}
                </button>
                <button
                  onClick={() => {
                    const today = new Date();
                    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
                    const startOfYear = new Date(today.getFullYear(), 0, 1);
                    
                    setTempStartDate(startOfMonth.toISOString().split('T')[0]);
                    setTempEndDate(today.toISOString().split('T')[0]);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground text-sm"
                >
                  {language === 'zh' ? '本月' : 'This Month'}
                </button>
                <button
                  onClick={() => {
                    const today = new Date();
                    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
                    
                    setTempStartDate(startOfLastMonth.toISOString().split('T')[0]);
                    setTempEndDate(endOfLastMonth.toISOString().split('T')[0]);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground text-sm"
                >
                  {language === 'zh' ? '上月' : 'Last Month'}
                </button>
              </div>
            </div>

            <div className="safe-area-bottom" />
          </div>
        </div>
      )}

      <DatePicker
        open={showStartDatePicker}
        value={tempStartDate}
        onChange={(date) => {
          setTempStartDate(date);
          setShowStartDatePicker(false);
        }}
        onClose={() => setShowStartDatePicker(false)}
      />

      <DatePicker
        open={showEndDatePicker}
        value={tempEndDate}
        onChange={(date) => {
          setTempEndDate(date);
          setShowEndDatePicker(false);
        }}
        onClose={() => setShowEndDatePicker(false)}
      />
    </div>
  );
}
