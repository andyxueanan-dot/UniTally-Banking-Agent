import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { X, Search, Building2, Wallet, Check, Globe } from 'lucide-react';
import { WALLET_ICONS, WALLET_ICON_COUNTRIES, COUNTRY_NAMES_ZH, getCountryName, type WalletIcon } from '@/lib/walletIcons';
import WalletIconImg from './WalletIconImg';

interface Props {
  open: boolean;
  value: number | undefined;
  onChange: (iconId: number | undefined) => void;
  onClose: () => void;
  language: 'zh' | 'en';
}

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;

function WheelPicker({ 
  options, 
  value, 
  onChange 
}: { 
  options: { id: string; name: string }[]; 
  value: string; 
  onChange: (value: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startIndex = useRef(0);
  const velocity = useRef(0);
  const lastY = useRef(0);
  const lastTime = useRef(0);
  const animationRef = useRef<number>();

  const getIndex = useCallback(() => {
    const idx = options.findIndex(o => o.id === value);
    return idx >= 0 ? idx : 0;
  }, [options, value]);

  const scrollToIndex = useCallback((index: number, animated: boolean = true) => {
    if (!containerRef.current) return;
    
    const clampedIndex = Math.max(0, Math.min(index, options.length - 1));
    const offset = clampedIndex * ITEM_HEIGHT;
    
    if (animated) {
      containerRef.current.style.transition = 'transform 0.3s cubic-bezier(0.23, 1, 0.32, 1)';
    } else {
      containerRef.current.style.transition = 'none';
    }
    
    containerRef.current.style.transform = `translateY(${-offset}px)`;
    
    const selectedOption = options[clampedIndex];
    if (selectedOption && selectedOption.id !== value) {
      onChange(selectedOption.id);
    }
  }, [options, value, onChange]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    isDragging.current = true;
    startY.current = e.touches[0].clientY;
    startIndex.current = getIndex();
    lastY.current = e.touches[0].clientY;
    lastTime.current = Date.now();
    velocity.current = 0;
    
    if (containerRef.current) {
      containerRef.current.style.transition = 'none';
    }
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }, [getIndex]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    
    const currentY = e.touches[0].clientY;
    const deltaY = startY.current - currentY;
    const deltaIndex = deltaY / ITEM_HEIGHT;
    const newIndex = startIndex.current + deltaIndex;
    
    const now = Date.now();
    const dt = now - lastTime.current;
    if (dt > 0) {
      velocity.current = (lastY.current - currentY) / dt;
    }
    lastY.current = currentY;
    lastTime.current = now;
    
    if (containerRef.current) {
      const offset = newIndex * ITEM_HEIGHT;
      containerRef.current.style.transform = `translateY(${-offset}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    
    const container = containerRef.current;
    if (!container) return;
    
    const style = window.getComputedStyle(container);
    const matrix = new DOMMatrix(style.transform);
    const currentOffset = -matrix.m42;
    let targetIndex = Math.round(currentOffset / ITEM_HEIGHT);
    
    if (Math.abs(velocity.current) > 0.5) {
      const momentumIndex = velocity.current > 0 ? targetIndex + 1 : targetIndex - 1;
      targetIndex = Math.round(momentumIndex);
    }
    
    targetIndex = Math.max(0, Math.min(targetIndex, options.length - 1));
    scrollToIndex(targetIndex);
  }, [options.length, scrollToIndex]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    const currentIndex = getIndex();
    const newIndex = Math.max(0, Math.min(currentIndex + delta, options.length - 1));
    scrollToIndex(newIndex);
  }, [getIndex, options.length, scrollToIndex]);

  useEffect(() => {
    scrollToIndex(getIndex(), false);
  }, []);

  return (
    <div className="relative overflow-hidden select-none" style={{ height: ITEM_HEIGHT * VISIBLE_ITEMS }}>
      <div className="absolute inset-0 pointer-events-none z-10">
        <div 
          className="absolute left-0 right-0 h-[2px] bg-primary/20"
          style={{ top: ITEM_HEIGHT * 2 }}
        />
        <div 
          className="absolute left-0 right-0 h-[2px] bg-primary/20"
          style={{ top: ITEM_HEIGHT * 3 }}
        />
      </div>
      
      <div className="absolute inset-x-0 z-20 pointer-events-none">
        <div 
          className="absolute left-0 right-0 rounded-xl bg-primary/10"
          style={{ 
            top: ITEM_HEIGHT * 2,
            height: ITEM_HEIGHT,
          }}
        />
      </div>
      
      <div
        ref={containerRef}
        className="touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        style={{
          paddingTop: ITEM_HEIGHT * 2,
          paddingBottom: ITEM_HEIGHT * 2,
        }}
      >
        {options.map((option) => {
          const isSelected = option.id === value;
          return (
            <div
              key={option.id}
              className={`flex items-center justify-center gap-2 transition-all duration-150 ${
                isSelected ? 'text-foreground font-semibold text-base' : 'text-muted-foreground text-sm'
              }`}
              style={{ height: ITEM_HEIGHT }}
              onClick={() => scrollToIndex(options.findIndex(o => o.id === option.id))}
            >
              <span>{option.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CountryPicker({
  open,
  value,
  onChange,
  onClose,
  language
}: {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  language: 'zh' | 'en';
}) {
  const [tempValue, setTempValue] = useState(value);

  useEffect(() => {
    if (open) {
      setTempValue(value);
    }
  }, [open, value]);

  const countryOptions = useMemo(() => {
    return [
      { id: 'all', name: language === 'zh' ? '所有国家' : 'All Countries' },
      ...WALLET_ICON_COUNTRIES.map(country => ({
        id: country,
        name: getCountryName(country, language)
      }))
    ];
  }, [language]);

  const handleConfirm = () => {
    onChange(tempValue);
    onClose();
  };

  if (!open) return null;

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm modal-overlay" />
      <div
        className="relative w-full sm:max-w-xs glass-card rounded-t-3xl sm:rounded-3xl modal-content overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <h3 className="text-base font-semibold text-foreground">
            {language === 'zh' ? '选择国家/地区' : 'Select Country'}
          </h3>
          <button
            onClick={handleConfirm}
            className="text-primary hover:text-primary/80 transition-colors"
          >
            <Check className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-6">
          {isMobile ? (
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {countryOptions.map(option => (
                <button
                  key={option.id}
                  onClick={() => setTempValue(option.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    tempValue === option.id 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-secondary text-foreground hover:bg-muted'
                  }`}
                >
                  <span className="text-sm font-medium">{option.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <WheelPicker
              options={countryOptions}
              value={tempValue}
              onChange={setTempValue}
            />
          )}
        </div>

        <div className="safe-area-bottom" />
      </div>
    </div>
  );
}

