import { type LucideIcon } from 'lucide-react';
import { ICON_OPTIONS } from '@/components/AddCategoryModal';

interface Props {
  icon: string;
  color?: string;
  className?: string;
  size?: number;
}

// Check if a string is an emoji (not a lucide icon name)
function isEmoji(str: string): boolean {
  // Lucide icon names are PascalCase ASCII strings
  return !/^[A-Z][a-zA-Z0-9]+$/.test(str);
}

export default function CategoryIcon({ icon, color, className = '', size = 20 }: Props) {
  if (isEmoji(icon)) {
    // Render as emoji text
    return <span className={className} style={{ fontSize: size }}>{icon}</span>;
  }

  // Find the lucide icon component
  const found = ICON_OPTIONS.find(i => i.name === icon);
  if (found) {
    const Icon = found.icon;
    return <Icon className={className} style={{ color, width: size, height: size }} />;
  }

  // Fallback
  return <span className={className} style={{ fontSize: size }}>{icon}</span>;
}
