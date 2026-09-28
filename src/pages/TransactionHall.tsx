import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { getCurrencySymbol } from '@/lib/currencies';
import { Trash2, X, ChevronDown, Wallet, CreditCard, ArrowRight, Filter } from 'lucide-react';
import AddTransactionModal from '@/components/AddTransactionModal';
import CategoryIcon from '@/components/CategoryIcon';
import WalletIconImg from '@/components/WalletIconImg';
import { translations } from '@/lib/i18n';

type TransactionFilter = 'all' | 'expense' | 'income' | 'transfer';

function formatDateTimeDisplay(datetime: string, language: string): string {
  const date = new Date(datetime);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return language === 'zh' ? `${month}月${day}日 ${hours}:${minutes}` : `${month}/${day} ${hours}:${minutes}`;
}

function getDateFromDatetime(datetime: string): string {
  return datetime.split('T')[0];
}

export default function TransactionHall() {
  const { transactions, categories, platforms, wallets, t, language } = useApp();
  const tr = translations[language];
  const { deleteTransaction } = useApp();
  const [filter, setFilter] = useState<TransactionFilter>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [showPlatformPicker, setShowPlatformPicker] = useState(false);
  const [editTx, setEditTx] = useState<typeof transactions[0] | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const selectedCategory = selectedCategoryId ? categories.find(c => c.id === selectedCategoryId) : null;
  const selectedWallet = selectedWalletId ? wallets.find(w => w.id === selectedWalletId) : null;
  const selectedPlatform = selectedPlatformId ? platforms.find(p => p.id === selectedPlatformId) : null;

  const filtered = transactions
    .filter(t => {
      if (filter === 'all') return true;
      if (filter === 'transfer') return t.type === 'transfer';
      return t.type === filter;
    })
    .filter(t => {
      if (selectedCategoryId || selectedWalletId || selectedPlatformId) {
        return t.type !== 'transfer';
      }
      return true;
    })
    .filter(t => !selectedCategoryId || t.category === selectedCategoryId)
    .filter(t => !selectedWalletId || t.walletId === selectedWalletId)
    .filter(t => !selectedPlatformId || t.platformId === selectedPlatformId)
    .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime() || b.createdAt - a.createdAt);

  const getCategory = (id: string) => categories.find(c => c.id === id);
  const getPlatform = (id: string) => platforms.find(p => p.id === id);
  const getWallet = (id: string) => wallets.find(w => w.id === id);

  const grouped: Record<string, typeof filtered> = {};
  for (const t of filtered) {
    const dateKey = getDateFromDatetime(t.datetime);
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(t);
  }

  const typeFilters: { key: TransactionFilter; label: string }[] = [
    { key: 'all', label: t.transactionHall.allRecords },
    { key: 'expense', label: t.transactionHall.expenseOnly },
    { key: 'income', label: t.transactionHall.incomeOnly },
    { key: 'transfer', label: language === 'zh' ? '仅转账' : 'Transfers Only' },
  ];

  const getTypeFilterLabel = () => {
    const found = typeFilters.find(f => f.key === filter);
    return found ? found.label : t.transactionHall.allRecords;
  };

  const formatDateHeader = (dateStr: string): string => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (dateStr === today.toISOString().split('T')[0]) {
      return t.transactionHall.today;
    } else if (dateStr === yesterday.toISOString().split('T')[0]) {
      return t.transactionHall.yesterday;
    } else {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      if (language === 'zh') {
        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        return `${month}月${day}日 ${weekdays[date.getDay()]}`;
      } else {
        const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return `${month}/${day} ${weekdays[date.getDay()]}`;
      }
    }
  };

  const clearAllFilters = () => {
    setSelectedCategoryId(null);
    setSelectedWalletId(null);
    setSelectedPlatformId(null);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-foreground mb-5">{t.transactionHall.title}</h2>

      <div className="flex gap-2 mb-5 flex-wrap">
        <button
          onClick={() => setShowTypePicker(true)}
          className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
            filter !== 'all' ? 'bg-primary text-primary-foreground accent-glow' : 'bg-secondary text-muted-foreground hover:bg-muted'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          {getTypeFilterLabel()}
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setShowCategoryPicker(true)}
          className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
            selectedCategoryId ? 'bg-primary text-primary-foreground accent-glow' : 'bg-secondary text-muted-foreground hover:bg-muted'
          }`}
        >
          {selectedCategory ? (
            <>
              <CategoryIcon icon={selectedCategory.icon} color={selectedCategoryId ? 'currentColor' : selectedCategory.color} size={14} />
              {tr.categories[selectedCategoryId as keyof typeof tr.categories] || selectedCategory.name}
            </>
          ) : (
            <>
              {t.transactionHall.selectCategory} <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
        <button
          onClick={() => setShowWalletPicker(true)}
          className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
            selectedWalletId ? 'bg-primary text-primary-foreground accent-glow' : 'bg-secondary text-muted-foreground hover:bg-muted'
          }`}
        >
          {selectedWallet ? (
            <>
              <Wallet className="w-3.5 h-3.5" />
              {selectedWallet.name}
            </>
          ) : (
            <>
              {t.transactionHall.selectWallet} <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
        <button
          onClick={() => setShowPlatformPicker(true)}
          className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
            selectedPlatformId ? 'bg-primary text-primary-foreground accent-glow' : 'bg-secondary text-muted-foreground hover:bg-muted'
          }`}
        >
          {selectedPlatform ? (
            <>
              <CreditCard className="w-3.5 h-3.5" />
              {tr.platforms[selectedPlatformId as keyof typeof tr.platforms] || selectedPlatform.name}
            </>
          ) : (
            <>
              {t.transactionHall.selectPlatform} <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>

      {showTypePicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowTypePicker(false)}>
          <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm modal-overlay" />
          <div
            className="relative w-full sm:max-w-sm max-h-[60vh] flex flex-col glass-card rounded-t-3xl sm:rounded-3xl modal-content overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">{language === 'zh' ? '选择类型' : 'Select Type'}</h3>
              <button onClick={() => setShowTypePicker(false)} className="p-1.5 rounded-xl hover:bg-secondary transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {typeFilters.map(f => (
                <button
                  key={f.key}
                  onClick={() => { setFilter(f.key); setShowTypePicker(false); clearAllFilters(); }}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-colors ${
                    filter === f.key ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-secondary'
                  }`}
                >
                  <span className="text-sm font-medium text-foreground">{f.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showCategoryPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowCategoryPicker(false)}>
          <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm modal-overlay" />
          <div
            className="relative w-full sm:max-w-sm max-h-[60vh] flex flex-col glass-card rounded-t-3xl sm:rounded-3xl modal-content overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">{t.transactionHall.selectCategory}</h3>
              <button onClick={() => setShowCategoryPicker(false)} className="p-1.5 rounded-xl hover:bg-secondary transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1">
              {[...categories].sort((a, b) => a.order - b.order).map(c => {
                const translatedName = tr.categories[c.id as keyof typeof tr.categories] || c.name;
                return (
                  <button
                    key={c.id}
                    onClick={() => { setSelectedCategoryId(c.id); setShowCategoryPicker(false); setFilter('all'); setSelectedWalletId(null); setSelectedPlatformId(null); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-colors ${
                      selectedCategoryId === c.id ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-secondary'
                    }`}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: (c.color || '#94a3b8') + '20' }}
                    >
                      <CategoryIcon icon={c.icon} color={c.color} size={18} />
                    </div>
                    <span className="text-sm font-medium text-foreground">{translatedName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showWalletPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowWalletPicker(false)}>
          <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm modal-overlay" />
          <div
            className="relative w-full sm:max-w-sm max-h-[60vh] flex flex-col glass-card rounded-t-3xl sm:rounded-3xl modal-content overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">{t.transactionHall.selectWallet}</h3>
              <button onClick={() => setShowWalletPicker(false)} className="p-1.5 rounded-xl hover:bg-secondary transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1">
              {wallets.map(w => (
                <button
                  key={w.id}
                  onClick={() => { setSelectedWalletId(w.id); setShowWalletPicker(false); setFilter('all'); setSelectedCategoryId(null); setSelectedPlatformId(null); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-colors ${
                    selectedWalletId === w.id ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-secondary'
                  }`}
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: (w.color || '#94a3b8') + '20' }}>
                    {w.icon ? (
                      <WalletIconImg iconId={w.icon} size={18} />
                    ) : (
                      <Wallet className="w-4 h-4" style={{ color: w.color }} />
                    )}
                  </div>
                  <span className="text-sm font-medium text-foreground">{w.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showPlatformPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowPlatformPicker(false)}>
          <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm modal-overlay" />
          <div
            className="relative w-full sm:max-w-sm max-h-[60vh] flex flex-col glass-card rounded-t-3xl sm:rounded-3xl modal-content overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">{t.transactionHall.selectPlatform}</h3>
              <button onClick={() => setShowPlatformPicker(false)} className="p-1.5 rounded-xl hover:bg-secondary transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1">
              {platforms.map(p => {
                const translatedName = tr.platforms[p.id as keyof typeof tr.platforms] || p.name;
                return (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedPlatformId(p.id); setShowPlatformPicker(false); setFilter('all'); setSelectedCategoryId(null); setSelectedWalletId(null); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-colors ${
                      selectedPlatformId === p.id ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-secondary'
                    }`}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: (p.color || '#94a3b8') + '20' }}
                    >
                      <CreditCard className="w-4 h-4" style={{ color: p.color }} />
                    </div>
                    <span className="text-sm font-medium text-foreground">{translatedName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {Object.keys(grouped).length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-lg">{t.transactionHall.noRecords}</p>
          <p className="text-sm mt-1">{t.transactionHall.addFirst}</p>
        </div>
      )}

      {Object.entries(grouped).map(([date, txs]) => (
        <div key={date} className="mb-5">
          <div className="text-sm text-muted-foreground mb-2 px-1">{formatDateHeader(date)}</div>
          <div className="space-y-2">
            {txs.map(tx => {
              if (tx.type === 'transfer') {
                const fromWallet = wallets.find(w => w.id === tx.fromWalletId);
                const toWallet = wallets.find(w => w.id === tx.toWalletId);
                return (
                  <div
                    key={tx.id}
                    className="glass-card-hover cursor-pointer relative group"
                    onClick={() => setEditTx(tx)}
                    onMouseEnter={() => setHoveredId(tx.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 bg-primary/10">
                        <ArrowRight className="w-5 h-5 text-primary" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {language === 'zh' ? '转账' : 'Transfer'}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                          <span>{fromWallet?.name}</span>
                          <ArrowRight className="w-3 h-3" />
                          <span>{toWallet?.name}</span>
                          {tx.note && <span>· {tx.note}</span>}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-semibold text-primary">
                          -{getCurrencySymbol(tx.fromCurrency || tx.currency)}{(tx.fromAmount || tx.amount).toFixed(2)}
                        </div>
                        <div className="text-xs text-income">
                          +{getCurrencySymbol(tx.toCurrency || '')}{(tx.toAmount || 0).toFixed(2)}
                        </div>
                      </div>

                      {hoveredId === tx.id && (
                        <button
                          onClick={e => { e.stopPropagation(); deleteTransaction(tx.id); }}
                          className="absolute right-2 top-2 p-1.5 rounded-xl bg-expense/10 text-expense hover:bg-expense hover:text-primary-foreground transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              const cat = getCategory(tx.category);
              const plat = getPlatform(tx.platformId);
              const wallet = getWallet(tx.walletId);
              const translatedCatName = tr.categories[tx.category as keyof typeof tr.categories] || cat?.name || tx.category;
              const translatedPlatName = tr.platforms[tx.platformId as keyof typeof tr.platforms] || plat?.name;
              return (
                <div
                  key={tx.id}
                  className="glass-card-hover cursor-pointer relative group"
                  onClick={() => setEditTx(tx)}
                  onMouseEnter={() => setHoveredId(tx.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: (cat?.color || '#94a3b8') + '20' }}
                    >
                      <CategoryIcon icon={cat?.icon || (tx.type === 'income' ? '💰' : '📦')} color={cat?.color} size={20} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {tx.type === 'income' ? translatedCatName : translatedCatName}
                        </span>
                        {plat && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-lg text-primary-foreground"
                            style={{ backgroundColor: plat.color }}
                          >
                            {translatedPlatName}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex gap-2">
                        <span>{formatDateTimeDisplay(tx.datetime, language)}</span>
                        {wallet && <span>· {wallet.name}</span>}
                        {tx.note && <span>· {tx.note}</span>}
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <span className={`text-sm font-semibold ${tx.type === 'income' ? 'text-income' : 'text-expense'}`}>
                        {tx.type === 'income' ? '+' : '-'}{getCurrencySymbol(tx.currency)}{tx.amount.toFixed(2)}
                      </span>
                      <span className="text-[10px] ml-1 text-muted-foreground">{tx.currency}</span>
                    </div>

                    {hoveredId === tx.id && (
                      <button
                        onClick={e => { e.stopPropagation(); deleteTransaction(tx.id); }}
                        className="absolute right-2 top-2 p-1.5 rounded-xl bg-expense/10 text-expense hover:bg-expense hover:text-primary-foreground transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {editTx && (
        <AddTransactionModal open={!!editTx} onClose={() => setEditTx(null)} editTransaction={editTx} />
      )}
    </div>
  );
}
