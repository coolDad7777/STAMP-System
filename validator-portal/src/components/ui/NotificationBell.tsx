import React, { useState } from 'react';
import { BellIcon } from '@heroicons/react/outline';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error';
  timestamp: string;
  read: boolean;
}

const mockNotifications: Notification[] = [
  {
    id: '1',
    title: 'New verification pending',
    message: 'Participant J.Smith has submitted attendance stamp for review',
    type: 'info',
    timestamp: '5 minutes ago',
    read: false,
  },
  {
    id: '2',
    title: 'Compliance alert',
    message: 'Participant M.Johnson has missed 2 consecutive meetings',
    type: 'warning',
    timestamp: '1 hour ago',
    read: false,
  },
  {
    id: '3',
    title: 'System maintenance',
    message: 'Scheduled maintenance completed successfully',
    type: 'info',
    timestamp: '2 hours ago',
    read: true,
  },
];

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications] = useState<Notification[]>(mockNotifications);
  
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors relative"
      >
        <BellIcon className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-danger-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Overlay */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <p className="text-sm text-gray-500">
                  {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  No notifications
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 hover:bg-gray-50 transition-colors ${
                        !notification.read ? 'bg-brand-50' : ''
                      }`}
                    >
                      <div className="flex items-start">
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${
                            !notification.read ? 'text-gray-900' : 'text-gray-700'
                          }`}>
                            {notification.title}
                          </p>
                          <p className="text-sm text-gray-600 mt-1">
                            {notification.message}
                          </p>
                          <p className="text-xs text-gray-500 mt-2">
                            {notification.timestamp}
                          </p>
                        </div>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-brand-600 rounded-full ml-2 mt-1"></div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-3 border-t border-gray-200">
              <button className="text-sm text-brand-600 hover:text-brand-700 font-medium">
                View all notifications
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}