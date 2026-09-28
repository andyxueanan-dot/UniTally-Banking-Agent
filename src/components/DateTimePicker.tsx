import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Check } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';

interface Props {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;

function padZero(n: number): string {
  return n.toString().padStart(2, '0');
}

function getHours(): number[] {
  return Array.from({ length: 24 }, (_, i) => i);
}

function getMinutes(): number[] {
  return Array.from({ length: 60 }, (_, i) => i);
}

interface WheelPickerProps {
  items: number[];
  value: number;
  onChange: (value: number) => void;
  formatter?: (value: number) => string;
  label?: string;
}

function WheelPicker({ items, value, onChange, formatter, label }: WheelPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startValue = useRef(0);
  const velocity = useRef(0);
  const lastY = useRef(0);
  const lastTime = useRef(0);
  const animationRef = useRef<number>();

  const formatValue = formatter || ((v: number) => padZero(v));

  const getIndex = useCallback(() => {
    const idx = items.indexOf(value);
    return idx >= 0 ? idx : 0;
  }, [items, value]);

  const scrollToIndex = useCallback((index: number, animated: boolean = true) => {
    if (!containerRef.current) return;
    
    const clampedIndex = Math.max(0, Math.min(index, items.length - 1));
    const offset = clampedIndex * ITEM_HEIGHT;
    
    if (animated) {
      containerRef.current.style.transition = 'transform 0.3s cubic-bezier(0.23, 1, 0.32, 1)';
    } else {
      containerRef.current.style.transition = 'none';
    }
    
    containerRef.current.style.transform = `translateY(${-offset}px)`;
    
    if (items[clampedIndex] !== value) {
      onChange(items[clampedIndex]);
    }
  }, [items, value, onChange]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    isDragging.current = true;
    startY.current = e.touches[0].clientY;
    startValue.current = getIndex();
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
    const newIndex = startValue.current + deltaIndex;
    
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
    
    targetIndex = Math.max(0, Math.min(targetIndex, items.length - 1));
    scrollToIndex(targetIndex);
  }, [items.length, scrollToIndex]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    const currentIndex = getIndex();
    const newIndex = Math.max(0, Math.min(currentIndex + delta, items.length - 1));
    scrollToIndex(newIndex);
  }, [getIndex, items.length, scrollToIndex]);

  useEffect(() => {
    scrollToIndex(getIndex(), false);
  }, []);

  return (
    <div className="flex flex-col items-center">
      {label && (
        <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">{label}</div>
      )}
      <div 
        className="relative overflow-hidden select-none"
        style={{ height: ITEM_HEIGHT * VISIBLE_ITEMS }}
      >
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
          {items.map((item, index) => {
            const isSelected = item === value;
            return (
              <div
                key={index}
                className={`flex items-center justify-center transition-all duration-150 ${
                  isSelected ? 'text-foreground font-semibold text-base' : 'text-muted-foreground text-sm'
                }`}
                style={{ height: ITEM_HEIGHT }}
                onClick={() => scrollToIndex(index)}
              >
                {formatValue(item)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function DateTimePicker({ open, value, onChange, onClose }: Props) {
  const { t, language } = useApp();
  const [tempDate, setTempDate] = useState(() => {
    const d = value ? new Date(value) : new Date();
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      hour: d.getHours(),
      minute: d.getMinutes(),
    };
  });

  useEffect(() => {
    if (open) {
      const d = value ? new Date(value) : new Date();
      setTempDate({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate(),
        hour: d.getHours(),
        minute: d.getMinutes(),
      });
    }
  }, [open, value]);

  const handleConfirm = () => {
    const dateStr = `${tempDate.year}-${padZero(tempDate.month)}-${padZero(tempDate.day)}T${padZero(tempDate.hour)}:${padZero(tempDate.minute)}`;
    onChange(dateStr);
    onClose();
  };

  if (!open) return null;

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm modal-overlay" />
      <div
        className="relative w-full sm:max-w-md glass-card rounded-t-3xl sm:rounded-3xl modal-content overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <h3 className="text-base font-semibold text-foreground">{t.transaction.time}</h3>
          <button
            onClick={handleConfirm}
            className="text-primary hover:text-primary/80 transition-colors"
          >
            <Check className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-6">
          {isMobile ? (
            <>
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{language === 'zh' ? '年' : 'Year'}</label>
                  <input
                    type="number"
                    value={tempDate.year}
                    onChange={(e) => setTempDate(prev => ({ ...prev, year: parseInt(e.target.value) || new Date().getFullYear() }))}
                    className="w-full bg-secondary text-foreground rounded-xl px-3 py-3 text-center text-lg font-medium outline-none border-none"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{language === 'zh' ? '月' : 'Month'}</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={tempDate.month}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (val >= 1 && val <= 12) {
                        setTempDate(prev => ({ ...prev, month: val }));
                      }
                    }}
                    className="w-full bg-secondary text-foreground rounded-xl px-3 py-3 text-center text-lg font-medium outline-none border-none"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{language === 'zh' ? '日' : 'Day'}</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={tempDate.day}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (val >= 1 && val <= 31) {
                        setTempDate(prev => ({ ...prev, day: val }));
                      }
                    }}
                    className="w-full bg-secondary text-foreground rounded-xl px-3 py-3 text-center text-lg font-medium outline-none border-none"
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div className="flex gap-4 justify-center">
                <div className="w-24">
                  <WheelPicker
                    items={getHours()}
                    value={tempDate.hour}
                    onChange={(hour) => setTempDate(prev => ({ ...prev, hour }))}
                    label={language === 'zh' ? '时' : 'Hour'}
                  />
                </div>
                <div className="flex items-center justify-center text-2xl font-light text-muted-foreground pt-6">
                  :
                </div>
                <div className="w-24">
                  <WheelPicker
                    items={getMinutes()}
                    value={tempDate.minute}
                    onChange={(minute) => setTempDate(prev => ({ ...prev, minute }))}
                    label={language === 'zh' ? '分' : 'Min'}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2 mb-6">
                <div className="flex-1">
                  <WheelPicker
                    items={Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 5 + i)}
                    value={tempDate.year}
                    onChange={(year) => setTempDate(prev => ({ ...prev, year }))}
                    formatter={(y) => y.toString()}
                    label={language === 'zh' ? '年' : 'Year'}
                  />
                </div>
                <div className="flex-1">
                  <WheelPicker
                    items={Array.from({ length: 12 }, (_, i) => i + 1)}
                    value={tempDate.month}
                    onChange={(month) => setTempDate(prev => ({ ...prev, month }))}
                    formatter={(m) => `${m}${language === 'zh' ? '月' : ''}`}
                    label={language === 'zh' ? '月' : 'Mon'}
                  />
                </div>
                <div className="flex-1">
                  <WheelPicker
                    items={Array.from({ length: 31 }, (_, i) => i + 1)}
                    value={tempDate.day}
                    onChange={(day) => setTempDate(prev => ({ ...prev, day }))}
                    formatter={(d) => `${d}${language === 'zh' ? '日' : ''}`}
                    label={language === 'zh' ? '日' : 'Day'}
                  />
                </div>
              </div>

              <div className="flex gap-4 justify-center">
                <div className="w-24">
                  <WheelPicker
                    items={getHours()}
                    value={tempDate.hour}
                    onChange={(hour) => setTempDate(prev => ({ ...prev, hour }))}
                    label={language === 'zh' ? '时' : 'Hour'}
                  />
                </div>
                <div className="flex items-center justify-center text-2xl font-light text-muted-foreground pt-6">
                  :
                </div>
                <div className="w-24">
                  <WheelPicker
                    items={getMinutes()}
                    value={tempDate.minute}
                    onChange={(minute) => setTempDate(prev => ({ ...prev, minute }))}
                    label={language === 'zh' ? '分' : 'Min'}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="safe-area-bottom" />
      </div>
    </div>
  );
}
