import { Crown, Lock } from 'lucide-react';
import { useSubscription } from '@/contexts/SubscriptionContext';

interface Props {
  feature?: string;
  showLock?: boolean;
  className?: string;
}

export default function PremiumBadge({ feature, showLock = false, className = '' }: Props) {
  const { isPremium, showUpgradeModal } = useSubscription();

  if (isPremium) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        showUpgradeModal();
      }}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity ${className}`}
    >
      {showLock ? (
        <Lock className="w-3 h-3" />
      ) : (
        <Crown className="w-3 h-3" />
      )}
      <span>Premium</span>
    </button>
  );
}
