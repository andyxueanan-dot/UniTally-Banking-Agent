import { X, Crown, Check, Zap, Star, Infinity as InfinityIcon, Download, Wallet, Calendar } from 'lucide-react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { PLAN_PRICES } from '@/lib/plans';
import { useApp } from '@/contexts/AppContext';
import { useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function UpgradeModal({ open, onClose }: Props) {
  const { upgrade } = useSubscription();
  const { language } = useApp();
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'quarterly' | 'lifetime'>('lifetime');

  if (!open) return null;

  const t = {
    title: language === 'zh' ? '解锁 UniTally 高级版' : 'Unlock UniTally Premium',
    subtitle: language === 'zh' ? '一次付费，永久使用所有功能' : 'One-time payment, lifetime access to all features',
    monthly: language === 'zh' ? '月度' : 'Monthly',
    quarterly: language === 'zh' ? '季度' : 'Quarterly',
    lifetime: language === 'zh' ? '买断' : 'Lifetime',
    bestValue: language === 'zh' ? '最划算' : 'Best Value',
    popular: language === 'zh' ? '最受欢迎' : 'Most Popular',
    upgrade: language === 'zh' ? '立即升级' : 'Upgrade Now',
    restore: language === 'zh' ? '恢复购买' : 'Restore Purchase',
    perMonth: language === 'zh' ? '/月' : '/mo',
    perQuarter: language === 'zh' ? '/季' : '/qtr',
    oneTime: language === 'zh' ? '一次付费' : 'One-time',
    featuresTitle: language === 'zh' ? '高级版专属功能' : 'Premium Features',
    guarantee: language === 'zh' ? '7天无理由退款' : '7-day money-back guarantee',
  };

  const plans = [
    { 
      key: 'monthly', 
      name: t.monthly, 
      price: PLAN_PRICES.premium.monthly, 
      unit: t.perMonth,
      highlight: false,
    },
    { 
      key: 'quarterly', 
      name: t.quarterly, 
      price: PLAN_PRICES.premium.quarterly, 
      unit: t.perQuarter,
      highlight: true,
      badge: t.popular,
    },
    { 
      key: 'lifetime', 
      name: t.lifetime, 
      price: PLAN_PRICES.premium.lifetime, 
      unit: t.oneTime,
      highlight: false,
      badge: t.bestValue,
    },
  ];

  const features = [
    { icon: Wallet, zh: '无限钱包数量', en: 'Unlimited Wallets' },
    { icon: Calendar, zh: '无限交易记录', en: 'Unlimited Transactions' },
    { icon: Download, zh: '数据导出功能', en: 'Data Export' },
    { icon: InfinityIcon, zh: '无限预算项目', en: 'Unlimited Budgets' },
    { icon: Star, zh: '无限订阅追踪', en: 'Unlimited Subscriptions' },
    { icon: Zap, zh: '高级UI风格', en: 'Premium UI Styles' },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="bg-background rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-border/50">
        <div className="relative bg-gradient-to-br from-amber-500 via-orange-500 to-pink-500 px-6 py-8 text-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <Crown className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{t.title}</h2>
              <p className="text-white/80 text-sm">{t.subtitle}</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              {t.featuresTitle}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <div 
                    key={index} 
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-secondary/50"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-amber-600" />
                    </div>
                    <span className="text-sm text-foreground">
                      {language === 'zh' ? feature.zh : feature.en}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mb-6">
            <div className="grid grid-cols-3 gap-2">
              {plans.map((plan) => (
                <button
                  key={plan.key}
                  onClick={() => setSelectedPlan(plan.key as 'monthly' | 'quarterly' | 'lifetime')}
                  className={`relative p-4 rounded-2xl border-2 transition-all duration-200 ${
                    selectedPlan === plan.key
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-border hover:border-amber-500/50'
                  } ${plan.highlight ? 'ring-2 ring-amber-500/30' : ''}`}
                >
                  {plan.badge && (
                    <div className={`absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${
                      plan.key === 'quarterly' 
                        ? 'bg-amber-500 text-white' 
                        : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
                    }`}>
                      {plan.badge}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mb-1">{plan.name}</div>
                  <div className="text-2xl font-bold text-foreground">
                    ¥{plan.price}
                  </div>
                  <div className="text-xs text-muted-foreground">{plan.unit}</div>
                  {selectedPlan === plan.key && (
                    <div className="absolute top-2 right-2">
                      <Check className="w-4 h-4 text-amber-500" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => {
              upgrade();
              onClose();
            }}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-pink-500 text-white font-semibold text-base hover:opacity-90 transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30"
          >
            <Crown className="w-5 h-5" />
            {t.upgrade}
          </button>

          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3 text-income" />
              {t.guarantee}
            </span>
            <button className="hover:text-foreground transition-colors">
              {t.restore}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
