import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle2 } from 'lucide-react';
import { InAppNotification } from '../types';
import {
  getInAppNotifications,
  markInAppNotificationAsRead,
  markAllInAppNotificationsAsRead,
  subscribeToInAppNotifications
} from '../lib/userService';

interface NotificationBellProps {
  recipientEmail: string;
  onOpenNotification?: (notification: InAppNotification) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ recipientEmail, onOpenNotification }) => {
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const notificationRef = React.useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      setNotifications(await getInAppNotifications(recipientEmail, true));
    } catch (error) {
      console.warn('Failed to fetch admin notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return subscribeToInAppNotifications(recipientEmail, setNotifications, (error) => {
      console.warn('Admin notification listener error:', error);
    });
  }, [recipientEmail]);

  useEffect(() => {
    if (!showDropdown) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showDropdown]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  );

  const markAsRead = async (id: string) => {
    try {
      await markInAppNotificationAsRead(id);
      setNotifications((current) => current.map((notification) =>
        notification.id === id ? { ...notification, read: true } : notification
      ));
    } catch (error) {
      console.warn('Failed to mark admin notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await markAllInAppNotificationsAsRead(notifications);
      setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
    } catch (error) {
      console.warn('Failed to mark admin notifications as read:', error);
    }
  };

  return (
    <div ref={notificationRef} className="relative">
      <button
        type="button"
        onClick={() => setShowDropdown((current) => !current)}
        className="relative p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-slate-200 transition-all"
        title="View In-App Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-600 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white">
            {unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 z-[60] overflow-hidden">
          <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
            <span className="font-extrabold text-xs">In-App Notifications</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-blue-600 px-2 py-0.5 rounded-full font-bold">{unreadCount} Unread</span>
              {unreadCount > 0 && (
                <button type="button" onClick={markAllAsRead} className="text-[10px] font-bold text-blue-200 hover:text-white">
                  Mark all read
                </button>
              )}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="p-4 text-center text-xs text-slate-400">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 space-y-1">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                <p className="font-bold text-slate-600">All caught up!</p>
                <p>No new notifications at this time.</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  type="button"
                  key={notification.id}
                  onClick={async () => {
                    await markAsRead(notification.id);
                    onOpenNotification?.(notification);
                  }}
                  className={`w-full text-left p-3 text-xs transition-colors ${
                    notification.read ? 'bg-white hover:bg-slate-50' : 'bg-blue-50/70 hover:bg-blue-100/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-slate-900">
                      {!notification.read && <span className="inline-block w-2 h-2 rounded-full bg-blue-600 mr-1.5" />}
                      {notification.title}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {new Date(notification.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1 leading-normal">{notification.message}</p>
                  {notification.cardCode && (
                    <span className="inline-block mt-1 font-mono text-[9px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                      Pass {notification.cardCode}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
          <div className="p-2 bg-slate-50 border-t border-slate-200 text-center">
            <button type="button" onClick={fetchNotifications} className="text-[11px] font-bold text-blue-600 hover:text-blue-800">
              Refresh notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
