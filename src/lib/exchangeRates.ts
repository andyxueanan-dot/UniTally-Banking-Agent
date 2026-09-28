import { STORAGE_KEYS, loadFromStorage, saveToStorage } from './storage';
import type { ExchangeRateCache } from '@/types';

const API_BASE = 'https://open.er-api.com/v6';
const LATEST_TTL = 3600_000; // 1 hour
const HISTORICAL_TTL = 86400_000; // 1 day

const initialCache: ExchangeRateCache = {
  latest: {},
  latestTimestamp: 0,
  historical: {},
  historicalTimestamp: 0,
  historicalPair: '',
};

const cache: ExchangeRateCache = loadFromStorage(STORAGE_KEYS.EXCHANGE_RATES, initialCache);

function saveCache() {
  saveToStorage(STORAGE_KEYS.EXCHANGE_RATES, cache);
}

export async function fetchLatestRate(from: string, to: string): Promise<number> {
  if (from === to) return 1;

  const key = `${from}_${to}`;
  const reverseKey = `${to}_${from}`;
  
  if (cache.latest[key] && Date.now() - cache.latestTimestamp < LATEST_TTL) {
    return cache.latest[key][to] || 1;
  }

  try {
    const res = await fetch(`${API_BASE}/latest/${from}`);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    
    if (data.result !== 'success') throw new Error('API returned error');
    
    const rates = data.rates;
    const rate = rates[to];
    
    if (!rate) throw new Error('Currency not found');
    
    if (!cache.latest[key]) cache.latest[key] = {};
    cache.latest[key][to] = rate;
    
    if (!cache.latest[reverseKey]) cache.latest[reverseKey] = {};
    cache.latest[reverseKey][from] = 1 / rate;
    
    for (const [currency, currencyRate] of Object.entries(rates)) {
      if (!cache.latest[`${from}_${currency}`]) cache.latest[`${from}_${currency}`] = {};
      cache.latest[`${from}_${currency}`][currency] = currencyRate as number;
      
      if (currency !== from) {
        const revKey = `${currency}_${from}`;
        if (!cache.latest[revKey]) cache.latest[revKey] = {};
        cache.latest[revKey][from] = 1 / (currencyRate as number);
      }
    }
    
    cache.latestTimestamp = Date.now();
    saveCache();
    return rate;
  } catch {
    return getLatestCachedRate(from, to);
  }
}

export async function fetchHistoricalRates(from: string, to: string, days: number = 365): Promise<void> {
  if (from === to) return;
  
  const pairKey = `${from}_${to}`;
  
  const dates = Object.keys(cache.historical).sort();
  const relevantDates = dates.filter(d => {
    const rate = cache.historical[d]?.[from]?.[to];
    return rate !== undefined;
  });
  const cachedDaysForPair = relevantDates.length;
  
  const isStale = Date.now() - cache.historicalTimestamp >= HISTORICAL_TTL;
  const needsMoreData = cachedDaysForPair < days * 0.8;
  
  if (!isStale && !needsMoreData && cache.historicalPair === pairKey) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/latest/${from}`);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    
    if (data.result !== 'success') throw new Error('API returned error');
    
    const today = new Date().toISOString().split('T')[0];
    const rates = data.rates;
    const toRate = rates[to];
    
    if (toRate) {
      if (!cache.historical[today]) cache.historical[today] = {};
      if (!cache.historical[today][from]) cache.historical[today][from] = {};
      cache.historical[today][from][to] = toRate;
      
      if (!cache.historical[today][to]) cache.historical[today][to] = {};
      cache.historical[today][to][from] = 1 / toRate;
    }
    
    cache.historicalPair = pairKey;
    cache.historicalTimestamp = Date.now();
    saveCache();
  } catch (e) {
    console.warn('Failed to fetch historical rates:', e);
  }
}

export function getHistoricalRate(from: string, to: string, date: string): number {
  if (from === to) return 1;
  
  const rate = cache.historical[date]?.[from]?.[to];
  if (rate) return rate;
  
  const d = new Date(date);
  for (let i = 1; i <= 5; i++) {
    d.setDate(d.getDate() - 1);
    const fallbackDate = d.toISOString().split('T')[0];
    const fallbackRate = cache.historical[fallbackDate]?.[from]?.[to];
    if (fallbackRate) return fallbackRate;
  }
  
  return getLatestCachedRate(from, to);
}

export function getLatestCachedRate(from: string, to: string): number {
  if (from === to) return 1;
  
  const directRate = cache.latest[`${from}_${to}`]?.[to];
  if (directRate) return directRate;
  
  const fromToEur = cache.latest[`${from}_EUR`]?.['EUR'];
  const toToEur = cache.latest[`${to}_EUR`]?.['EUR'];
  if (fromToEur && toToEur) {
    return toToEur / fromToEur;
  }
  
  const eurToFrom = cache.latest[`EUR_${from}`]?.[from];
  const eurToTo = cache.latest[`EUR_${to}`]?.[to];
  if (eurToFrom && eurToTo) {
    return eurToTo / eurToFrom;
  }
  
  return 1;
}

export function getCachedHistoricalDates(): string[] {
  return Object.keys(cache.historical).sort();
}

export function getHistoricalRateForChart(from: string, to: string, date: string): number | null {
  const directRate = cache.historical[date]?.[from]?.[to];
  if (directRate) return directRate;
  
  const fromRate = cache.historical[date]?.['EUR']?.[from];
  const toRate = cache.historical[date]?.['EUR']?.[to];
  if (fromRate && toRate) {
    return toRate / fromRate;
  }
  
  return null;
}
