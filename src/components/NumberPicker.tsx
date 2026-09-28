import { useState, useRef, useCallback } from 'react';
import { X, Check } from 'lucide-react';

interface Props {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  language: 'zh' | 'en';
  title?: string;
  suffix?: string;
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
    velocity.current = 0;
    lastY.current = e.touches[0].clientY;
    lastTime.current = Date.now();
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }, [getIndex]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    
    const currentY = e.touches[0].clientY;
    const deltaY = startY.current - currentY;
    const deltaIndex = Math.round(deltaY / ITEM_HEIGHT);
    
    velocity.current = (lastY.current - currentY) / (Date.now() - lastTime.current || 1);
    lastY.current = currentY;
    lastTime.current = Date.now();
    
    containerRef.current.style.transition = 'none';
    const currentIndex = startValue.current + deltaIndex;
    const offset = Math.max(0, Math.min(currentIndex, items.length - 1)) * ITEM_HEIGHT;
    containerRef.current.style.transform = `translateY(${-offset}px)`;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    
    const momentumIndex = Math.round(velocity.current * 100);
    let targetIndex = getIndex() + momentumIndex;
    targetIndex = Math.max(0, Math.min(targetIndex, items.length - 1));
    
    scrollToIndex(targetIndex);
  }, [getIndex, scrollToIndex]);

  return (
    <div className="relative h-[200px] overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-12 flex items-center justify-center pointer-events-none z-10">
        {label && <span className="text-xs text-muted-foreground">{label}</span>}
      </div>
      <div className="absolute inset-y-0 right-0 w-12 flex items-center justify-center pointer-events-none z-10">
        <span className="text-xs text-muted-foreground">{formatValue(value)}</span>
      </div>
      <div 
        className="absolute inset-x-12 top-1/2 -translate-y-1/2 h-[40px] border-t border-b border-primary/30 pointer-events-none z-10"
      />
      <div 
        className="absolute inset-0 touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div 
          ref={containerRef}
          className="transition-transform"
          style={{ transform: `translateY(${(VISIBLE_ITEMS - 1) / 2 * ITEM_HEIGHT}px)` }}
        >
          {items.map((item, index) => (
            <div
              key={item}
              className={`h-[40px] flex items-center justify-center text-lg ${
                item === value ? 'text-primary font-bold' : 'text-muted-foreground'
              }`}
              onClick={() => scrollToIndex(index)}
            >
              {formatValue(item)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function NumberPicker({ value, onChange, min, max, language, title, suffix }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  const items = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  const handleConfirm = () => {
    onChange(tempValue);
    setIsOpen(false);
  };

  return (
    <>
      <button
        onClick={() => {
          setTempValue(value);
          setIsOpen(true);
        }}
        className="bg-secondary text-foreground rounded-lg px-3 py-1.5 text-sm outline-none hover:bg-secondary/80 transition-colors flex items-center gap-1"
      >
        <span>{value}</span>
        {suffix && <span className="text-muted-foreground">{suffix}</span>}
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
                {title || (language === 'zh' ? '选择' : 'Select')}
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
                items={items}
                value={tempValue}
                onChange={setTempValue}
              />
            </div>

            <div className="safe-area-bottom" />
          </div>
        </div>
      )}
    </>
  );
}
