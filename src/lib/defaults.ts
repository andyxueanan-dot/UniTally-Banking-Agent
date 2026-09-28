import type { Category, Platform } from '@/types';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'food', name: '餐饮', icon: '🍜', color: '#f97316', order: 0 },
  { id: 'transport', name: '交通', icon: '🚗', color: '#3b82f6', order: 1 },
  { id: 'shopping', name: '购物', icon: '🛍️', color: '#ec4899', order: 2 },
  { id: 'housing', name: '住房', icon: '🏠', color: '#8b5cf6', order: 3 },
  { id: 'entertainment', name: '娱乐', icon: '🎮', color: '#06b6d4', order: 4 },
  { id: 'medical', name: '医疗', icon: '🏥', color: '#ef4444', order: 5 },
  { id: 'education', name: '教育', icon: '📚', color: '#14b8a6', order: 6 },
  { id: 'grocery', name: '日用', icon: '🧴', color: '#a3e635', order: 7 },
  { id: 'drink', name: '饮料', icon: '🧋', color: '#10b981', order: 8 },
  { id: 'fitness', name: '健身', icon: '💪', color: '#f59e0b', order: 9 },
  { id: 'gift', name: '礼品', icon: '🎁', color: '#ec4899', order: 10 },
  { id: 'telecom', name: '通讯', icon: '📱', color: '#6366f1', order: 11 },
  { id: 'clothing', name: '服饰', icon: '👗', color: '#f43f5e', order: 12 },
  { id: 'social', name: '社交', icon: '🍻', color: '#fbbf24', order: 13 },
  { id: 'other', name: '其他', icon: '📦', color: '#78716c', order: 14 },
];

export const DEFAULT_PLATFORMS: Platform[] = [
  { id: 'cash', name: '现金', color: '#78716c' },
  { id: 'bank', name: '银行卡', color: '#6366f1' },
];

export const SUBSCRIPTION_ICONS = [
  { id: 'food', name: '餐饮', icon: '🍜', color: '#f97316', order: 0 },
  { id: 'transport', name: '交通', icon: '🚗', color: '#3b82f6', order: 1 },
  { id: 'shopping', name: '购物', icon: '🛍️', color: '#ec4899', order: 2 },
  { id: 'housing', name: '住房', icon: '🏠', color: '#8b5cf6', order: 3 },
  { id: 'entertainment', name: '娱乐', icon: '🎮', color: '#06b6d4', order: 4 },
  { id: 'medical', name: '医疗', icon: '🏥', color: '#ef4444', order: 5 },
  { id: 'education', name: '教育', icon: '📚', color: '#14b8a6', order: 6 },
  { id: 'grocery', name: '日用', icon: '🧴', color: '#a3e635', order: 7 },
  { id: 'drink', name: '饮料', icon: '🧋', color: '#10b981', order: 8 },
  { id: 'fitness', name: '健身', icon: '💪', color: '#f59e0b', order: 9 },
  { id: 'gift', name: '礼品', icon: '🎁', color: '#ec4899', order: 10 },
  { id: 'telecom', name: '通讯', icon: '📱', color: '#6366f1', order: 11 },
  { id: 'clothing', name: '服饰', icon: '👗', color: '#f43f5e', order: 12 },
  { id: 'social', name: '社交', icon: '🍻', color: '#fbbf24', order: 13 },
  { id: 'other', name: '其他', icon: '📦', color: '#78716c', order: 14 },
];
