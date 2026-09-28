import type { Transaction } from '@/types';

type Converter = (amount: number, fromCurrency: string, toCurrency: string) => number;

export function calculateWalletBalance(
  walletId: string,
  walletCurrency: string,
  initialBalance: number,
  transactions: Transaction[],
  convert: Converter,
) {
  return transactions.reduce((balance, transaction) => {
    if (transaction.type === 'transfer') {
      if (transaction.fromWalletId === walletId) {
        return balance - (transaction.fromAmount ?? transaction.amount);
      }
      if (transaction.toWalletId === walletId) {
        return balance + (transaction.toAmount ?? 0);
      }
      return balance;
    }

    if (transaction.walletId !== walletId) return balance;
    const amount = transaction.currency === walletCurrency
      ? transaction.amount
      : convert(transaction.amount, transaction.currency, walletCurrency);
    return transaction.type === 'income' ? balance + amount : balance - amount;
  }, initialBalance);
}
