import { useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import ColorPicker from './ColorPicker';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (data: { name: string; color: string }) => void;
}

export default function AddPlatformModal({ open, onClose, onAdd }: Props) {
  const { language } = useApp();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3b82f6');

  if (!open) return null;

  const handleSubmit = () => {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), color });
    setName('');
    setColor('#3b82f6');
  };

  const labels = {
    title: language === 'zh' ? '添加平台' : 'Add Platform',
    nameLabel: language === 'zh' ? '平台名称' : 'Platform Name',
    namePlaceholder: language === 'zh' ? '输入平台名称' : 'Enter platform name',
    colorLabel: language === 'zh' ? '选择颜色' : 'Select Color',
    submit: language === 'zh' ? '添加平台' : 'Add Platform',
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm" />
      <div
        className="relative w-full sm:max-w-sm max-h-[90vh] overflow-auto glass-card rounded-t-3xl sm:rounded-3xl modal-content"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-foreground">{labels.title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-secondary transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex items-center justify-center mb-5">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: color + '20' }}>
            <div className="w-6 h-6 rounded-full" style={{ backgroundColor: color }} />
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs text-muted-foreground mb-1 block">{labels.nameLabel}</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={labels.namePlaceholder}
            className="w-full bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
        </div>

        <div className="mb-6">
          <ColorPicker value={color} onChange={setColor} label={labels.colorLabel} />
        </div>

        <button
          onClick={handleSubmit}
          className="w-full gradient-primary text-primary-foreground py-3 rounded-2xl font-semibold accent-glow transition-all duration-200 hover:opacity-90"
        >
          {labels.submit}
        </button>
      </div>
    </div>
  );
}
