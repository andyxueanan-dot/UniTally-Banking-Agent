import { useState, useMemo, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { getHistoricalRateForChart, getCachedHistoricalDates, fetchHistoricalRates, getLatestCachedRate } from '@/lib/exchangeRates';
import { ArrowRightLeft, ChevronDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { translations } from '@/lib/i18n';
import { SUPPORTED_CURRENCIES } from '@/lib/currencies';

type Period = '5d' | '1m' | '3m' | '1y' | '3y' | '10y';

interface Props {
  compact?: boolean;
  currencies?: string[];
  fromCurrency?: string;
  toCurrency?: string;
  onFromChange?: (currency: string) => void;
  onToChange?: (currency: string) => void;
}

export default function ExchangeRateChart({ 
  compact = false, 
  currencies: propCurrencies,
  fromCurrency: propFromCurrency,
  toCurrency: propToCurrency,
  onFromChange,
  onToChange 
}: Props) {
  const { primaryCurrency, secondaryCurrency, latestRate, language, refreshRates } = useApp();
  const t = translations[language];
  const [reversed, setReversed] = useState(false);
  const [period, setPeriod] = useState<Period>('1m');
  const [isLoading, setIsLoading] = useState(false);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [localFromCurrency, setLocalFromCurrency] = useState(propFromCurrency || primaryCurrency);
  const [localToCurrency, setLocalToCurrency] = useState(propToCurrency || secondaryCurrency);

  const currencies = propCurrencies || [primaryCurrency, secondaryCurrency];
  const fromCur = reversed ? localToCurrency : localFromCurrency;
  const toCur = reversed ? localFromCurrency : localToCurrency;

  useEffect(() => {
    if (propFromCurrency) setLocalFromCurrency(propFromCurrency);
  }, [propFromCurrency]);

  useEffect(() => {
    if (propToCurrency) setLocalToCurrency(propToCurrency);
  }, [propToCurrency]);

  const getCurrencySymbol = (code: string) => {
    return SUPPORTED_CURRENCIES.find(c => c.code === code)?.symbol || code;
  };

  const handleFromChange = (code: string) => {
    setLocalFromCurrency(code);
    setShowFromPicker(false);
    if (onFromChange) onFromChange(code);
    refreshRates(code, localToCurrency);
  };

  const handleToChange = (code: string) => {
    setLocalToCurrency(code);
    setShowToPicker(false);
    if (onToChange) onToChange(code);
    refreshRates(localFromCurrency, code);
  };

  const getPeriodDays = (p: Period): number => {
    switch (p) {
      case '5d': return 5;
      case '1m': return 30;
      case '3m': return 90;
      case '1y': return 365;
      case '3y': return 1095;
      case '10y': return 3650;
      default: return 365;
    }
  };

  useEffect(() => {
    const days = getPeriodDays(period);
    setIsLoading(true);
    fetchHistoricalRates(localFromCurrency, localToCurrency, days).finally(() => {
      setIsLoading(false);
    });
  }, [period, localFromCurrency, localToCurrency]);

  const chartData = useMemo(() => {
    const dates = getCachedHistoricalDates();
    const now = new Date();
    const cutoff = new Date();
    if (period === '5d') cutoff.setDate(now.getDate() - 5);
    else if (period === '1m') cutoff.setMonth(now.getMonth() - 1);
    else if (period === '3m') cutoff.setMonth(now.getMonth() - 3);
    else if (period === '1y') cutoff.setFullYear(now.getFullYear() - 1);
    else if (period === '3y') cutoff.setFullYear(now.getFullYear() - 3);
    else if (period === '10y') cutoff.setFullYear(now.getFullYear() - 10);

    const cutoffStr = cutoff.toISOString().split('T')[0];
    return dates
      .filter(d => d >= cutoffStr)
      .map(d => {
        let rate = getHistoricalRateForChart(localFromCurrency, localToCurrency, d);
        if (rate && reversed) rate = 1 / rate;
        return rate ? { date: d.slice(5), rate: parseFloat(rate.toFixed(4)) } : null;
      })
      .filter(Boolean) as { date: string; rate: number }[];
  }, [period, reversed, localFromCurrency, localToCurrency]);

  const periods: { key: Period; label: string }[] = [
    { key: '5d', label: t.dashboard.periods['5d'] },
    { key: '1m', label: t.dashboard.periods['1m'] },
    { key: '3m', label: t.dashboard.periods['3m'] },
    { key: '1y', label: t.dashboard.periods['1y'] },
  ];

  const CurrencyPicker = ({ 
    isOpen, 
    onClose, 
    onSelect, 
    selected, 
    exclude 
  }: { 
    isOpen: boolean; 
    onClose: () => void; 
    onSelect: (code: string) => void;
    selected: string;
    exclude?: string;
  }) => {
    if (!isOpen) return null;
    
    return (
      <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-lg overflow-hidden min-w-[120px]">
        {currencies
          .filter(c => c !== exclude)
          .map(code => (
            <button
              key={code}
              onClick={() => {
                onSelect(code);
                onClose();
              }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-secondary transition-colors flex items-center gap-2 ${
                code === selected ? 'bg-primary/10 text-primary' : 'text-foreground'
              }`}
            >
              <span className="font-medium">{code}</span>
              <span className="text-muted-foreground text-xs">{getCurrencySymbol(code)}</span>
            </button>
          ))}
      </div>
    );
  };

  return (
    <div className={compact ? '' : 'glass-card'}>
      {!compact && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowFromPicker(!showFromPicker)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary hover:bg-muted transition-colors"
              >
                <span className="text-lg font-bold text-foreground">{fromCur}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
              <CurrencyPicker
                isOpen={showFromPicker}
                onClose={() => setShowFromPicker(false)}
                onSelect={handleFromChange}
                selected={fromCur}
                exclude={toCur}
              />
            </div>
            <span className="text-muted-foreground">→</span>
            <div className="relative">
              <button
                onClick={() => setShowToPicker(!showToPicker)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary hover:bg-muted transition-colors"
              >
                <span className="text-lg font-bold text-foreground">{toCur}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
              <CurrencyPicker
                isOpen={showToPicker}
                onClose={() => setShowToPicker(false)}
                onSelect={handleToChange}
                selected={toCur}
                exclude={fromCur}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(() => {
              const displayRate = reversed ? (latestRate ? 1 / latestRate : 0) : latestRate;
              const displayValue = displayRate * 100;
              return (
                <span className="text-xl font-bold text-foreground">
                  100 {fromCur} = {displayValue.toFixed(2)} {toCur}
                </span>
              );
            })()}
            <button
              onClick={() => setReversed(!reversed)}
              className="p-2.5 rounded-2xl bg-secondary hover:bg-muted transition-all text-foreground"
            >
              <ArrowRightLeft className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {compact && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1">
            <div className="relative">
              <button
                onClick={() => setShowFromPicker(!showFromPicker)}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-secondary/50 hover:bg-secondary transition-colors"
              >
                <span className="text-sm font-medium text-foreground">{fromCur}</span>
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </button>
              <CurrencyPicker
                isOpen={showFromPicker}
                onClose={() => setShowFromPicker(false)}
                onSelect={handleFromChange}
                selected={fromCur}
                exclude={toCur}
              />
            </div>
            <span className="text-muted-foreground text-xs">→</span>
            <div className="relative">
              <button
                onClick={() => setShowToPicker(!showToPicker)}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-secondary/50 hover:bg-secondary transition-colors"
              >
                <span className="text-sm font-medium text-foreground">{toCur}</span>
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </button>
              <CurrencyPicker
                isOpen={showToPicker}
                onClose={() => setShowToPicker(false)}
                onSelect={handleToChange}
                selected={toCur}
                exclude={fromCur}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(() => {
              const displayRate = reversed ? (latestRate ? 1 / latestRate : 0) : latestRate;
              const displayValue = displayRate * 100;
              return (
                <span className="text-lg font-bold text-foreground">
                  {language === 'zh' 
                    ? `100 ${fromCur} = ${displayValue.toFixed(2)} ${toCur}`
                    : `100 ${fromCur} = ${displayValue.toFixed(2)} ${toCur}`}
                </span>
              );
            })()}
            <button
              onClick={() => setReversed(!reversed)}
              className="p-1.5 rounded-xl bg-secondary hover:bg-muted transition-all text-foreground"
            >
              <ArrowRightLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-3">
        {periods.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
              period === p.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          {language === 'zh' ? '正在加载数据...' : 'Loading data...'}
        </div>
      ) : chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={compact ? 150 : 280}>
          <LineChart data={chartData}>
            <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '12px',
                fontSize: 12,
              }}
              formatter={(value: number) => [value.toFixed(4), `${fromCur}→${toCur}`]}
            />
            <Line type="monotone" dataKey="rate" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="text-center py-6 text-muted-foreground text-sm">{t.dashboard.noRateData}</div>
      )}
    </div>
  );
}
