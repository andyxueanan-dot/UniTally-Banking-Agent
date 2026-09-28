import { useState, useRef, useEffect } from 'react';
import { Palette } from 'lucide-react';

const DEFAULT_COLORS = [
  '#f97316', '#3b82f6', '#ec4899', '#8b5cf6', '#06b6d4',
  '#ef4444', '#14b8a6', '#a3e635', '#6366f1', '#f43f5e',
  '#fbbf24', '#78716c', '#1677ff', '#07c160', '#0ea5e9',
  '#d946ef', '#f59e0b', '#10b981', '#64748b',
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}

export default function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customColor, setCustomColor] = useState(value);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showCustomPicker) {
      setCustomColor(value);
    }
  }, [showCustomPicker, value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowCustomPicker(false);
      }
    };
    if (showCustomPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCustomPicker]);

  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomColor(e.target.value);
    onChange(e.target.value);
  };

  return (
    <div>
      {label && <label className="text-xs text-muted-foreground mb-2 block">{label}</label>}
      <div className="flex flex-wrap gap-2">
        {DEFAULT_COLORS.map(c => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={`w-8 h-8 rounded-full transition-all ${
              value === c ? 'ring-2 ring-offset-2 ring-primary scale-110' : 'hover:scale-105'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
        <button
          onClick={() => setShowCustomPicker(!showCustomPicker)}
          className={`w-8 h-8 rounded-full transition-all flex items-center justify-center bg-secondary border-2 ${
            showCustomPicker ? 'ring-2 ring-offset-2 ring-primary' : 'hover:scale-105'
          } ${!DEFAULT_COLORS.includes(value) && value ? 'border-primary' : 'border-border'}`}
        >
          <Palette className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {showCustomPicker && (
        <div 
          ref={pickerRef}
          className="fixed inset-x-4 bottom-4 sm:absolute sm:inset-auto sm:mt-2 sm:left-0 z-50 glass-card rounded-2xl p-4"
        >
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-2 block">
                {typeof window !== 'undefined' && window.innerWidth < 640 ? '选择自定义颜色' : 'Custom Color'}
              </label>
              <input
                type="color"
                value={customColor}
                onChange={handleCustomColorChange}
                className="w-full h-12 sm:h-10 rounded-xl cursor-pointer border-0 bg-transparent"
              />
            </div>
            <div 
              className="w-12 h-12 sm:w-10 sm:h-10 rounded-xl border-2 border-border"
              style={{ backgroundColor: customColor }}
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setShowCustomPicker(false)}
              className="flex-1 py-2 rounded-xl bg-secondary text-muted-foreground text-sm"
            >
              完成
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
