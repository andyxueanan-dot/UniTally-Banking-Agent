import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Check } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';

interface Option {
  id: string;
  name: string;
  icon?: string;
  color?: string;
}

interface OptionGroup {
  label: string;
  options: Option[];
}

interface Props {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  options: Option[] | OptionGroup[];
  title?: string;
  grouped?: boolean;
}

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;

function WheelPicker({ 
  options, 
  value, 
  onChange, 
  label 
}: { 
  options: Option[]; 
  value: string; 
  onChange: (value: string) => void;
  label?: string;
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
          {options.map((option, index) => {
            const isSelected = option.id === value;
            return (
              <div
                key={option.id}
                className={`flex items-center justify-center gap-2 transition-all duration-150 ${
                  isSelected ? 'text-foreground font-semibold text-base' : 'text-muted-foreground text-sm'
                }`}
                style={{ height: ITEM_HEIGHT }}
                onClick={() => scrollToIndex(index)}
              >
                {option.icon && (
                  <span className="text-lg">{option.icon}</span>
                )}
                {option.color && !option.icon && (
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: option.color }}
                  />
                )}
                <span>{option.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function OptionPicker({ open, value, onChange, onClose, options, title, grouped }: Props) {
  const { language } = useApp();
  const [tempValue, setTempValue] = useState(value);

  useEffect(() => {
    if (open) {
      setTempValue(value);
    }
  }, [open, value]);

  const handleConfirm = () => {
    onChange(tempValue);
    onClose();
  };

  const isGrouped = grouped || (options.length > 0 && 'options' in options[0] && !('id' in options[0]));

  const flatOptions: Option[] = isGrouped
    ? (options as OptionGroup[]).flatMap(g => g.options)
    : (options as Option[]);

  if (!open) return null;

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

  const renderOption = (option: Option) => (
    <button
      key={option.id}
      onClick={() => setTempValue(option.id)}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
        tempValue === option.id 
          ? 'bg-primary text-primary-foreground' 
          : 'bg-secondary text-foreground hover:bg-muted'
      }`}
    >
      {option.icon && (
        <span className="text-lg">{option.icon}</span>
      )}
      {option.color && !option.icon && (
        <div 
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: option.color }}
        />
      )}
      <span className="text-sm font-medium">{option.name}</span>
    </button>
  );

  const renderGroupedOptions = () => (
    <div className="space-y-4 max-h-[300px] overflow-y-auto">
      {(options as OptionGroup[]).map((group, idx) => (
        <div key={idx}>
          <div className="text-xs text-muted-foreground px-4 mb-2 font-medium">
            {group.label}
          </div>
          <div className="space-y-2">
            {group.options.map(option => renderOption(option))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" onClick={onClose}>
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
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <button
            onClick={handleConfirm}
            className="text-primary hover:text-primary/80 transition-colors"
          >
            <Check className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-6">
          {isMobile ? (
            isGrouped ? (
              renderGroupedOptions()
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {(options as Option[]).map(option => renderOption(option))}
              </div>
            )
          ) : (
            <WheelPicker
              options={flatOptions}
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
