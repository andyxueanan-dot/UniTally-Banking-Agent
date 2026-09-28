import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Check } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';

interface Props {
  value: number;
  onChange: (value: number) => void;
  maxDays: number;
  language: 'zh' | 'en';
}

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;

function WheelPicker({ 
  items, 
  value, 
  onChange, 
  formatter, 
  label 
}: { 
  items: number[]; 
  value: number; 
  onChange: (value: number) => void;
  formatter?: (value: number) => string;
  label?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startValue = useRef(0);
  const velocity = useRef(0);
  const lastY = useRef(0);
  const lastTime = useRef(0);
  const animationRef = useRef<number>();

  const formatValue = formatter || ((v: number) => v.toString());

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

export default function DayPicker({ value, onChange, maxDays, language }: Props) {
  const { language: appLanguage } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  useEffect(() => {
    setTempValue(value);
  }, [value, isOpen]);

  const handleConfirm = () => {
    onChange(tempValue);
    setIsOpen(false);
  };

  if (maxDays < 1) {
    return (
      <div className="text-xs text-expense">
        {language === 'zh' ? '周期太短，无法设置提醒' : 'Period too short for reminder'}
      </div>
    );
  }

  const days = Array.from({ length: Math.max(1, maxDays) }, (_, i) => i + 1);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="bg-secondary text-foreground rounded-lg px-3 py-1.5 text-sm outline-none hover:bg-secondary/80 transition-colors flex items-center gap-1"
      >
        {value} {language === 'zh' ? '天' : 'days'}
        <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center" onClick={() => setIsOpen(false)}>
          <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm modal-overlay" />
          <div
            className="relative w-full sm:max-w-xs glass-card rounded-t-3xl sm:rounded-3xl modal-content overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
              <button
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-base font-semibold text-foreground">
                {language === 'zh' ? '选择天数' : 'Select Days'}
              </h3>
              <button
                onClick={handleConfirm}
                className="text-primary hover:text-primary/80 transition-colors"
              >
                <Check className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 py-6">
              <WheelPicker
                items={days}
                value={tempValue}
                onChange={setTempValue}
                formatter={(d) => `${d} ${language === 'zh' ? '天' : 'days'}`}
                label={language === 'zh' ? '提前天数' : 'Days Before'}
              />
            </div>

            <div className="safe-area-bottom" />
          </div>
        </div>
      )}
    </>
  );
}
