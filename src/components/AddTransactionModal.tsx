import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import type { Transaction } from '@/types';
import { getCurrencySymbol } from '@/lib/currencies';
import CategoryIcon from '@/components/CategoryIcon';
import DateTimePicker from '@/components/DateTimePicker';
import OptionPicker from '@/components/OptionPicker';
import { translations } from '@/lib/i18n';
import { ChevronDown, Check, ArrowRight } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  editTransaction?: Transaction | null;
}

function formatDateTimeLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateTimeDisplay(datetime: string, language: string): string {
  const d = new Date(datetime);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  if (language === 'zh') {
    return `${month}月${day}日 ${hours}:${minutes}`;
  }
  return `${month}/${day} ${hours}:${minutes}`;
}

export default function AddTransactionModal({ open, onClose, editTransaction }: Props) {
  const { wallets, categories, platforms, currencies, primaryCurrency, t, language, addTransaction, updateTransaction } = useApp();
  const tr = translations[language];

  const [tab, setTab] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(primaryCurrency);
  const [walletId, setWalletId] = useState('');
  const [platformId, setPlatformId] = useState('');
  const [category, setCategory] = useState('');
  const [datetime, setDatetime] = useState(formatDateTimeLocal(new Date()));
  const [note, setNote] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [showPlatformPicker, setShowPlatformPicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  
  const [fromWalletId, setFromWalletId] = useState('');
  const [toWalletId, setToWalletId] = useState('');
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [showFromWalletPicker, setShowFromWalletPicker] = useState(false);
  const [showToWalletPicker, setShowToWalletPicker] = useState(false);
  
  const amountInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const otherCurrencies = currencies.slice(1);

  useEffect(() => {
    if (editTransaction) {
      if (editTransaction.type === 'transfer') {
        setTab('transfer');
        setFromWalletId(editTransaction.fromWalletId || '');
        setToWalletId(editTransaction.toWalletId || '');
        setFromAmount(editTransaction.fromAmount?.toString() || '');
        setToAmount(editTransaction.toAmount?.toString() || '');
      } else {
        setTab(editTransaction.type);
        setAmount(editTransaction.amount.toString());
        setCurrency(editTransaction.currency);
        setWalletId(editTransaction.walletId);
        setPlatformId(editTransaction.platformId);
        setCategory(editTransaction.category);
      }
      setDatetime(editTransaction.datetime);
      setNote(editTransaction.note);
    } else {
      setTab('expense');
      setAmount('');
      setCurrency(primaryCurrency);
      setWalletId(wallets[0]?.id || '');
      setPlatformId(platforms[0]?.id || '');
      setCategory('');
      setDatetime(formatDateTimeLocal(new Date()));
      setNote('');
      setFromWalletId(wallets[0]?.id || '');
      setToWalletId(wallets[1]?.id || wallets[0]?.id || '');
      setFromAmount('');
      setToAmount('');
    }
    setShowCurrencyPicker(false);
  }, [editTransaction, open, primaryCurrency, wallets, platforms]);

  useEffect(() => {
    if (open && !editTransaction) {
      setTimeout(() => {
        amountInputRef.current?.focus();
        amountInputRef.current?.click();
      }, 100);
    }
  }, [open, editTransaction]);

  if (!open) return null;

  const handleAmountChange = (val: string) => {
    const num = parseFloat(val);
    if (val !== '' && num < 0) return;
    setAmount(val);
  };

  const handleSubmit = () => {
    if (tab === 'transfer') {
      const fromAmt = parseFloat(fromAmount);
      const toAmt = parseFloat(toAmount);
      if (!fromAmt || !toAmt || !fromWalletId || !toWalletId || fromWalletId === toWalletId) return;

      const fromWallet = wallets.find(w => w.id === fromWalletId);
      const toWallet = wallets.find(w => w.id === toWalletId);

      const data = {
        type: 'transfer' as const,
        amount: fromAmt,
        currency: fromWallet?.currency || primaryCurrency,
        walletId: fromWalletId,
        platformId: platforms[0]?.id || '',
        category: 'transfer',
        datetime,
        note,
        fromWalletId,
        toWalletId,
        fromAmount: fromAmt,
        toAmount: toAmt,
        fromCurrency: fromWallet?.currency,
        toCurrency: toWallet?.currency,
      };

      if (editTransaction) {
        updateTransaction({ ...editTransaction, ...data });
      } else {
        addTransaction(data);
      }
    } else {
      const amt = parseFloat(amount);
      if (!amt || amt < 0 || !walletId || !platformId || (tab === 'expense' && !category)) return;

      const data = {
        type: tab, amount: amt, currency, walletId, platformId,
        category: tab === 'income' ? 'income' : category,
        datetime, note,
      };

      if (editTransaction) {
        updateTransaction({ ...editTransaction, ...data });
      } else {
        addTransaction(data);
      }
    }
    onClose();
  };

  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

  const WALLET_TYPE_NAMES = {
    zh: {
      cash: '现金',
      savings: '储蓄卡',
      credit: '信用卡',
      ewallet: '电子钱包',
    },
    en: {
      cash: 'Cash',
      savings: 'Savings',
      credit: 'Credit Card',
      ewallet: 'E-Wallet',
    },
  };

  const sortedWallets = [...wallets].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  const walletOptions = [
    {
      label: WALLET_TYPE_NAMES[language].cash,
      options: sortedWallets.filter(w => w.type === 'cash' || !w.type).map(w => ({
        id: w.id,
        name: w.name,
        color: w.color,
      })),
    },
    {
      label: WALLET_TYPE_NAMES[language].savings,
      options: sortedWallets.filter(w => w.type === 'savings').map(w => ({
        id: w.id,
        name: w.name,
        color: w.color,
      })),
    },
    {
      label: WALLET_TYPE_NAMES[language].credit,
      options: sortedWallets.filter(w => w.type === 'credit').map(w => ({
        id: w.id,
        name: w.name,
        color: w.color,
      })),
    },
    {
      label: WALLET_TYPE_NAMES[language].ewallet,
      options: sortedWallets.filter(w => w.type === 'ewallet').map(w => ({
        id: w.id,
        name: w.name,
        color: w.color,
      })),
    },
  ].filter(g => g.options.length > 0);

  const platformOptions = platforms.map(p => ({
    id: p.id,
    name: tr.platforms[p.id as keyof typeof tr.platforms] || p.name,
    color: p.color,
  }));

  const selectedWallet = wallets.find(w => w.id === walletId);
  const selectedPlatform = platforms.find(p => p.id === platformId);
  const selectedPlatformName = selectedPlatform 
    ? (tr.platforms[selectedPlatform.id as keyof typeof tr.platforms] || selectedPlatform.name)
    : '';

  const fromWallet = wallets.find(w => w.id === fromWalletId);
  const toWallet = wallets.find(w => w.id === toWalletId);
  const isCrossCurrency = fromWallet && toWallet && fromWallet.currency !== toWallet.currency;

  const CurrencySelector = () => {
    if (currencies.length >= 3) {
      return (
        <div className="flex gap-1 relative">
          <button
            onClick={() => setCurrency(primaryCurrency)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              currency === primaryCurrency ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
            }`}
          >
            {primaryCurrency}
          </button>
          <button
            onClick={() => setShowCurrencyPicker(!showCurrencyPicker)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1 ${
              currency !== primaryCurrency ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
            }`}
          >
            {currency !== primaryCurrency ? currency : (language === 'zh' ? '其他' : 'Other')}
            <ChevronDown className="w-3 h-3" />
          </button>
          {showCurrencyPicker && (
            <div className="absolute top-full right-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-lg overflow-hidden min-w-[100px]">
              {otherCurrencies.map(code => (
                <button
                  key={code}
                  onClick={() => {
                    setCurrency(code);
                    setShowCurrencyPicker(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-secondary transition-colors flex items-center justify-between ${
                    currency === code ? 'bg-primary/10 text-primary' : 'text-foreground'
                  }`}
                >
                  <span>{code}</span>
                  {currency === code && <Check className="w-3 h-3" />}
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
            onClick={() => setCurrency(c)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              currency === c ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
    );
  };

  const renderTransferUI = () => (
    <>
      <div className="space-y-3 mb-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            {language === 'zh' ? '转出账户' : 'From Account'}
          </label>
          <button
            onClick={() => setShowFromWalletPicker(true)}
            className="w-full bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm text-left outline-none hover:bg-secondary/80 transition-colors flex items-center gap-2"
          >
            {fromWallet && (
              <>
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: fromWallet.color }} />
                <span className="flex-1">{fromWallet.name}</span>
                <span className="text-xs text-muted-foreground">{fromWallet.currency}</span>
              </>
            )}
            {!fromWallet && (language === 'zh' ? '选择转出账户' : 'Select From Account')}
          </button>
        </div>

        <div className="flex justify-center">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <ArrowRight className="w-4 h-4 text-primary" />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            {language === 'zh' ? '转入账户' : 'To Account'}
          </label>
          <button
            onClick={() => setShowToWalletPicker(true)}
            className="w-full bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm text-left outline-none hover:bg-secondary/80 transition-colors flex items-center gap-2"
          >
            {toWallet && (
              <>
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: toWallet.color }} />
                <span className="flex-1">{toWallet.name}</span>
                <span className="text-xs text-muted-foreground">{toWallet.currency}</span>
              </>
            )}
            {!toWallet && (language === 'zh' ? '选择转入账户' : 'Select To Account')}
          </button>
        </div>
      </div>

      {isCrossCurrency ? (
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              {language === 'zh' ? `转出金额 (${fromWallet?.currency})` : `From Amount (${fromWallet?.currency})`}
            </label>
            <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2.5">
              <span className="text-muted-foreground">{getCurrencySymbol(fromWallet?.currency || '')}</span>
              <input
                type="text"
                inputMode="decimal"
                value={fromAmount}
                onChange={e => setFromAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                className="flex-1 bg-transparent text-foreground text-lg font-semibold outline-none placeholder:text-muted"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              {language === 'zh' ? `到账金额 (${toWallet?.currency})` : `To Amount (${toWallet?.currency})`}
            </label>
            <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2.5">
              <span className="text-muted-foreground">{getCurrencySymbol(toWallet?.currency || '')}</span>
              <input
                type="text"
                inputMode="decimal"
                value={toAmount}
                onChange={e => setToAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                className="flex-1 bg-transparent text-foreground text-lg font-semibold outline-none placeholder:text-muted"
              />
            </div>
          </div>
          <div className="text-xs text-muted-foreground text-center">
            {language === 'zh' ? '跨币种转账：请分别输入转出和到账金额' : 'Cross-currency: Enter amounts separately'}
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <label className="text-xs text-muted-foreground mb-1 block">
            {language === 'zh' ? '转账金额' : 'Transfer Amount'}
          </label>
          <div className="flex items-center justify-center gap-2">
            <span className="text-3xl text-muted-foreground">{getCurrencySymbol(fromWallet?.currency || primaryCurrency)}</span>
            <input
              type="text"
              inputMode="decimal"
              value={fromAmount}
              onChange={e => {
                const val = e.target.value.replace(/[^0-9.]/g, '');
                setFromAmount(val);
                setToAmount(val);
              }}
              placeholder="0.00"
              className="text-4xl font-bold bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t.transaction.time}</label>
          <button
            onClick={() => setShowDatePicker(true)}
            className="w-full bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm text-left outline-none hover:bg-secondary/80 transition-colors"
          >
            {formatDateTimeDisplay(datetime, language)}
          </button>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t.transaction.note}</label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={t.transaction.addNote}
            className="w-full bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
    </>
  );

  const renderExpenseIncomeUI = () => (
    <>
      <div className="flex items-center justify-center gap-2 mb-4">
        <span className="text-3xl text-muted-foreground">{getCurrencySymbol(currency)}</span>
        <input
          ref={amountInputRef}
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={e => handleAmountChange(e.target.value.replace(/[^0-9.]/g, ''))}
          min="0"
          placeholder="0.00"
          autoFocus
          className="text-4xl font-bold bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t.transaction.wallet}</label>
          <button
            onClick={() => setShowWalletPicker(true)}
            className="w-full bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm text-left outline-none hover:bg-secondary/80 transition-colors flex items-center gap-2"
          >
            {selectedWallet && (
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: selectedWallet.color }} />
            )}
            {selectedWallet?.name || (language === 'zh' ? '选择钱包' : 'Select Wallet')}
          </button>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t.transaction.platform}</label>
          <button
            onClick={() => setShowPlatformPicker(true)}
            className="w-full bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm text-left outline-none hover:bg-secondary/80 transition-colors flex items-center gap-2"
          >
            {selectedPlatform && (
              <div 
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: selectedPlatform.color }}
              />
            )}
            {selectedPlatformName || (language === 'zh' ? '选择平台' : 'Select Platform')}
          </button>
        </div>
      </div>

      {tab === 'expense' && (
        <div className="mb-4">
          <label className="text-xs text-muted-foreground mb-2 block">{t.transaction.category}</label>
          <div className="grid grid-cols-5 gap-2">
            {sortedCategories.map(c => {
              const translatedName = tr.categories[c.id as keyof typeof tr.categories] || c.name;
              return (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={`category-icon-btn ${category === c.id ? 'selected' : ''}`}
                >
                  <CategoryIcon icon={c.icon} color={c.color} size={22} />
                  <span className="text-[10px] text-muted-foreground">{translatedName}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t.transaction.time}</label>
          <button
            onClick={() => setShowDatePicker(true)}
            className="w-full bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm text-left outline-none hover:bg-secondary/80 transition-colors"
          >
            {formatDateTimeDisplay(datetime, language)}
          </button>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t.transaction.note}</label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={t.transaction.addNote}
            className="w-full bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
    </>
  );

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm modal-overlay" />
        <div
          ref={modalRef}
          className="relative w-full sm:max-w-lg max-h-[90vh] overflow-auto glass-card rounded-t-3xl sm:rounded-3xl modal-content"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4 pt-2">
            <div className="flex gap-2">
              {(['expense', 'income', 'transfer'] as const).map(ty => {
                const labels = {
                  expense: t.transaction.expense,
                  income: t.transaction.income,
                  transfer: language === 'zh' ? '转账' : 'Transfer',
                };
                return (
                  <button
                    key={ty}
                    onClick={() => setTab(ty)}
                    className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-200 ${
                      tab === ty
                        ? ty === 'expense' ? 'bg-expense text-primary-foreground' 
                          : ty === 'income' ? 'bg-income text-primary-foreground'
                          : 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {labels[ty]}
                  </button>
                );
              })}
            </div>
            {tab !== 'transfer' && <CurrencySelector />}
          </div>

          {tab === 'transfer' ? renderTransferUI() : renderExpenseIncomeUI()}

          <button
            onClick={handleSubmit}
            className="w-full gradient-primary text-primary-foreground py-3.5 rounded-2xl font-semibold accent-glow transition-all duration-200 hover:opacity-90 mb-2"
          >
            {editTransaction ? t.transaction.save : t.transaction.add}
          </button>
        </div>
      </div>

      <DateTimePicker
        open={showDatePicker}
        value={datetime}
        onChange={setDatetime}
        onClose={() => setShowDatePicker(false)}
      />

      <OptionPicker
        open={showWalletPicker}
        value={walletId}
        onChange={setWalletId}
        onClose={() => setShowWalletPicker(false)}
        options={walletOptions}
        title={language === 'zh' ? '选择钱包' : 'Select Wallet'}
        grouped
      />

      <OptionPicker
        open={showPlatformPicker}
        value={platformId}
        onChange={setPlatformId}
        onClose={() => setShowPlatformPicker(false)}
        options={platformOptions}
        title={language === 'zh' ? '选择平台' : 'Select Platform'}
      />

      <OptionPicker
        open={showFromWalletPicker}
        value={fromWalletId}
        onChange={setFromWalletId}
        onClose={() => setShowFromWalletPicker(false)}
        options={walletOptions}
        title={language === 'zh' ? '转出账户' : 'From Account'}
        grouped
      />

      <OptionPicker
        open={showToWalletPicker}
        value={toWalletId}
        onChange={setToWalletId}
        onClose={() => setShowToWalletPicker(false)}
        options={walletOptions}
        title={language === 'zh' ? '转入账户' : 'To Account'}
        grouped
      />
    </>
  );
}
