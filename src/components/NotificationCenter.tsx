import { useState, useMemo, createContext, useContext, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Bell, X, AlertTriangle, Calendar, CreditCard, Trash2 } from 'lucide-react';
import type { Notification } from '@/types';

interface NotificationManagerType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  deleteNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationManagerContext = createContext<NotificationManagerType | null>(null);

export function useNotificationManager() {
  const context = useContext(NotificationManagerContext);
  if (!context) {
    throw new Error('useNotificationManager must be used within NotificationProvider');
  }
  return context;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { budgets, subscriptions, transactions, language, wallets } = useApp();
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const generatedNotifications = useMemo(() => {
    const notifications: Notification[] = [];
    const today = new Date().toISOString().split('T')[0];
    const currentDay = new Date().getDate();

    budgets.forEach(budget => {
      if (!budget.notifyEnabled) return;

      const budgetTransactions = transactions.filter(tx => {
        if (tx.type !== 'expense') return false;
        if (budget.category !== 'all_expenses' && tx.category !== budget.category) return false;
        const txDate = tx.datetime.split('T')[0];
        return txDate >= budget.startDate && txDate <= (budget.endDate || budget.startDate);
      });

      const totalSpent = budgetTransactions.reduce((sum, tx) => sum + tx.amount, 0);
      
      if (totalSpent > budget.amount) {
        notifications.push({
          id: `budget_over_${budget.id}`,
          type: 'budget_over',
          title: language === 'zh' ? '预算超支提醒' : 'Budget Over Alert',
          message: language === 'zh' 
            ? `预算「${budget.name}」已超支 ¥${(totalSpent - budget.amount).toFixed(2)}`
            : `Budget "${budget.name}" is over by ¥${(totalSpent - budget.amount).toFixed(2)}`,
          relatedId: budget.id,
          createdAt: Date.now(),
          isRead: false,
        });
      }

      if (budget.endDate) {
        const daysUntilEnd = Math.ceil((new Date(budget.endDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24));
        const notifyDays = budget.notifyDaysBefore || 3;
        
        if (daysUntilEnd <= notifyDays && daysUntilEnd >= 0) {
          notifications.push({
            id: `budget_expire_${budget.id}`,
            type: 'budget_expire',
            title: language === 'zh' ? '预算到期提醒' : 'Budget Expiring',
            message: language === 'zh'
              ? `预算「${budget.name}」将在 ${daysUntilEnd} 天后到期`
              : `Budget "${budget.name}" will expire in ${daysUntilEnd} days`,
            relatedId: budget.id,
            createdAt: Date.now(),
            isRead: false,
          });
        }
      }
    });

    subscriptions.forEach(sub => {
      if (!sub.notifyEnabled) return;

      const daysUntilEnd = Math.ceil((new Date(sub.endDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24));
      const notifyDays = sub.notifyDaysBefore || 3;
      
      if (daysUntilEnd <= notifyDays && daysUntilEnd >= 0) {
        notifications.push({
          id: `subscription_expire_${sub.id}`,
          type: 'subscription_expire',
          title: language === 'zh' ? '订阅到期提醒' : 'Subscription Expiring',
          message: language === 'zh'
            ? `订阅「${sub.name}」将在 ${daysUntilEnd} 天后到期`
            : `Subscription "${sub.name}" will expire in ${daysUntilEnd} days`,
          relatedId: sub.id,
          createdAt: Date.now(),
          isRead: false,
        });
      }
    });

    wallets.filter(w => w.type === 'credit' && w.dueDay && w.remindDays).forEach(wallet => {
      const dueDay = wallet.dueDay!;
      const remindDays = wallet.remindDays!;
      
      const daysUntilDue = dueDay - currentDay;
      if (daysUntilDue < 0) {
        const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
        const daysUntilDueNextMonth = daysInMonth - currentDay + dueDay;
        if (daysUntilDueNextMonth <= remindDays && daysUntilDueNextMonth >= 0) {
          notifications.push({
            id: `credit_due_${wallet.id}`,
            type: 'credit_due',
            title: language === 'zh' ? '信用卡还款提醒' : 'Credit Card Due Reminder',
            message: language === 'zh'
              ? `信用卡「${wallet.name}」将在 ${daysUntilDueNextMonth} 天后到期还款`
              : `Credit card "${wallet.name}" payment due in ${daysUntilDueNextMonth} days`,
            relatedId: wallet.id,
            createdAt: Date.now(),
            isRead: false,
          });
        }
      } else if (daysUntilDue <= remindDays && daysUntilDue >= 0) {
        notifications.push({
          id: `credit_due_${wallet.id}`,
          type: 'credit_due',
          title: language === 'zh' ? '信用卡还款提醒' : 'Credit Card Due Reminder',
          message: language === 'zh'
            ? `信用卡「${wallet.name}」将在 ${daysUntilDue} 天后到期还款`
            : `Credit card "${wallet.name}" payment due in ${daysUntilDue} days`,
          relatedId: wallet.id,
          createdAt: Date.now(),
          isRead: false,
        });
      }
    });

    return notifications;
  }, [budgets, subscriptions, transactions, language, wallets]);

  const notifications = useMemo(() => {
    return generatedNotifications
      .filter(n => !deletedIds.has(n.id))
      .map(n => ({
        ...n,
        isRead: readIds.has(n.id),
      }));
  }, [generatedNotifications, readIds, deletedIds]);

  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.isRead).length;
  }, [notifications]);

  const markAsRead = useCallback((id: string) => {
    setReadIds(prev => new Set([...prev, id]));
  }, []);

  const deleteNotification = useCallback((id: string) => {
    setDeletedIds(prev => new Set([...prev, id]));
  }, []);

  const clearAll = useCallback(() => {
    setDeletedIds(new Set(generatedNotifications.map(n => n.id)));
  }, [generatedNotifications]);

  return (
    <NotificationManagerContext.Provider value={{
      notifications,
      unreadCount,
      markAsRead,
      deleteNotification,
      clearAll,
    }}>
      {children}
    </NotificationManagerContext.Provider>
  );
}

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
}

