import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { X } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import CategoryIcon from '@/components/CategoryIcon';
import { getCurrencySymbol } from '@/lib/currencies';
import type { Wallet } from '@/types';
import { translations } from '@/lib/i18n';

interface Props {
  open: boolean;
  wallet: Wallet | null;
  onClose: () => void;
}

type TimeRange = 'today' | 'week' | 'month' | 'year' | 'all';

const TIME_RANGE_NAMES = {
  zh: {
    today: '今日',
    week: '本周',
    month: '本月',
    year: '本年',
    all: '全部',
  },
  en: {
    today: 'Today',
    week: 'This Week',
    month: 'This Month',
    year: 'This Year',
    all: 'All Time',
  },
};

const COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
];

export default function WalletStatsModal({ open, wallet, onClose }: Props) {
  const { transactions, categories, language } = useApp();
  const t = translations[language];
  const [timeRange, setTimeRange] = useState<TimeRange>('month');

  const filteredTransactions = useMemo(() => {
    if (!wallet) return [];

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    return transactions.filter(tx => {
      if (tx.walletId !== wallet.id) return false;
      if (tx.type !== 'expense') return false;

      const txDate = new Date(tx.datetime);

      switch (timeRange) {
        case 'today':
          return txDate >= today;
        case 'week':
          return txDate >= weekStart;
        case 'month':
          return txDate >= monthStart;
        case 'year':
          return txDate >= yearStart;
        case 'all':
          return true;
        default:
          return true;
      }
    });
  }, [wallet, transactions, timeRange]);

  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {};

    filteredTransactions.forEach(tx => {
      if (!stats[tx.category]) {
        stats[tx.category] = 0;
      }
      stats[tx.category] += tx.amount;
    });

    return Object.entries(stats)
      .map(([categoryId, amount], index) => {
        const category = categories.find(c => c.id === categoryId);
        return {
          id: categoryId,
          name: category?.name || categoryId,
          icon: category?.icon || '📝',
          color: category?.color || COLORS[index % COLORS.length],
          amount,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [filteredTransactions, categories]);

  const totalExpense = categoryStats.reduce((sum, item) => sum + item.amount, 0);

  const pieData = categoryStats.map(item => ({
    name: item.name,
    value: item.amount,
    color: item.color,
  }));

  if (!open || !wallet) return null;

  const timeRanges: TimeRange[] = ['today', 'week', 'month', 'year', 'all'];

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm modal-overlay" />
      <div
        className="relative w-full sm:max-w-md glass-card rounded-t-3xl sm:rounded-3xl modal-content overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/30 sticky top-0 bg-inherit z-10">
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <h3 className="text-base font-semibold text-foreground">{wallet.name}</h3>
          <div className="w-5" />
        </div>

        <div className="p-5">
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            {timeRanges.map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                  timeRange === range
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                }`}
              >
                {TIME_RANGE_NAMES[language][range]}
              </button>
            ))}
          </div>

          <div className="text-center mb-4">
            <div className="text-sm text-muted-foreground">
              {language === 'zh' ? '总支出' : 'Total Expense'}
            </div>
            <div className="text-2xl font-bold text-expense">
              {getCurrencySymbol(wallet.currency)}{totalExpense.toFixed(2)}
            </div>
            {wallet.type === 'credit' && (
              <div className="mt-3 flex justify-center gap-4 text-xs text-muted-foreground">
                {wallet.billingDay && (
                  <div className="flex items-center gap-1">
                    <span>{language === 'zh' ? '账单日:' : 'Billing:'}</span>
                    <span className="font-medium text-foreground">{wallet.billingDay}{language === 'zh' ? '日' : ''}</span>
                  </div>
                )}
                {wallet.dueDay && (
                  <div className="flex items-center gap-1">
                    <span>{language === 'zh' ? '还款日:' : 'Due:'}</span>
                    <span className="font-medium text-foreground">{wallet.dueDay}{language === 'zh' ? '日' : ''}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {categoryStats.length > 0 ? (
            <>
              <div className="h-48 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => `${getCurrencySymbol(wallet.currency)}${value.toFixed(2)}`}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {categoryStats.map((item, index) => {
                  const percentage = totalExpense > 0 ? (item.amount / totalExpense * 100) : 0;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50"
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: item.color + '20' }}
                      >
                        <CategoryIcon icon={item.icon} size={20} color={item.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
                          <span className="text-sm font-semibold text-foreground">
                            {getCurrencySymbol(wallet.currency)}{item.amount.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: item.color,
                              }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{percentage.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <div className="text-muted-foreground text-sm">
                {language === 'zh' ? '暂无消费记录' : 'No expense records'}
              </div>
            </div>
          )}
        </div>

        <div className="safe-area-bottom" />
      </div>
    </div>
  );
}
