import { describe, expect, it } from 'vitest';
import { calculateWalletBalance } from './walletBalance';
import type { Transaction } from '@/types';

const transfer: Transaction = {
  id: 'transfer-1',
  type: 'transfer',
  amount: 100,
  currency: 'CNY',
  platformId: 'bank',
  walletId: 'cny-wallet',
  category: 'transfer',
  datetime: '2026-09-07T10:00:00.000Z',
  note: 'Regression fixture',
  createdAt: 1,
  fromWalletId: 'cny-wallet',
  toWalletId: 'myr-wallet',
  fromAmount: 100,
  toAmount: 50,
  fromCurrency: 'CNY',
  toCurrency: 'MYR',
};

describe('calculateWalletBalance', () => {
  it('debits the source and credits the recipient wallet exactly once', () => {
    const convert = (amount: number) => amount;
    expect(calculateWalletBalance('cny-wallet', 'CNY', 1000, [transfer], convert)).toBe(900);
    expect(calculateWalletBalance('myr-wallet', 'MYR', 200, [transfer], convert)).toBe(250);
  });

  it('does not apply an unrelated transfer to a third wallet', () => {
    expect(calculateWalletBalance('other-wallet', 'USD', 75, [transfer], (amount) => amount)).toBe(75);
  });
});
