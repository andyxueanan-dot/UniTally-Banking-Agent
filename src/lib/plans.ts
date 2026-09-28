export type PlanType = 'free' | 'premium';

export interface PlanFeatures {
  maxWallets: number;
  maxTransactionsPerMonth: number;
  exportEnabled: boolean;
  budgetLimit: number;
  subscriptionTrackingLimit: number;
}

export const PLAN_FEATURES: Record<PlanType, PlanFeatures> = {
  free: {
    maxWallets: 3,
    maxTransactionsPerMonth: 100,
    exportEnabled: false,
    budgetLimit: 3,
    subscriptionTrackingLimit: 3,
  },
  premium: {
    maxWallets: Infinity,
    maxTransactionsPerMonth: Infinity,
    exportEnabled: true,
    budgetLimit: Infinity,
    subscriptionTrackingLimit: Infinity,
  },
};

export const PLAN_PRICES = {
  free: {
    monthly: 0,
    quarterly: 0,
    lifetime: 0,
  },
  premium: {
    monthly: 2.99,
    quarterly: 29.99,
    lifetime: 35.99,
  },
};

export const PLAN_NAMES = {
  free: {
    zh: '免费版',
    en: 'Free',
  },
  premium: {
    zh: '高级版',
    en: 'Premium',
  },
};

export const FEATURE_DESCRIPTIONS = {
  maxWallets: {
    zh: '钱包数量上限',
    en: 'Max Wallets',
  },
  maxTransactionsPerMonth: {
    zh: '每月交易记录上限',
    en: 'Monthly Transactions',
  },
  exportEnabled: {
    zh: '数据导出',
    en: 'Data Export',
  },
  budgetLimit: {
    zh: '预算项目上限',
    en: 'Budget Limit',
  },
  subscriptionTrackingLimit: {
    zh: '订阅追踪上限',
    en: 'Subscription Tracking',
  },
};
