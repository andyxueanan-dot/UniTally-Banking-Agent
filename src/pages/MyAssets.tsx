import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { getCurrencySymbol, getCurrencyPrimaryColor, SUPPORTED_CURRENCIES } from '@/lib/currencies';
import { Plus, ChevronLeft, ChevronRight, Trash2, Settings, Wallet, CreditCard, Banknote, Smartphone, Pencil } from 'lucide-react';
import { translations } from '@/lib/i18n';
import ColorPicker from '@/components/ColorPicker';
import WalletIconPicker from '@/components/WalletIconPicker';
import WalletIconImg from '@/components/WalletIconImg';
import { getWalletIconById } from '@/lib/walletIcons';
import EditWalletModal from '@/components/EditWalletModal';
import WalletStatsModal from '@/components/WalletStatsModal';
import NumberPicker from '@/components/NumberPicker';
import type { Wallet as WalletType } from '@/types';
import { calculateWalletBalance } from '@/lib/walletBalance';

const WALLET_TYPE_CONFIG = {
  cash: { icon: Banknote, color: '#22c55e' },
  savings: { icon: Wallet, color: '#3b82f6' },
  credit: { icon: CreditCard, color: '#ef4444' },
  ewallet: { icon: Smartphone, color: '#8b5cf6' },
};

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

