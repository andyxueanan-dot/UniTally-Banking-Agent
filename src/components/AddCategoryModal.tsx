import { useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import ColorPicker from './ColorPicker';
import {
  Utensils, Car, ShoppingBag, Home, Gamepad2, HeartPulse, BookOpen, Sparkles, Smartphone, Shirt,
  Wine, Package, Plane, Music, Dog, Briefcase, Gift, CreditCard, Wrench, Coffee,
  Bike, Bus, Train, Fuel, Wifi, Tv, Camera, Umbrella, Dumbbell, Scissors,
  Baby, GraduationCap, Stethoscope, Pill, Apple, Cake, Pizza, IceCream, Salad, Egg,
  Leaf, Flower2, Trees, Mountain, Tent, Anchor, Fish, Bird, Cat, Rabbit,
  Palette, Paintbrush, PenTool, Laptop, Monitor, Printer, Headphones, Speaker, Watch, Gem
} from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (data: { name: string; icon: string; color: string }) => void;
}

const ICON_OPTIONS = [
  { icon: Utensils, name: 'Utensils', labelZh: '餐饮', labelEn: 'Dining' },
  { icon: Car, name: 'Car', labelZh: '汽车', labelEn: 'Car' },
  { icon: ShoppingBag, name: 'ShoppingBag', labelZh: '购物', labelEn: 'Shopping' },
  { icon: Home, name: 'Home', labelZh: '住房', labelEn: 'Housing' },
  { icon: Gamepad2, name: 'Gamepad2', labelZh: '游戏', labelEn: 'Gaming' },
  { icon: HeartPulse, name: 'HeartPulse', labelZh: '健康', labelEn: 'Health' },
  { icon: BookOpen, name: 'BookOpen', labelZh: '教育', labelEn: 'Education' },
  { icon: Sparkles, name: 'Sparkles', labelZh: '美容', labelEn: 'Beauty' },
  { icon: Smartphone, name: 'Smartphone', labelZh: '手机', labelEn: 'Phone' },
  { icon: Shirt, name: 'Shirt', labelZh: '服饰', labelEn: 'Clothing' },
  { icon: Wine, name: 'Wine', labelZh: '酒水', labelEn: 'Drinks' },
  { icon: Package, name: 'Package', labelZh: '快递', labelEn: 'Delivery' },
  { icon: Plane, name: 'Plane', labelZh: '旅行', labelEn: 'Travel' },
  { icon: Music, name: 'Music', labelZh: '音乐', labelEn: 'Music' },
  { icon: Dog, name: 'Dog', labelZh: '宠物', labelEn: 'Pet' },
  { icon: Briefcase, name: 'Briefcase', labelZh: '商务', labelEn: 'Business' },
  { icon: Gift, name: 'Gift', labelZh: '礼物', labelEn: 'Gift' },
  { icon: CreditCard, name: 'CreditCard', labelZh: '支付', labelEn: 'Payment' },
  { icon: Wrench, name: 'Wrench', labelZh: '维修', labelEn: 'Repair' },
  { icon: Coffee, name: 'Coffee', labelZh: '咖啡', labelEn: 'Coffee' },
  { icon: Bike, name: 'Bike', labelZh: '自行车', labelEn: 'Bike' },
  { icon: Bus, name: 'Bus', labelZh: '公交', labelEn: 'Bus' },
  { icon: Train, name: 'Train', labelZh: '火车', labelEn: 'Train' },
  { icon: Fuel, name: 'Fuel', labelZh: '加油', labelEn: 'Fuel' },
  { icon: Wifi, name: 'Wifi', labelZh: '网络', labelEn: 'Internet' },
  { icon: Tv, name: 'Tv', labelZh: '电视', labelEn: 'TV' },
  { icon: Camera, name: 'Camera', labelZh: '摄影', labelEn: 'Camera' },
  { icon: Umbrella, name: 'Umbrella', labelZh: '雨伞', labelEn: 'Umbrella' },
  { icon: Dumbbell, name: 'Dumbbell', labelZh: '健身', labelEn: 'Fitness' },
  { icon: Scissors, name: 'Scissors', labelZh: '理发', labelEn: 'Haircut' },
  { icon: Baby, name: 'Baby', labelZh: '母婴', labelEn: 'Baby' },
  { icon: GraduationCap, name: 'GraduationCap', labelZh: '学业', labelEn: 'Study' },
  { icon: Stethoscope, name: 'Stethoscope', labelZh: '医疗', labelEn: 'Medical' },
  { icon: Pill, name: 'Pill', labelZh: '药品', labelEn: 'Medicine' },
  { icon: Apple, name: 'Apple', labelZh: '水果', labelEn: 'Fruit' },
  { icon: Cake, name: 'Cake', labelZh: '蛋糕', labelEn: 'Cake' },
  { icon: Pizza, name: 'Pizza', labelZh: '外卖', labelEn: 'Takeout' },
  { icon: IceCream, name: 'IceCream', labelZh: '甜品', labelEn: 'Dessert' },
  { icon: Salad, name: 'Salad', labelZh: '沙拉', labelEn: 'Salad' },
  { icon: Egg, name: 'Egg', labelZh: '食材', labelEn: 'Ingredients' },
  { icon: Leaf, name: 'Leaf', labelZh: '绿植', labelEn: 'Plants' },
  { icon: Flower2, name: 'Flower2', labelZh: '鲜花', labelEn: 'Flowers' },
  { icon: Trees, name: 'Trees', labelZh: '户外', labelEn: 'Outdoor' },
  { icon: Mountain, name: 'Mountain', labelZh: '登山', labelEn: 'Hiking' },
  { icon: Tent, name: 'Tent', labelZh: '露营', labelEn: 'Camping' },
  { icon: Anchor, name: 'Anchor', labelZh: '航海', labelEn: 'Sailing' },
  { icon: Fish, name: 'Fish', labelZh: '钓鱼', labelEn: 'Fishing' },
  { icon: Bird, name: 'Bird', labelZh: '鸟类', labelEn: 'Bird' },
  { icon: Cat, name: 'Cat', labelZh: '猫咪', labelEn: 'Cat' },
  { icon: Rabbit, name: 'Rabbit', labelZh: '兔子', labelEn: 'Rabbit' },
  { icon: Palette, name: 'Palette', labelZh: '画板', labelEn: 'Palette' },
  { icon: Paintbrush, name: 'Paintbrush', labelZh: '绘画', labelEn: 'Painting' },
  { icon: PenTool, name: 'PenTool', labelZh: '设计', labelEn: 'Design' },
  { icon: Laptop, name: 'Laptop', labelZh: '电脑', labelEn: 'Laptop' },
  { icon: Monitor, name: 'Monitor', labelZh: '显示器', labelEn: 'Monitor' },
  { icon: Printer, name: 'Printer', labelZh: '打印', labelEn: 'Printer' },
  { icon: Headphones, name: 'Headphones', labelZh: '耳机', labelEn: 'Headphones' },
  { icon: Speaker, name: 'Speaker', labelZh: '音响', labelEn: 'Speaker' },
  { icon: Watch, name: 'Watch', labelZh: '手表', labelEn: 'Watch' },
  { icon: Gem, name: 'Gem', labelZh: '珠宝', labelEn: 'Jewelry' },
];

