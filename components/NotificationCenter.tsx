import React from 'react';
import { AppNotification } from '../types';
import { InformationCircleIcon, ExclamationTriangleIcon, CheckCircleIcon, LightBulbIcon } from './icons';

interface NotificationCenterProps {
    notifications: AppNotification[];
    onMarkAsRead: (id: string) => void;
    onMarkAllAsRead: () => void;
    onClose: () => void;
}

const NotificationIcon: React.FC<{ type: AppNotification['type'] }> = ({ type }) => {
    switch (type) {
        case 'info':
            return <InformationCircleIcon className="h-6 w-6 text-blue-400" />;
        case 'warning':
            return <ExclamationTriangleIcon className="h-6 w-6 text-yellow-400" />;
        case 'success':
            return <CheckCircleIcon className="h-6 w-6 text-green-400" />;
        case 'suggestion':
            return <LightBulbIcon className="h-6 w-6 text-purple-400" />;
        default:
            return null;
    }
};

function formatRelativeTime(isoDateString: string): string {
    const date = new Date(isoDateString);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return "just nu";
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m sedan`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h sedan`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d sedan`;
    
    return date.toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' });
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ notifications, onMarkAsRead, onMarkAllAsRead, onClose }) => {
    
    const sortedNotifications = [...notifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return (
        <div
            className="absolute top-16 right-0 w-80 sm:w-96 bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 z-50 animate-fade-in"
            role="dialog"
            aria-modal="true"
        >
            <div className="p-4 flex justify-between items-center border-b border-slate-200 dark:border-slate-700">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">Notiser</h3>
                {notifications.some(n => !n.isRead) && (
                    <button onClick={onMarkAllAsRead} className="text-sm text-primary hover:underline">Markera alla som lästa</button>
                )}
            </div>
            <div className="max-h-96 overflow-y-auto">
                {sortedNotifications.length > 0 ? (
                    sortedNotifications.map(n => (
                        <div
                            key={n.id}
                            onClick={() => onMarkAsRead(n.id)}
                            className={`p-4 flex items-start gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700/50 ${!n.isRead ? 'bg-slate-100/50 dark:bg-slate-900/40' : ''}`}
                        >
                            <div className="flex-shrink-0 pt-1 relative">
                                <NotificationIcon type={n.type} />
                                {!n.isRead && <div className="absolute top-0 right-0 h-2 w-2 bg-primary rounded-full" />}
                            </div>
                            <div className="flex-grow">
                                <p className="font-semibold text-slate-800 dark:text-slate-200 leading-tight">{n.title}</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{n.message}</p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{formatRelativeTime(n.createdAt)}</p>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                        <p className="font-semibold">Inga nya notiser</p>
                        <p className="text-sm">Du är helt uppdaterad!</p>
                    </div>
                )}
            </div>
        </div>
    );
};