export default function MyAssets() {
  const { wallets, transactions, currencies, primaryCurrency, secondaryCurrency, latestRate, addWallet, deleteWallet, reorderWallets, language } = useApp();
  const t = translations[language];
  const [displayCurrency, setDisplayCurrency] = useState(primaryCurrency);
  const [managing, setManaging] = useState(false);
  const [newWallet, setNewWallet] = useState<{
    name: string;
    currency: string;
    color: string;
    balance: string;
    iconId: number | undefined;
    type: WalletType['type'];
    creditLimit: string;
    billingDay: string;
    dueDay: string;
    remindDays: string;
  }>({
    name: '',
    currency: primaryCurrency,
    color: '#3b82f6',
    balance: '',
    iconId: undefined,
    type: 'cash',
    creditLimit: '',
    billingDay: '1',
    dueDay: '1',
    remindDays: '3',
  });
  const [showCreate, setShowCreate] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [editingWallet, setEditingWallet] = useState<WalletType | null>(null);
  const [statsWallet, setStatsWallet] = useState<WalletType | null>(null);

  const getWalletBalance = (walletId: string, walletCurrency: string, initialBalance: number) => {
    return calculateWalletBalance(walletId, walletCurrency, initialBalance, transactions, (amount, fromCurrency) => {
      const rate = fromCurrency === primaryCurrency
        ? (walletCurrency === secondaryCurrency ? latestRate : 1 / latestRate)
        : (walletCurrency === primaryCurrency ? 1 / latestRate : latestRate);
      return amount * rate;
    });
  };

  const getAvailableCredit = (wallet: WalletType) => {
    if (wallet.type !== 'credit' || wallet.creditLimit === undefined) return 0;
    const currentBalance = getWalletBalance(wallet.id, wallet.currency, wallet.balance);
    return wallet.creditLimit + currentBalance;
  };

  const convertToDisplay = (amount: number, fromCurrency: string) => {
    if (fromCurrency === displayCurrency) return amount;
    if (fromCurrency === primaryCurrency && displayCurrency === secondaryCurrency) return amount * latestRate;
    if (fromCurrency === secondaryCurrency && displayCurrency === primaryCurrency) return amount / latestRate;
    return amount;
  };

  const totalAssets = wallets.reduce((sum, w) => {
    if (w.type === 'credit') return sum;
    const balance = getWalletBalance(w.id, w.currency, w.balance);
    return sum + convertToDisplay(balance, w.currency);
  }, 0);

  const totalCreditUsed = wallets
    .filter(w => w.type === 'credit')
    .reduce((sum, w) => {
      const balance = getWalletBalance(w.id, w.currency, w.balance);
      return sum + convertToDisplay(balance, w.currency);
    }, 0);

  const sortedWallets = [...wallets].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  const groupedWallets = {
    cash: sortedWallets.filter(w => w.type === 'cash' || !w.type),
    savings: sortedWallets.filter(w => w.type === 'savings'),
    credit: sortedWallets.filter(w => w.type === 'credit'),
    ewallet: sortedWallets.filter(w => w.type === 'ewallet'),
  };

  const moveWallet = (idx: number, dir: -1 | 1) => {
    const arr = [...sortedWallets];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    reorderWallets(arr.map((w, i) => ({ ...w, sortOrder: i })));
  };

  const handleCreateWallet = () => {
    if (!newWallet.name.trim()) return;
    
    const isCash = newWallet.type === 'cash';
    const currencyInfo = SUPPORTED_CURRENCIES.find(c => c.code === newWallet.currency);
    const autoColor = isCash ? getCurrencyPrimaryColor(newWallet.currency) : newWallet.color;
    
    addWallet({
      name: newWallet.name.trim(),
      currency: newWallet.currency,
      color: newWallet.iconId ? '#3b82f6' : autoColor,
      icon: '💵',
      balance: parseFloat(newWallet.balance) || 0,
      sortOrder: wallets.length,
      order: wallets.length,
      iconId: newWallet.iconId,
      type: newWallet.type,
      creditLimit: newWallet.type === 'credit' ? parseFloat(newWallet.creditLimit) || 0 : undefined,
      billingDay: newWallet.type === 'credit' ? parseInt(newWallet.billingDay) || 1 : undefined,
      dueDay: newWallet.type === 'credit' ? parseInt(newWallet.dueDay) || 1 : undefined,
      remindDays: newWallet.type === 'credit' ? parseInt(newWallet.remindDays) || 3 : undefined,
      isDefault: false,
    });
    setNewWallet({
      name: '',
      currency: primaryCurrency,
      color: '#3b82f6',
      balance: '',
      iconId: undefined,
      type: 'cash',
      creditLimit: '',
      billingDay: '1',
      dueDay: '1',
      remindDays: '3',
    });
    setShowCreate(false);
  };

  const handleCurrencyChange = (currency: string) => {
    const isCash = newWallet.type === 'cash';
    const currencyInfo = SUPPORTED_CURRENCIES.find(c => c.code === currency);
    const autoColor = isCash ? getCurrencyPrimaryColor(currency) : newWallet.color;
    const autoName = isCash
      ? (language === 'zh' ? `${currencyInfo?.nameZh || currency}现金` : `${currencyInfo?.name || currency} Cash`)
      : newWallet.name;
    
    setNewWallet({
      ...newWallet,
      currency,
      color: autoColor,
      name: autoName,
    });
  };

  const handleTypeChange = (type: WalletType['type']) => {
    const isCash = type === 'cash';
    const currencyInfo = SUPPORTED_CURRENCIES.find(c => c.code === newWallet.currency);
    const autoColor = isCash ? getCurrencyPrimaryColor(newWallet.currency) : '#3b82f6';
    const autoName = isCash
      ? (language === 'zh' ? `${currencyInfo?.nameZh || newWallet.currency}现金` : `${currencyInfo?.name || newWallet.currency} Cash`)
      : '';
    
    setNewWallet({
      ...newWallet,
      type,
      color: autoColor,
      name: autoName,
      iconId: undefined,
    });
  };

  const handleIconSelect = (iconId: number | undefined) => {
    if (iconId) {
      setNewWallet({ ...newWallet, iconId, color: '#3b82f6' });
    } else {
      setNewWallet({ ...newWallet, iconId: undefined });
    }
  };

  const handleColorSelect = (color: string) => {
    setNewWallet({ ...newWallet, color, iconId: undefined });
  };

  const selectedIcon = newWallet.iconId ? getWalletIconById(newWallet.iconId) : null;

  const getDisplayName = (icon: ReturnType<typeof getWalletIconById>) => {
    if (!icon) return '';
    return language === 'zh' ? icon.nameLocal : icon.name;
  };

  const renderWalletCard = (w: WalletType, idx: number, globalIdx: number) => {
    const balance = getWalletBalance(w.id, w.currency, w.balance);
    const walletIcon = w.iconId ? getWalletIconById(w.iconId) : null;
    const isCredit = w.type === 'credit';
    const availableCredit = isCredit ? getAvailableCredit(w) : 0;
    
    return (
      <div
        key={w.id}
        className={`glass-card relative overflow-hidden ${!managing ? 'cursor-pointer hover:scale-[1.02] transition-transform' : ''}`}
        style={{ borderColor: w.color + '30' }}
        onClick={() => !managing && setStatsWallet(w)}
      >
        <div
          className="absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-20"
          style={{ backgroundColor: w.color }}
        />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {walletIcon ? (
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center overflow-hidden shadow-sm flex-shrink-0">
                  <WalletIconImg icon={walletIcon} size={28} />
                </div>
              ) : (
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: w.color }} />
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-foreground truncate">{w.name}</span>
                {walletIcon && (
                  <span className="text-xs text-muted-foreground truncate">{getDisplayName(walletIcon)}</span>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0 ml-2">
              {isCredit ? (
                <>
                  <div className="text-lg font-bold text-foreground">
                    {getCurrencySymbol(w.currency)}{availableCredit.toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {language === 'zh' ? '可用额度' : 'Available'}
                  </div>
                  <div className="text-xs text-muted-foreground/70">
                    {language === 'zh' ? `限额 ${getCurrencySymbol(w.currency)}${w.creditLimit?.toFixed(0) || 0}` : `Limit ${getCurrencySymbol(w.currency)}${w.creditLimit?.toFixed(0) || 0}`}
                  </div>
                  {(w.billingDay || w.dueDay) && (
                    <div className="text-xs text-muted-foreground/50 mt-1">
                      {w.billingDay && <span>{language === 'zh' ? `${w.billingDay}日账单` : `Bill on ${w.billingDay}`}</span>}
                      {w.billingDay && w.dueDay && <span className="mx-1">·</span>}
                      {w.dueDay && <span>{language === 'zh' ? `${w.dueDay}日还款` : `Due on ${w.dueDay}`}</span>}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-lg font-bold text-foreground">
                    {getCurrencySymbol(w.currency)}{balance.toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground">{w.currency}</div>
                </>
              )}
            </div>
          </div>
          {managing && (
            <div className="flex gap-2 mt-3">
              <button onClick={(e) => { e.stopPropagation(); moveWallet(globalIdx, -1); }} className="p-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); moveWallet(globalIdx, 1); }} className="p-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); setEditingWallet(w); }} 
                className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); deleteWallet(w.id); }} 
                className="p-1.5 rounded-lg bg-expense/10 text-expense hover:bg-expense hover:text-primary-foreground transition-all ml-auto"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderWalletGroup = (type: keyof typeof groupedWallets, wallets: WalletType[]) => {
    if (wallets.length === 0) return null;
    const config = WALLET_TYPE_CONFIG[type];
    const Icon = config.icon;
    const typeName = WALLET_TYPE_NAMES[language][type];
    
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-sm font-medium text-muted-foreground">{typeName}</h4>
          <span className="text-xs text-muted-foreground/60">({wallets.length})</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {wallets.map((w, idx) => {
            const globalIdx = sortedWallets.findIndex(sw => sw.id === w.id);
            return renderWalletCard(w, idx, globalIdx);
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-foreground mb-5">{t.assets.title}</h2>

      <div className="gradient-primary rounded-3xl p-6 mb-6 accent-glow-lg">
        <div className="text-primary-foreground/70 text-sm mb-1">{t.assets.netAssets}</div>
        <div className="text-primary-foreground text-3xl font-bold mb-3">
          {getCurrencySymbol(displayCurrency)}{totalAssets.toFixed(2)}
        </div>
        {totalCreditUsed !== 0 && (
          <div className="text-primary-foreground/60 text-xs">
            {language === 'zh' ? '信用卡欠款' : 'Credit Card Debt'}: {getCurrencySymbol(displayCurrency)}{Math.abs(totalCreditUsed).toFixed(2)}
          </div>
        )}
        <div className="flex gap-2 mt-3">
          {currencies.map(c => (
            <button
              key={c}
              onClick={() => setDisplayCurrency(c)}
              className={`px-3 py-1 rounded-xl text-xs font-medium transition-all ${
                displayCurrency === c
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : 'bg-primary-foreground/10 text-primary-foreground/60 hover:bg-primary-foreground/15'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">{t.assets.myWallets}</h3>
        <button
          onClick={() => setManaging(!managing)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
            managing ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          {managing ? t.assets.done : t.assets.manage}
        </button>
      </div>

      {renderWalletGroup('cash', groupedWallets.cash)}
      {renderWalletGroup('savings', groupedWallets.savings)}
      {renderWalletGroup('credit', groupedWallets.credit)}
      {renderWalletGroup('ewallet', groupedWallets.ewallet)}

      <div className="w-full">
        {!showCreate ? (
          <button
            onClick={() => {
              const currencyInfo = SUPPORTED_CURRENCIES.find(c => c.code === primaryCurrency);
              setNewWallet({
                name: language === 'zh' ? `${currencyInfo?.nameZh || primaryCurrency}现金` : `${currencyInfo?.name || primaryCurrency} Cash`,
                currency: primaryCurrency,
                color: getCurrencyPrimaryColor(primaryCurrency),
                balance: '',
                iconId: undefined,
                type: 'cash',
                creditLimit: '',
              });
              setShowCreate(true);
            }}
            className="w-full border-2 border-dashed border-muted rounded-3xl p-5 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-all duration-200 min-h-[120px]"
          >
            <Plus className="w-6 h-6" />
            <span className="text-sm">{t.assets.createNewWallet}</span>
          </button>
        ) : (
          <div className="glass-card space-y-3">
            <input
              value={newWallet.name}
              onChange={e => setNewWallet({ ...newWallet, name: e.target.value })}
              placeholder={t.assets.walletName}
              className="w-full bg-secondary text-foreground rounded-xl px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
            
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                {language === 'zh' ? '钱包类型' : 'Wallet Type'}
              </label>
              <div className="grid grid-cols-4 gap-1">
                {(Object.keys(WALLET_TYPE_CONFIG) as Array<keyof typeof WALLET_TYPE_CONFIG>).map(type => {
                  const config = WALLET_TYPE_CONFIG[type];
                  const Icon = config.icon;
                  const isSelected = newWallet.type === type;
                  return (
                    <button
                      key={type}
                      onClick={() => handleTypeChange(type)}
                      className={`flex flex-col items-center gap-1 py-2 rounded-xl text-xs transition-all ${
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{WALLET_TYPE_NAMES[language][type]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <select
              value={newWallet.currency}
              onChange={e => handleCurrencyChange(e.target.value)}
              className="w-full bg-secondary text-foreground rounded-xl px-3 py-2 text-sm outline-none"
            >
              {currencies.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            
            {newWallet.type !== 'cash' && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{language === 'zh' ? '关联机构' : 'Linked Institution'}</label>
                  <button
                    onClick={() => setShowIconPicker(true)}
                    className={`w-full flex items-center gap-3 bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm hover:bg-secondary/80 transition-colors ${newWallet.iconId ? 'ring-2 ring-primary' : ''}`}
                  >
                    {selectedIcon ? (
                      <>
                        <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center overflow-hidden shadow-sm">
                          <WalletIconImg icon={selectedIcon} size={24} />
                        </div>
                        <span className="flex-1 text-left">{getDisplayName(selectedIcon)}</span>
                        <span className="text-xs text-primary">{language === 'zh' ? '已选择' : 'Selected'}</span>
                      </>
                    ) : (
                      <>
                        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Wallet className="w-4 h-4 text-primary" />
                        </div>
                        <span className="flex-1 text-left text-muted-foreground">{language === 'zh' ? '选择关联机构（可选）' : 'Select Institution (Optional)'}</span>
                      </>
                    )}
                  </button>
                </div>
                
                <ColorPicker 
                  value={newWallet.iconId ? '#3b82f6' : newWallet.color} 
                  onChange={handleColorSelect} 
                  label={t.assets.selectColor} 
                />
              </>
            )}

            {newWallet.type === 'credit' ? (
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {language === 'zh' ? '信用卡总限额' : 'Credit Limit'}
                  </label>
                  <input
                    type="number"
                    value={newWallet.creditLimit}
                    onChange={e => setNewWallet({ ...newWallet, creditLimit: e.target.value })}
                    placeholder={language === 'zh' ? '输入总限额' : 'Enter credit limit'}
                    className="w-full bg-secondary text-foreground rounded-xl px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {language === 'zh' ? '当前欠款（负数）或余额' : 'Current Balance (negative if debt)'}
                  </label>
                  <input
                    type="number"
                    value={newWallet.balance}
                    onChange={e => setNewWallet({ ...newWallet, balance: e.target.value })}
                    placeholder={language === 'zh' ? '欠款填负数' : 'Negative if you owe'}
                    className="w-full bg-secondary text-foreground rounded-xl px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {language === 'zh' ? '账单日 (每月)' : 'Billing Day'}
                    </label>
                    <NumberPicker
                      value={parseInt(newWallet.billingDay) || 1}
                      onChange={v => setNewWallet({ ...newWallet, billingDay: v.toString() })}
                      min={1}
                      max={31}
                      language={language}
                      title={language === 'zh' ? '选择账单日' : 'Select Billing Day'}
                      suffix={language === 'zh' ? '日' : ''}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {language === 'zh' ? '还款日 (每月)' : 'Due Day'}
                    </label>
                    <NumberPicker
                      value={parseInt(newWallet.dueDay) || 1}
                      onChange={v => setNewWallet({ ...newWallet, dueDay: v.toString() })}
                      min={1}
                      max={31}
                      language={language}
                      title={language === 'zh' ? '选择还款日' : 'Select Due Day'}
                      suffix={language === 'zh' ? '日' : ''}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {language === 'zh' ? '还款提醒 (提前天数)' : 'Remind Days Before Due'}
                  </label>
                  <NumberPicker
                    value={parseInt(newWallet.remindDays) || 3}
                    onChange={v => setNewWallet({ ...newWallet, remindDays: v.toString() })}
                    min={1}
                    max={14}
                    language={language}
                    title={language === 'zh' ? '选择提醒天数' : 'Select Remind Days'}
                    suffix={language === 'zh' ? '天' : 'days'}
                  />
                </div>
              </div>
            ) : (
              <input
                type="number"
                value={newWallet.balance}
                onChange={e => setNewWallet({ ...newWallet, balance: e.target.value })}
                placeholder={t.assets.initialBalance}
                className="w-full bg-secondary text-foreground rounded-xl px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewWallet({
                    name: '',
                    currency: primaryCurrency,
                    color: '#3b82f6',
                    balance: '',
                    iconId: undefined,
                    type: 'cash',
                    creditLimit: '',
                    billingDay: '1',
                    dueDay: '1',
                    remindDays: '3',
                  });
                }}
                className="flex-1 py-2 rounded-xl bg-secondary text-muted-foreground text-sm"
              >
                {t.common.cancel}
              </button>
              <button onClick={handleCreateWallet} className="flex-1 py-2 rounded-xl gradient-primary text-primary-foreground text-sm font-medium">
                {t.assets.create}
              </button>
            </div>
          </div>
        )}
      </div>

      <WalletIconPicker
        open={showIconPicker}
        value={newWallet.iconId}
        onChange={handleIconSelect}
        onClose={() => setShowIconPicker(false)}
        language={language}
      />

      <EditWalletModal
        open={!!editingWallet}
        wallet={editingWallet}
        onClose={() => setEditingWallet(null)}
      />

      <WalletStatsModal
        open={!!statsWallet}
        wallet={statsWallet}
        onClose={() => setStatsWallet(null)}
      />
    </div>
  );
}