export default function AddCategoryModal({ open, onClose, onAdd }: Props) {
  const { language } = useApp();
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('Utensils');
  const [color, setColor] = useState('#3b82f6');

  if (!open) return null;

  const handleSubmit = () => {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), icon: selectedIcon, color });
    setName('');
    setSelectedIcon('Utensils');
    setColor('#3b82f6');
  };

  const SelectedIconComponent = ICON_OPTIONS.find(i => i.name === selectedIcon)?.icon || Package;

  const labels = {
    title: language === 'zh' ? '新建分类' : 'Add Category',
    nameLabel: language === 'zh' ? '分类名称' : 'Category Name',
    namePlaceholder: language === 'zh' ? '输入分类名称' : 'Enter category name',
    iconLabel: language === 'zh' ? '选择图标' : 'Select Icon',
    colorLabel: language === 'zh' ? '选择颜色' : 'Select Color',
    submit: language === 'zh' ? '创建分类' : 'Create Category',
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm" />
      <div
        className="relative w-full sm:max-w-md max-h-[90vh] overflow-auto glass-card rounded-t-3xl sm:rounded-3xl modal-content"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-foreground">{labels.title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-secondary transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex items-center justify-center mb-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: color + '20' }}>
            <SelectedIconComponent className="w-8 h-8" style={{ color }} />
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

        <div className="mb-4">
          <label className="text-xs text-muted-foreground mb-2 block">{labels.iconLabel}</label>
          <div className="grid grid-cols-8 gap-1.5 max-h-[180px] overflow-auto">
            {ICON_OPTIONS.map(({ icon: Icon, name: iconName, labelZh, labelEn }) => (
              <button
                key={iconName}
                onClick={() => setSelectedIcon(iconName)}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                  selectedIcon === iconName
                    ? 'ring-2 ring-primary bg-primary/10'
                    : 'bg-secondary hover:bg-muted'
                }`}
                title={language === 'zh' ? labelZh : labelEn}
              >
                <Icon className="w-4.5 h-4.5" style={{ color: selectedIcon === iconName ? color : undefined }} />
              </button>
            ))}
          </div>
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

export { ICON_OPTIONS };
