import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Organization, AppNotification, Page } from '../types';
import { listenToSystemAnnouncements, listenToUserNotifications, markUserNotificationAsRead, markAllUserNotificationsAsRead } from '../services/firebaseService';

export const useNotificationManager = (organization: Organization | null, page: Page | undefined) => {
    const { currentUser } = useAuth();
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [systemNotifications, setSystemNotifications] = useState<AppNotification[]>([]);
    const [userNotifications, setUserNotifications] = useState<AppNotification[]>([]);
    
    const READ_ANNOUNCEMENTS_KEY = `smart-skylt-read-announcements-${currentUser?.uid}`;

    // Listener for system announcements
    useEffect(() => {
        const readAnnouncementIds = new Set(JSON.parse(localStorage.getItem(READ_ANNOUNCEMENTS_KEY) || '[]'));
        const unsubscribe = listenToSystemAnnouncements(announcementsData => {
            const processed = announcementsData.map(ann => ({
                ...ann,
                isRead: readAnnouncementIds.has(ann.id.substring(4)),
            }));
            setSystemNotifications(processed);
        });
        return () => unsubscribe();
    }, [READ_ANNOUNCEMENTS_KEY]);

    // Listener for user notifications
    useEffect(() => {
        if (!currentUser) {
            setUserNotifications([]);
            return;
        }
        const unsubscribe = listenToUserNotifications(currentUser.uid, setUserNotifications);
        return () => unsubscribe();
    }, [currentUser]);

    // Merge notifications
    useEffect(() => {
        const all = [...systemNotifications, ...userNotifications]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setNotifications(all);
    }, [systemNotifications, userNotifications]);

    const markAsRead = useCallback(async (notificationId: string) => {
        if (!currentUser) return;

        if (notificationId.startsWith('sys-')) {
            const originalId = notificationId.substring(4);
            const readIds = new Set(JSON.parse(localStorage.getItem(READ_ANNOUNCEMENTS_KEY) || '[]'));
            readIds.add(originalId);
            localStorage.setItem(READ_ANNOUNCEMENTS_KEY, JSON.stringify(Array.from(readIds)));
            setSystemNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n));
        } else {
            // Firestore listener will update the state automatically after this write.
            await markUserNotificationAsRead(currentUser.uid, notificationId);
        }
    }, [currentUser, READ_ANNOUNCEMENTS_KEY]);

    const markAllAsRead = useCallback(async () => {
        if (!currentUser) return;
        
        // Mark all system notifications as read in localStorage
        const systemNotifIdsToMark = systemNotifications.filter(n => !n.isRead).map(n => n.id.substring(4));
        if (systemNotifIdsToMark.length > 0) {
            const readIds = new Set(JSON.parse(localStorage.getItem(READ_ANNOUNCEMENTS_KEY) || '[]'));
            systemNotifIdsToMark.forEach(id => readIds.add(id));
            localStorage.setItem(READ_ANNOUNCEMENTS_KEY, JSON.stringify(Array.from(readIds)));
            setSystemNotifications(prev => prev.map(n => ({...n, isRead: true})));
        }

        // Mark all user notifications as read in Firestore
        const userNotifIdsToMark = userNotifications.filter(n => !n.isRead).map(n => n.id);
        if (userNotifIdsToMark.length > 0) {
            await markAllUserNotificationsAsRead(currentUser.uid, userNotifIdsToMark);
            // Firestore listener will update the state automatically.
        }
    }, [currentUser, systemNotifications, userNotifications, READ_ANNOUNCEMENTS_KEY]);
    
    const unreadCount = notifications.filter(n => !n.isRead).length;

    return { notifications, unreadCount, markAsRead, markAllAsRead };
};