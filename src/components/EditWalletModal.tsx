import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { X, Check } from 'lucide-react';
import ColorPicker from '@/components/ColorPicker';
import WalletIconPicker from '@/components/WalletIconPicker';
import WalletIconImg from '@/components/WalletIconImg';
import NumberPicker from '@/components/NumberPicker';
import { getWalletIconById } from '@/lib/walletIcons';
import type { Wallet } from '@/types';
import { translations } from '@/lib/i18n';

interface Props {
  open: boolean;
  wallet: Wallet | null;
  onClose: () => void;
}

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

export default function EditWalletModal({ open, wallet, onClose }: Props) {
  const { updateWallet, currencies, language } = useApp();
  const t = translations[language];

  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [balance, setBalance] = useState('');
  const [iconId, setIconId] = useState<number | undefined>();
  const [type, setType] = useState<Wallet['type']>('cash');
  const [creditLimit, setCreditLimit] = useState('');
  const [billingDay, setBillingDay] = useState('1');
  const [dueDay, setDueDay] = useState('1');
  const [remindDays, setRemindDays] = useState('3');
  const [showIconPicker, setShowIconPicker] = useState(false);

  useEffect(() => {
    if (wallet) {
      setName(wallet.name);
      setCurrency(wallet.currency);
      setColor(wallet.color);
      setBalance(wallet.balance.toString());
      setIconId(wallet.iconId);
      setType(wallet.type || 'cash');
      setCreditLimit(wallet.creditLimit?.toString() || '');
      setBillingDay(wallet.billingDay?.toString() || '1');
      setDueDay(wallet.dueDay?.toString() || '1');
      setRemindDays(wallet.remindDays?.toString() || '3');
    }
  }, [wallet]);

  if (!open || !wallet) return null;

  const handleSave = () => {
    if (!name.trim()) return;

    updateWallet({
      ...wallet,
      name: name.trim(),
      currency,
      color: iconId ? '#3b82f6' : color,
      balance: parseFloat(balance) || 0,
      iconId,
      type,
      creditLimit: type === 'credit' ? parseFloat(creditLimit) || 0 : undefined,
      billingDay: type === 'credit' ? parseInt(billingDay) || 1 : undefined,
      dueDay: type === 'credit' ? parseInt(dueDay) || 1 : undefined,
      remindDays: type === 'credit' ? parseInt(remindDays) || 3 : undefined,
    });

    onClose();
  };

  const handleIconSelect = (id: number | undefined) => {
    setIconId(id);
    if (id) {
      setColor('#3b82f6');
    }
  };

  const handleColorSelect = (c: string) => {
    setColor(c);
    setIconId(undefined);
  };

  const selectedIcon = iconId ? getWalletIconById(iconId) : null;

  const getDisplayName = (icon: ReturnType<typeof getWalletIconById>) => {
    if (!icon) return '';
    return language === 'zh' ? icon.nameLocal : icon.name;
  };

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
          <h3 className="text-base font-semibold text-foreground">
            {language === 'zh' ? '编辑钱包' : 'Edit Wallet'}
          </h3>
          <button
            onClick={handleSave}
            className="text-primary hover:text-primary/80 transition-colors"
          >
            <Check className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">{t.assets.walletName}</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t.assets.walletName}
              className="w-full bg-secondary text-foreground rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-1 block">
              {language === 'zh' ? '钱包类型' : 'Wallet Type'}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(WALLET_TYPE_NAMES[language]) as Array<Wallet['type']>).map(t => {
                const typeNames = WALLET_TYPE_NAMES[language];
                const isSelected = type === t;
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`py-2 rounded-xl text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                    }`}
                  >
                    {typeNames[t]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-1 block">{t.assets.currency}</label>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="w-full bg-secondary text-foreground rounded-xl px-4 py-3 text-sm outline-none"
            >
              {currencies.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-1 block">
              {language === 'zh' ? '关联机构' : 'Linked Institution'}
            </label>
            <button
              onClick={() => setShowIconPicker(true)}
              className={`w-full flex items-center gap-3 bg-secondary text-foreground rounded-xl px-4 py-3 text-sm hover:bg-secondary/80 transition-colors ${iconId ? 'ring-2 ring-primary' : ''}`}
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
                    <span className="text-lg">{wallet.icon}</span>
                  </div>
                  <span className="flex-1 text-left text-muted-foreground">{language === 'zh' ? '选择关联机构（可选）' : 'Select Institution (Optional)'}</span>
                </>
              )}
            </button>
          </div>

          {!iconId && (
            <ColorPicker
              value={color}
              onChange={handleColorSelect}
              label={t.assets.selectColor}
            />
          )}

          {type === 'credit' ? (
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  {language === 'zh' ? '信用卡总限额' : 'Credit Limit'}
                </label>
                <input
                  type="number"
                  value={creditLimit}
                  onChange={e => setCreditLimit(e.target.value)}
                  placeholder={language === 'zh' ? '输入总限额' : 'Enter credit limit'}
                  className="w-full bg-secondary text-foreground rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  {language === 'zh' ? '当前余额（欠款填负数）' : 'Current Balance (negative if debt)'}
                </label>
                <input
                  type="number"
                  value={balance}
                  onChange={e => setBalance(e.target.value)}
                  placeholder={language === 'zh' ? '欠款填负数' : 'Negative if you owe'}
                  className="w-full bg-secondary text-foreground rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">
                    {language === 'zh' ? '账单日 (每月)' : 'Billing Day'}
                  </label>
                  <NumberPicker
                    value={parseInt(billingDay) || 1}
                    onChange={v => setBillingDay(v.toString())}
                    min={1}
                    max={31}
                    language={language}
                    title={language === 'zh' ? '选择账单日' : 'Select Billing Day'}
                    suffix={language === 'zh' ? '日' : ''}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">
                    {language === 'zh' ? '还款日 (每月)' : 'Due Day'}
                  </label>
                  <NumberPicker
                    value={parseInt(dueDay) || 1}
                    onChange={v => setDueDay(v.toString())}
                    min={1}
                    max={31}
                    language={language}
                    title={language === 'zh' ? '选择还款日' : 'Select Due Day'}
                    suffix={language === 'zh' ? '日' : ''}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-sm text-muted-foreground mb-1 block">
                    {language === 'zh' ? '还款提醒 (提前天数)' : 'Remind Days Before Due'}
                  </label>
                  <NumberPicker
                    value={parseInt(remindDays) || 3}
                    onChange={v => setRemindDays(v.toString())}
                    min={1}
                    max={14}
                    language={language}
                    title={language === 'zh' ? '选择提醒天数' : 'Select Remind Days'}
                    suffix={language === 'zh' ? '天' : 'days'}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">{t.assets.initialBalance}</label>
              <input
                type="number"
                value={balance}
                onChange={e => setBalance(e.target.value)}
                placeholder={t.assets.initialBalance}
                className="w-full bg-secondary text-foreground rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}
        </div>

        <div className="safe-area-bottom" />
      </div>

      <WalletIconPicker
        open={showIconPicker}
        value={iconId}
        onChange={handleIconSelect}
        onClose={() => setShowIconPicker(false)}
        language={language}
      />
    </div>
  );
}
