import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { getCurrencySymbol, SUPPORTED_CURRENCIES } from '@/lib/currencies';
import { Plus, Trash2, Calendar, Tag, DollarSign, FileText, Building2, Bell, ChevronDown, Check } from 'lucide-react';
import CategoryIcon from '@/components/CategoryIcon';
import { getHistoricalRate } from '@/lib/exchangeRates';
import DatePicker from '@/components/DatePicker';
import DayPicker from '@/components/DayPicker';
import OptionPicker from '@/components/OptionPicker';
import { SUBSCRIPTION_ICONS } from '@/lib/defaults';
import type { Budget, Subscription } from '@/types';

function getDateFromDatetime(datetime: string): string {
  return datetime.split('T')[0];
}

type Period = '3d' | '1w' | '1m' | '3m' | '6m' | '1y';

export default function BudgetCenter() {
  const { budgets, subscriptions, categories, transactions, currencies, primaryCurrency, language, addBudget, updateBudget, deleteBudget, addSubscription, updateSubscription, deleteSubscription, t } = useApp();
  const [showAddBudgetModal, setShowAddBudgetModal] = useState(false);
  const [showAddSubscriptionModal, setShowAddSubscriptionModal] = useState(false);
  
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);
  
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState(primaryCurrency);
  const [budgetPeriod, setBudgetPeriod] = useState<Period>('1m');
  const [budgetNotifyEnabled, setBudgetNotifyEnabled] = useState(false);
  const [budgetNotifyDays, setBudgetNotifyDays] = useState(3);

  const [subProvider, setSubProvider] = useState('');
  const [subName, setSubName] = useState('');
  const [subAmount, setSubAmount] = useState('');
  const [subCurrency, setSubCurrency] = useState(primaryCurrency);
  const [subStartDate, setSubStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [subEndDate, setSubEndDate] = useState('');
  const [subNote, setSubNote] = useState('');
  const [subPeriod, setSubPeriod] = useState<Period>('1m');
  const [subIcon, setSubIcon] = useState('📦');
  const [subIconColor, setSubIconColor] = useState('#3b82f6');
  const [subNotifyEnabled, setSubNotifyEnabled] = useState(false);
  const [subNotifyDays, setSubNotifyDays] = useState(3);

  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showSubStartDatePicker, setShowSubStartDatePicker] = useState(false);
  const [showSubEndDatePicker, setShowSubEndDatePicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const resetBudgetForm = () => {
    setName('');
    setAmount('');
    setCategory('');
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate('');
    setNote('');
    setBudgetCurrency(primaryCurrency);
    setBudgetPeriod('1m');
    setBudgetNotifyEnabled(false);
    setBudgetNotifyDays(3);
    setEditingBudget(null);
    setShowBudgetCurrencyPicker(false);
  };

  const resetSubscriptionForm = () => {
    setSubProvider('');
    setSubName('');
    setSubAmount('');
    setSubCurrency(primaryCurrency);
    setSubStartDate(new Date().toISOString().split('T')[0]);
    setSubEndDate('');
    setSubNote('');
    setSubPeriod('1m');
    setSubIcon('📦');
    setSubIconColor('#3b82f6');
    setSubNotifyEnabled(false);
    setSubNotifyDays(3);
    setEditingSubscription(null);
    setShowSubCurrencyPicker(false);
  };

  const openEditBudget = (budget: Budget) => {
    setEditingBudget(budget);
    setName(budget.name);
    setAmount(budget.amount.toString());
    setCategory(budget.category);
    setStartDate(budget.startDate);
    setEndDate(budget.endDate || '');
    setNote(budget.note || '');
    setBudgetCurrency(primaryCurrency);
    setBudgetPeriod('1m');
    setBudgetNotifyEnabled(budget.notifyEnabled || false);
    setBudgetNotifyDays(budget.notifyDaysBefore || 3);
    setShowAddBudgetModal(true);
  };

  const openEditSubscription = (sub: Subscription) => {
    setEditingSubscription(sub);
    setSubProvider(sub.provider);
    setSubName(sub.name);
    setSubAmount(sub.amount.toString());
    setSubCurrency(sub.currency);
    setSubStartDate(sub.startDate);
    setSubEndDate(sub.endDate);
    setSubNote(sub.note || '');
    setSubPeriod('1m');
    setSubIcon(sub.icon || '📦');
    setSubIconColor(sub.iconColor || '#3b82f6');
    setSubNotifyEnabled(sub.notifyEnabled || false);
    setSubNotifyDays(sub.notifyDaysBefore || 3);
    setShowAddSubscriptionModal(true);
  };

  const handleAddBudget = () => {
    if (!name.trim() || !amount || !category || !startDate) return;
    
    const calculatedEndDate = calculateEndDate(startDate, budgetPeriod);
    
    if (editingBudget) {
      updateBudget({
        ...editingBudget,
        name: name.trim(),
        amount: parseFloat(amount),
        category,
        startDate,
        endDate: calculatedEndDate,
        note: note.trim(),
        notifyEnabled: budgetNotifyEnabled,
        notifyDaysBefore: budgetNotifyDays,
      });
    } else {
      addBudget({
        name: name.trim(),
        amount: parseFloat(amount),
        category,
        startDate,
        endDate: calculatedEndDate,
        note: note.trim(),
        notifyEnabled: budgetNotifyEnabled,
        notifyDaysBefore: budgetNotifyDays,
      });
    }
    
    resetBudgetForm();
    setShowAddBudgetModal(false);
  };

  const handleAddSubscription = () => {
    if (!subProvider.trim() || !subName.trim() || !subAmount || !subStartDate) return;
    
    const calculatedEndDate = calculateEndDate(subStartDate, subPeriod);
    
    if (editingSubscription) {
      updateSubscription({
        ...editingSubscription,
        provider: subProvider.trim(),
        name: subName.trim(),
        amount: parseFloat(subAmount),
        currency: subCurrency,
        icon: subIcon,
        iconColor: subIconColor,
        startDate: subStartDate,
        endDate: calculatedEndDate,
        note: subNote.trim(),
        notifyEnabled: subNotifyEnabled,
        notifyDaysBefore: subNotifyDays,
      });
    } else {
      addSubscription({
        provider: subProvider.trim(),
        name: subName.trim(),
        amount: parseFloat(subAmount),
        currency: subCurrency,
        icon: subIcon,
        iconColor: subIconColor,
        startDate: subStartDate,
        endDate: calculatedEndDate,
        note: subNote.trim(),
        notifyEnabled: subNotifyEnabled,
        notifyDaysBefore: subNotifyDays,
      });
    }
    
    resetSubscriptionForm();
    setShowAddSubscriptionModal(false);
  };

  const calculateEndDate = (start: string, period: Period): string => {
    const startDate = new Date(start);
    const endDate = new Date(startDate);
    
    switch (period) {
      case '3d':
        endDate.setDate(startDate.getDate() + 3);
        break;
      case '1w':
        endDate.setDate(startDate.getDate() + 7);
        break;
      case '1m':
        endDate.setMonth(startDate.getMonth() + 1);
        break;
      case '3m':
        endDate.setMonth(startDate.getMonth() + 3);
        break;
      case '6m':
        endDate.setMonth(startDate.getMonth() + 6);
        break;
      case '1y':
        endDate.setFullYear(startDate.getFullYear() + 1);
        break;
    }
    
    return endDate.toISOString().split('T')[0];
  };

  const getPeriodDays = (period: Period): number => {
    switch (period) {
      case '3d':
        return 3;
      case '1w':
        return 7;
      case '1m':
        return 30;
      case '3m':
        return 90;
      case '6m':
        return 180;
      case '1y':
        return 365;
      default:
        return 30;
    }
  };

  const getBudgetProgress = (budget: typeof budgets[0]) => {
    const budgetTransactions = transactions.filter(tx => {
      if (tx.type !== 'expense') return false;
      if (budget.category !== 'all_expenses' && tx.category !== budget.category) return false;
      const txDate = getDateFromDatetime(tx.datetime);
      return txDate >= budget.startDate && txDate <= (budget.endDate || budget.startDate);
    });

    let totalSpent = 0;
    for (const tx of budgetTransactions) {
      if (tx.currency === budgetCurrency) {
        totalSpent += tx.amount;
      } else {
        totalSpent += tx.amount * getHistoricalRate(tx.currency, budgetCurrency, getDateFromDatetime(tx.datetime));
      }
    }

    return {
      spent: totalSpent,
      percentage: Math.min((totalSpent / budget.amount) * 100, 100),
      isOverBudget: totalSpent > budget.amount,
    };
  };

  const getSubscriptionStatus = (subscription: typeof subscriptions[0]) => {
    const today = new Date().toISOString().split('T')[0];
    const isExpired = today > subscription.endDate;
    const daysRemaining = Math.ceil((new Date(subscription.endDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24));
    
    return {
      isExpired,
      daysRemaining: Math.max(0, daysRemaining),
    };
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return language === 'zh' ? '选择日期' : 'Select Date';
    const d = new Date(dateStr);
    if (language === 'zh') {
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  };

  const periodOptions: { key: Period; label: string }[] = [
    { key: '3d', label: t.dashboard.period3d || '三天' },
    { key: '1w', label: t.dashboard.period1w || '一周' },
    { key: '1m', label: t.dashboard.period1m || '一月' },
    { key: '3m', label: t.dashboard.period3m || '一季度' },
    { key: '6m', label: t.dashboard.period6m || '半年' },
    { key: '1y', label: t.dashboard.period1y || '一年' },
  ];

  const otherCurrencies = currencies.slice(1);
  const [showBudgetCurrencyPicker, setShowBudgetCurrencyPicker] = useState(false);
  const [showSubCurrencyPicker, setShowSubCurrencyPicker] = useState(false);

  const CurrencySelector = ({ value, onChange, showPicker, setShowPicker }: { value: string; onChange: (v: string) => void; showPicker: boolean; setShowPicker: (v: boolean) => void }) => {
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
            onClick={() => setShowPicker(!showPicker)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1 ${
              value !== primaryCurrency ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
            }`}
          >
            {value !== primaryCurrency ? value : (language === 'zh' ? '其他' : 'Other')}
            <ChevronDown className="w-3 h-3" />
          </button>
          {showPicker && (
            <div className="absolute top-full right-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-lg overflow-hidden min-w-[100px]">
              {otherCurrencies.map(code => (
                <button
                  key={code}
                  onClick={() => {
                    onChange(code);
                    setShowPicker(false);
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

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-foreground mb-5">{t.dashboard.title}</h2>

      {budgets.length > 0 && (
        <div className="space-y-4 mb-6">
          {budgets.map(budget => {
            const cat = categories.find(c => c.id === budget.category);
            const progress = getBudgetProgress(budget);
            const translatedName = budget.category === 'all_expenses' 
              ? (language === 'zh' ? '所有花费' : 'All Expenses')
              : (t.categories[budget.category as keyof typeof t.categories] || cat?.name || budget.category);

            return (
              <div 
                key={budget.id} 
                className="glass-card p-4 cursor-pointer hover:bg-secondary/30 transition-all"
                onClick={() => openEditBudget(budget)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <CategoryIcon icon={budget.category === 'all_expenses' ? '📊' : (cat?.icon || '📦')} color={budget.category === 'all_expenses' ? '#6366f1' : cat?.color} size={24} />
                    <div>
                      <h3 className="text-base font-semibold text-foreground">{budget.name}</h3>
                      <p className="text-xs text-muted-foreground">{translatedName}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteBudget(budget.id);
                    }}
                    className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{t.dashboard.progress}</span>
                    <span className={progress.isOverBudget ? 'text-expense font-medium' : 'text-foreground font-medium'}>
                      {progress.percentage.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        progress.isOverBudget ? 'bg-expense' : 'bg-primary'
                      }`}
                      style={{ width: `${Math.min(progress.percentage, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="flex justify-between text-sm">
                  <div>
                    <span className="text-muted-foreground">{t.dashboard.spent}: </span>
                    <span className="text-foreground font-medium">
                      {getCurrencySymbol(budgetCurrency)}{progress.spent.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t.dashboard.remaining}: </span>
                    <span className={`font-medium ${progress.isOverBudget ? 'text-expense' : 'text-foreground'}`}>
                      {getCurrencySymbol(budgetCurrency)}{Math.max(0, budget.amount - progress.spent).toFixed(2)}
                    </span>
                  </div>
                </div>

                {progress.isOverBudget && (
                  <div className="mt-2 text-xs text-expense font-medium">
                    {t.dashboard.overBudget}! {getCurrencySymbol(budgetCurrency)}{(progress.spent - budget.amount).toFixed(2)}
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  <span>{budget.startDate} {budget.endDate && `→ ${budget.endDate}`}</span>
                </div>

                {budget.note && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    <FileText className="w-3 h-3 inline mr-1" />
                    {budget.note}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => {
          resetBudgetForm();
          setShowAddBudgetModal(true);
        }}
        className="w-full glass-card p-4 flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all mb-6"
      >
        <Plus className="w-5 h-5" />
        <span>{t.dashboard.addBudget}</span>
      </button>

      {budgets.length === 0 && (
        <div className="text-center py-10 text-muted-foreground mb-6">
          <p>{t.dashboard.noBudgets}</p>
          <p className="text-sm mt-1">{t.dashboard.noBudgetsDesc}</p>
        </div>
      )}

      <h3 className="text-lg font-semibold text-foreground mb-4">{t.dashboard.subscription.title}</h3>

      {subscriptions.length > 0 && (
        <div className="space-y-4 mb-6">
          {subscriptions.map(sub => {
            const status = getSubscriptionStatus(sub);
            return (
              <div 
                key={sub.id} 
                className="glass-card p-4 cursor-pointer hover:bg-secondary/30 transition-all"
                onClick={() => openEditSubscription(sub)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${sub.iconColor || '#3b82f6'}20` }}
                    >
                      <span className="text-xl">{sub.icon || '📦'}</span>
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-foreground">{sub.name}</h3>
                      <p className="text-xs text-muted-foreground">{sub.provider}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSubscription(sub.id);
                    }}
                    className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="flex items-center justify-between mb-3">
                  <span className="text-lg font-bold text-foreground">
                    {getCurrencySymbol(sub.currency)}{sub.amount.toFixed(2)}
                  </span>
                  <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                    status.isExpired ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
                  }`}>
                    {status.isExpired ? t.dashboard.subscription.expired : t.dashboard.subscription.active}
                  </span>
                </div>

                {!status.isExpired && status.daysRemaining > 0 && (
                  <div className="text-xs text-muted-foreground mb-2">
                    {t.dashboard.subscription.expiresIn} {status.daysRemaining} {t.dashboard.subscription.days}
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  <span>{sub.startDate} → {sub.endDate}</span>
                </div>

                {sub.note && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    <FileText className="w-3 h-3 inline mr-1" />
                    {sub.note}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => {
          resetSubscriptionForm();
          setShowAddSubscriptionModal(true);
        }}
        className="w-full glass-card p-4 flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
      >
        <Plus className="w-5 h-5" />
        <span>{t.dashboard.subscription.addSubscription}</span>
      </button>

      {subscriptions.length === 0 && (
        <div className="text-center py-10 text-muted-foreground mt-6">
          <p>{t.dashboard.subscription.noSubscriptions}</p>
          <p className="text-sm mt-1">{t.dashboard.subscription.noSubscriptionsDesc}</p>
        </div>
      )}

      {showAddBudgetModal && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" onClick={() => { setShowAddBudgetModal(false); resetBudgetForm(); }}>
          <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm" />
          <div
            className="relative w-full sm:max-w-lg max-h-[90vh] overflow-auto glass-card rounded-t-3xl sm:rounded-3xl modal-content"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 pt-2">
              <h2 className="text-lg font-bold text-foreground">{editingBudget ? t.transaction.edit : t.dashboard.addBudget}</h2>
              <CurrencySelector 
                value={budgetCurrency}
                onChange={setBudgetCurrency}
                showPicker={showBudgetCurrencyPicker}
                setShowPicker={setShowBudgetCurrencyPicker}
              />
            </div>

            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-3xl text-muted-foreground">{getCurrencySymbol(budgetCurrency)}</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                className="text-4xl font-bold bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t.dashboard.budgetName}</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t.dashboard.budgetName}
                  className="w-full bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t.dashboard.budgetCategory}</label>
                <button
                  onClick={() => setShowCategoryPicker(true)}
                  className="w-full bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm text-left outline-none hover:bg-secondary/80 transition-colors flex items-center gap-2"
                >
                  {category === 'all_expenses' ? (
                    <>
                      <span>📊</span>
                      <span>{language === 'zh' ? '所有花费' : 'All Expenses'}</span>
                    </>
                  ) : category ? (
                    <>
                      <CategoryIcon icon={categories.find(c => c.id === category)?.icon || '📦'} color={categories.find(c => c.id === category)?.color || '#78716c'} size={16} />
                      <span>{t.categories[category as keyof typeof t.categories] || categories.find(c => c.id === category)?.name}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">{t.transaction.selectCategory}</span>
                  )}
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs text-muted-foreground mb-2 block">{t.dashboard.subscription.period || '支付周期'}</label>
              <div className="flex flex-wrap gap-2">
                {periodOptions.map(p => (
                  <button
                    key={p.key}
                    onClick={() => {
                      setBudgetPeriod(p.key);
                      setEndDate(calculateEndDate(startDate, p.key));
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      budgetPeriod === p.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t.dashboard.startDate}</label>
                <button
                  onClick={() => setShowStartDatePicker(true)}
                  className="w-full bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm text-left outline-none hover:bg-secondary/80 transition-colors"
                >
                  {formatDateDisplay(startDate)}
                </button>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t.dashboard.endDate}</label>
                <button
                  onClick={() => setShowEndDatePicker(true)}
                  className="w-full bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm text-left outline-none hover:bg-secondary/80 transition-colors"
                >
                  {formatDateDisplay(endDate) || (language === 'zh' ? '自动计算' : 'Auto Calculate')}
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs text-muted-foreground mb-1 block">{t.dashboard.note}</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={t.dashboard.addNote}
                rows={2}
                className="w-full bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground resize-none"
              />
            </div>

            <div className="mb-6 p-4 bg-secondary/50 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-muted-foreground" />
                  <span className="text-base font-medium text-foreground">{language === 'zh' ? '到期提醒' : 'Expiration Reminder'}</span>
                </div>
                <button
                  onClick={() => setBudgetNotifyEnabled(!budgetNotifyEnabled)}
                  className={`ios-toggle ${budgetNotifyEnabled ? 'active' : ''}`}
                />
              </div>
              {budgetNotifyEnabled && (
                <div className="mt-4 flex items-center justify-center gap-3">
                  <span className="text-sm text-muted-foreground">{language === 'zh' ? '提前' : 'Days before'}</span>
                  <DayPicker
                    value={budgetNotifyDays}
                    onChange={setBudgetNotifyDays}
                    maxDays={getPeriodDays(budgetPeriod)}
                    language={language}
                  />
                  <span className="text-sm text-muted-foreground">{language === 'zh' ? '天提醒' : 'before'}</span>
                </div>
              )}
            </div>

            <button
              onClick={handleAddBudget}
              disabled={!name.trim() || !amount || !category || !startDate}
              className="w-full py-3 rounded-2xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed gradient-primary text-primary-foreground"
            >
              {editingBudget ? t.transaction.save : t.dashboard.createBudget}
            </button>
          </div>
        </div>
      )}

      {showAddSubscriptionModal && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" onClick={() => { setShowAddSubscriptionModal(false); resetSubscriptionForm(); }}>
          <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm" />
          <div
            className="relative w-full sm:max-w-lg max-h-[90vh] overflow-auto glass-card rounded-t-3xl sm:rounded-3xl modal-content"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 pt-2">
              <h2 className="text-lg font-bold text-foreground">{editingSubscription ? t.transaction.edit : t.dashboard.subscription.addSubscription}</h2>
              <CurrencySelector 
                value={subCurrency}
                onChange={setSubCurrency}
                showPicker={showSubCurrencyPicker}
                setShowPicker={setShowSubCurrencyPicker}
              />
            </div>

            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-3xl text-muted-foreground">{getCurrencySymbol(subCurrency)}</span>
              <input
                type="text"
                inputMode="decimal"
                value={subAmount}
                onChange={e => setSubAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                className="text-4xl font-bold bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t.dashboard.subscription.provider}</label>
                <input
                  value={subProvider}
                  onChange={e => setSubProvider(e.target.value)}
                  placeholder={t.dashboard.subscription.provider}
                  className="w-full bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t.dashboard.subscription.serviceName}</label>
                <input
                  value={subName}
                  onChange={e => setSubName(e.target.value)}
                  placeholder={t.dashboard.subscription.serviceName}
                  className="w-full bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs text-muted-foreground mb-2 block">{language === 'zh' ? '选择图标' : 'Select Icon'}</label>
              <div className="grid grid-cols-6 gap-2 max-h-32 overflow-y-auto p-1">
                {SUBSCRIPTION_ICONS.map((item, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      setSubIcon(item.icon);
                      setSubIconColor(item.color);
                    }}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                      subIcon === item.icon ? 'ring-2 ring-primary bg-primary/10' : 'bg-secondary hover:bg-muted'
                    }`}
                    title={item.name}
                  >
                    <span className="text-lg">{item.icon}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground">{language === 'zh' ? '当前图标:' : 'Current:'}</span>
                <div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${subIconColor}20` }}
                >
                  <span className="text-lg">{subIcon}</span>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs text-muted-foreground mb-2 block">{t.dashboard.subscription.period || '支付周期'}</label>
              <div className="flex flex-wrap gap-2">
                {periodOptions.map(p => (
                  <button
                    key={p.key}
                    onClick={() => {
                      setSubPeriod(p.key);
                      setSubEndDate(calculateEndDate(subStartDate, p.key));
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      subPeriod === p.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t.dashboard.startDate}</label>
                <button
                  onClick={() => setShowSubStartDatePicker(true)}
                  className="w-full bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm text-left outline-none hover:bg-secondary/80 transition-colors"
                >
                  {formatDateDisplay(subStartDate)}
                </button>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t.dashboard.endDate}</label>
                <button
                  onClick={() => setShowSubEndDatePicker(true)}
                  className="w-full bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm text-left outline-none hover:bg-secondary/80 transition-colors"
                >
                  {formatDateDisplay(subEndDate) || (language === 'zh' ? '自动计算' : 'Auto Calculate')}
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs text-muted-foreground mb-1 block">{t.dashboard.note}</label>
              <textarea
                value={subNote}
                onChange={e => setSubNote(e.target.value)}
                placeholder={t.dashboard.addNote}
                rows={2}
                className="w-full bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground resize-none"
              />
            </div>

            <div className="mb-6 p-4 bg-secondary/50 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-muted-foreground" />
                  <span className="text-base font-medium text-foreground">{language === 'zh' ? '到期提醒' : 'Expiration Reminder'}</span>
                </div>
                <button
                  onClick={() => setSubNotifyEnabled(!subNotifyEnabled)}
                  className={`ios-toggle ${subNotifyEnabled ? 'active' : ''}`}
                />
              </div>
              {subNotifyEnabled && (
                <div className="mt-4 flex items-center justify-center gap-3">
                  <span className="text-sm text-muted-foreground">{language === 'zh' ? '提前' : 'Days before'}</span>
                  <DayPicker
                    value={subNotifyDays}
                    onChange={setSubNotifyDays}
                    maxDays={getPeriodDays(subPeriod)}
                    language={language}
                  />
                  <span className="text-sm text-muted-foreground">{language === 'zh' ? '天提醒' : 'before'}</span>
                </div>
              )}
            </div>

            <button
              onClick={handleAddSubscription}
              disabled={!subProvider.trim() || !subName.trim() || !subAmount || !subStartDate}
              className="w-full py-3 rounded-2xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed gradient-primary text-primary-foreground"
            >
              {editingSubscription ? t.transaction.save : t.dashboard.subscription.createSubscription}
            </button>
          </div>
        </div>
      )}

      <DatePicker
        open={showStartDatePicker}
        value={startDate}
        onChange={(date) => {
          setStartDate(date);
          setEndDate(calculateEndDate(date, budgetPeriod));
        }}
        onClose={() => setShowStartDatePicker(false)}
      />

      <DatePicker
        open={showEndDatePicker}
        value={endDate || new Date().toISOString().split('T')[0]}
        onChange={setEndDate}
        onClose={() => setShowEndDatePicker(false)}
      />

      <DatePicker
        open={showSubStartDatePicker}
        value={subStartDate}
        onChange={(date) => {
          setSubStartDate(date);
          setSubEndDate(calculateEndDate(date, subPeriod));
        }}
        onClose={() => setShowSubStartDatePicker(false)}
      />

      <DatePicker
        open={showSubEndDatePicker}
        value={subEndDate || new Date().toISOString().split('T')[0]}
        onChange={setSubEndDate}
        onClose={() => setShowSubEndDatePicker(false)}
      />

      <OptionPicker
        open={showCategoryPicker}
        value={category}
        onChange={setCategory}
        onClose={() => setShowCategoryPicker(false)}
        options={[
          { id: 'all_expenses', name: language === 'zh' ? '所有花费' : 'All Expenses', icon: '📊', color: '#6366f1' },
          ...categories.filter(c => c.id !== 'transfer').map(c => ({
            id: c.id,
            name: t.categories[c.id as keyof typeof t.categories] || c.name,
            icon: c.icon,
            color: c.color,
          })),
        ]}
        title={language === 'zh' ? '选择分类' : 'Select Category'}
      />
    </div>
  );
}