export default function WalletIconPicker({ open, value, onChange, onClose, language }: Props) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'bank' | 'wallet'>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);

  const t = {
    title: language === 'zh' ? '选择钱包图标' : 'Select Wallet Icon',
    search: language === 'zh' ? '搜索' : 'Search',
    all: language === 'zh' ? '全部' : 'All',
    banks: language === 'zh' ? '银行' : 'Banks',
    digitalWallets: language === 'zh' ? '电子钱包' : 'Digital Wallets',
    allCountries: language === 'zh' ? '所有国家' : 'All Countries',
    noIcon: language === 'zh' ? '不使用图标' : 'No Icon',
  };

  const filteredIcons = useMemo(() => {
    let filtered = WALLET_ICONS;
    
    if (typeFilter !== 'all') {
      filtered = filtered.filter(w => w.type === typeFilter);
    }
    
    if (countryFilter !== 'all') {
      filtered = filtered.filter(w => w.country === countryFilter);
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(w => 
        w.name.toLowerCase().includes(searchLower) ||
        w.slug.toLowerCase().includes(searchLower) ||
        (w.nameLocal && w.nameLocal.includes(search))
      );
    }
    
    return filtered;
  }, [typeFilter, countryFilter, search]);

  const selectedIcon = value ? WALLET_ICONS.find(w => w.id === value) : null;

  const handleSelect = (iconId: number | undefined) => {
    onChange(iconId);
    onClose();
  };

  const getDisplayName = (icon: WalletIcon): string => {
    if (language === 'zh' && icon.nameLocal) {
      return icon.nameLocal;
    }
    return icon.name;
  };

  const getDisplaySlug = (icon: WalletIcon): string => {
    if (language === 'zh' && icon.nameLocal) {
      return icon.nameLocal;
    }
    return icon.slug;
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" onClick={onClose}>
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm modal-overlay" />
        <div
          className="relative w-full sm:max-w-lg max-h-[80vh] flex flex-col glass-card rounded-t-3xl sm:rounded-3xl modal-content overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-base font-semibold text-foreground">{t.title}</h3>
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-secondary transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          <div className="px-5 pb-3">
            <div className="flex items-center gap-2 bg-secondary/80 rounded-xl px-3 py-2.5">
              <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t.search + '...'}
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="px-5 pb-3 flex gap-2 flex-wrap">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                typeFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}
            >
              {t.all}
            </button>
            <button
              onClick={() => setTypeFilter('bank')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1 ${
                typeFilter === 'bank' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}
            >
              <Building2 className="w-3 h-3" />
              {t.banks}
            </button>
            <button
              onClick={() => setTypeFilter('wallet')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1 ${
                typeFilter === 'wallet' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}
            >
              <Wallet className="w-3 h-3" />
              {t.digitalWallets}
            </button>

            <button
              onClick={() => setCountryPickerOpen(true)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1 ${
                countryFilter !== 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}
            >
              <Globe className="w-3 h-3" />
              {countryFilter === 'all' ? t.allCountries : getCountryName(countryFilter, language)}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-5">
            <div className="mb-3">
              <button
                onClick={() => handleSelect(undefined)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-colors ${
                  value === undefined ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-secondary'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                  <div className="w-3 h-3 rounded-full bg-muted-foreground" />
                </div>
                <span className="text-sm font-medium text-foreground">{t.noIcon}</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {filteredIcons.map(icon => (
                <button
                  key={icon.id}
                  onClick={() => handleSelect(icon.id)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all ${
                    value === icon.id 
                      ? 'bg-primary/10 ring-1 ring-primary' 
                      : 'hover:bg-secondary'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center overflow-hidden shadow-sm">
                    <WalletIconImg icon={icon} size={32} />
                  </div>
                  <span className="text-xs text-muted-foreground text-center truncate w-full">{getDisplaySlug(icon)}</span>
                </button>
              ))}
            </div>

            {filteredIcons.length === 0 && (
              <div className="text-center py-10 text-muted-foreground text-sm">
                {language === 'zh' ? '没有找到匹配的图标' : 'No matching icons found'}
              </div>
            )}
          </div>

          {selectedIcon && (
            <div className="px-5 pb-5 border-t border-border/30 pt-3">
              <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-xl">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center overflow-hidden shadow-sm">
                  <WalletIconImg icon={selectedIcon} size={32} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{getDisplayName(selectedIcon)}</div>
                  <div className="text-xs text-muted-foreground">
                    {selectedIcon.type === 'bank' ? t.banks : t.digitalWallets} • {getCountryName(selectedIcon.country, language)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <CountryPicker
        open={countryPickerOpen}
        value={countryFilter}
        onChange={setCountryFilter}
        onClose={() => setCountryPickerOpen(false)}
        language={language}
      />
    </>
  );
}
