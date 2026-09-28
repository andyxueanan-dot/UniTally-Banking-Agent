import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { PlanType, PLAN_FEATURES, PLAN_NAMES } from '@/lib/plans';
import { storage } from '@/lib/storage';

interface SubscriptionContextType {
  plan: PlanType;
  features: typeof PLAN_FEATURES.free;
  planName: string;
  isPremium: boolean;
  upgrade: () => void;
  downgrade: () => void;
  canUse: (feature: keyof typeof PLAN_FEATURES.free) => boolean;
  getLimit: (feature: keyof typeof PLAN_FEATURES.free) => number;
  showUpgradeModal: () => void;
  hideUpgradeModal: () => void;
  upgradeModalVisible: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [plan, setPlan] = useState<PlanType>(() => {
    const saved = storage.get('subscription_plan');
    return (saved as PlanType) || 'free';
  });
  const [upgradeModalVisible, setUpgradeModalVisible] = useState(false);

  useEffect(() => {
    storage.set('subscription_plan', plan);
  }, [plan]);

  const features = PLAN_FEATURES[plan];
  const isPremium = plan === 'premium';
  const planName = PLAN_NAMES[plan].zh;

  const upgrade = () => {
    setPlan('premium');
  };

  const downgrade = () => {
    setPlan('free');
  };

  const canUse = (feature: keyof typeof PLAN_FEATURES.free): boolean => {
    const value = features[feature];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    return true;
  };

  const getLimit = (feature: keyof typeof PLAN_FEATURES.free): number => {
    const value = features[feature];
    if (typeof value === 'number') return value;
    return Infinity;
  };

  const showUpgradeModal = () => setUpgradeModalVisible(true);
  const hideUpgradeModal = () => setUpgradeModalVisible(false);

  return (
    <SubscriptionContext.Provider
      value={{
        plan,
        features,
        planName,
        isPremium,
        upgrade,
        downgrade,
        canUse,
        getLimit,
        showUpgradeModal,
        hideUpgradeModal,
        upgradeModalVisible,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return context;
}