export default function NotificationCenter({ open, onClose }: NotificationCenterProps) {
  const { language } = useApp();
  const { notifications, unreadCount, markAsRead, deleteNotification, clearAll } = useNotificationManager();

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'budget_over':
        return <AlertTriangle className="w-5 h-5 text-expense" />;
      case 'budget_expire':
        return <Calendar className="w-5 h-5 text-orange-500" />;
      case 'subscription_expire':
        return <CreditCard className="w-5 h-5 text-primary" />;
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm max-h-[70vh] overflow-hidden glass-card rounded-2xl modal-content"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border/30">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-foreground" />
            <h3 className="text-lg font-semibold text-foreground">
              {language === 'zh' ? '消息中心' : 'Notifications'}
            </h3>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-expense text-white rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {language === 'zh' ? '清空' : 'Clear'}
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[calc(70vh-60px)]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">{language === 'zh' ? '暂无消息' : 'No notifications'}</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {notifications.map(notification => (
                <div
                  key={notification.id}
                  className={`p-4 transition-colors cursor-pointer ${
                    notification.isRead ? 'bg-background/50' : 'bg-primary/5'
                  }`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className={`text-sm font-medium ${
                          notification.isRead ? 'text-muted-foreground' : 'text-foreground'
                        }`}>
                          {notification.title}
                        </h4>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification(notification.id);
                          }}
                          className="p-1 rounded hover:bg-secondary transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </div>
                      <p className={`text-xs ${
                        notification.isRead ? 'text-muted-foreground/70' : 'text-muted-foreground'
                      }`}>
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground/50 mt-1">
                        {new Date(notification.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}
                      </p>
                    </div>
                    {!notification.isRead && (
                      <div className="w-2 h-2 rounded-full bg-expense flex-shrink-0 mt-2" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function NotificationBadge({ count }: { count: number }) {
  if (count === 0) return null;
  
  return (
    <div className="absolute -top-1 -right-1 w-4 h-4 bg-expense rounded-full flex items-center justify-center">
      <span className="text-[10px] font-medium text-white">
        {count > 9 ? '9+' : count}
      </span>
    </div>
  );
}
