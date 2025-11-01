import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Organization, AppNotification, Page } from '../types';
import { getSwedishHolidays } from '../data/holidays';
import { getSystemAnnouncements } from '../services/firebaseService';
import { parseToDate } from '../utils/dateUtils';

export const useNotificationManager = (organization: Organization | null, page: Page | undefined) => {
    const { currentUser } = useAuth();
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    
    // Key definitions using currentUser.uid to be user-specific
    const NOTIFICATIONS_KEY = `smart-skylt-notifications-${currentUser?.uid}`;
    const LAST_CHECK_KEY = `smart-skylt-last-check-${currentUser?.uid}`;
    const NOTIFIED_HOLIDAYS_KEY = `smart-skylt-notified-holidays-${currentUser?.uid}`;
    const UNUSED_EVENTS_KEY = `smart-skylt-last-check-unused-events-${currentUser?.uid}`;
    const READ_ANNOUNCEMENTS_KEY = `smart-skylt-read-announcements-${currentUser?.uid}`;


    const saveNotifications = useCallback((updatedNotifications: AppNotification[]) => {
        if (!currentUser) return;
        // Sort before saving to ensure consistency
        const sorted = updatedNotifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setNotifications(sorted);
        localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(sorted));
    }, [currentUser, NOTIFICATIONS_KEY]);

    // Load initial notifications from localStorage
    useEffect(() => {
        if (!currentUser) return;
        try {
            const stored = localStorage.getItem(NOTIFICATIONS_KEY);
            if (stored) {
                setNotifications(JSON.parse(stored));
            }
        } catch (e) {
            console.error("Failed to load notifications from localStorage", e);
            setNotifications([]);
        }
    }, [currentUser, NOTIFICATIONS_KEY]);


    // The main worker effect to check for new notification conditions
    useEffect(() => {
        if (!currentUser) return;

        const runChecks = async () => {
            const now = new Date();
            const lastCheckStr = localStorage.getItem(LAST_CHECK_KEY);
            const lastCheck = lastCheckStr ? (parseToDate(lastCheckStr) || new Date(now.getTime() - 24 * 60 * 60 * 1000)) : new Date(now.getTime() - 24 * 60 * 60 * 1000);

            // 1. Fetch system announcements
            const systemAnnouncements = await getSystemAnnouncements();
            const readAnnouncementIds = new Set(JSON.parse(localStorage.getItem(READ_ANNOUNCEMENTS_KEY) || '[]'));
            const remoteNotifications = systemAnnouncements.map(announcement => ({
                ...announcement,
                isRead: readAnnouncementIds.has(announcement.id.substring(4)), // Remove 'sys-' prefix
            }));

            // 2. Generate what local notifications should exist now
            let currentLocalNotifications: AppNotification[] = [];

            if (organization && page !== Page.SystemOwner) {
                const allScreens = organization.displayScreens || [];

                allScreens.forEach(screen => {
                    if (!screen.isEnabled) return;
                    
                    const activePosts = (screen.posts || []).filter(p => {
                        const start = parseToDate(p.startDate);
                        const end = parseToDate(p.endDate);
                        if (start && start > now) return false;
                        if (end && end < now) return false;
                        return true;
                    });

                    if (activePosts.length === 0) {
                        const templates = organization.postTemplates || [];
                        if (templates.length > 0) {
                            currentLocalNotifications.push({
                                id: `suggestion-blank-${screen.id}`,
                                createdAt: now.toISOString(), type: 'suggestion',
                                title: 'Skärmen är tom!',
                                message: `Skyltfönstret "${screen.name}" är tomt. Tips: Publicera snabbt innehåll med en mall, t.ex. "${templates[0].templateName}".`,
                                isRead: false, relatedScreenId: screen.id,
                            });
                        } else {
                            currentLocalNotifications.push({
                                id: `warning-blank-${screen.id}`,
                                createdAt: now.toISOString(), type: 'warning',
                                title: 'Skärmen är tom!',
                                message: `Skyltfönstret "${screen.name}" har inga aktiva inlägg. Skapa ett nytt inlägg för att fylla det med innehåll.`,
                                isRead: false, relatedScreenId: screen.id,
                            });
                        }
                    }

                    (screen.posts || []).forEach(post => {
                        const start = parseToDate(post.startDate);
                        const end = parseToDate(post.endDate);

                        if (start && start > lastCheck && start <= now) {
                            currentLocalNotifications.push({
                                id: `success-published-${post.id}-${start.toISOString()}`,
                                createdAt: now.toISOString(), type: 'success',
                                title: 'Inlägg Publicerat',
                                message: `"${post.internalTitle}" visas nu på "${screen.name}".`,
                                isRead: false, relatedScreenId: screen.id,
                            });
                        }
                        if (end && end > lastCheck && end <= now) {
                            currentLocalNotifications.push({
                                id: `info-unpublished-${post.id}-${end.toISOString()}`,
                                createdAt: now.toISOString(), type: 'info',
                                title: 'Inlägg Avpublicerat',
                                message: `"${post.internalTitle}" har slutat visas på "${screen.name}".`,
                                isRead: false, relatedScreenId: screen.id,
                            });
                        }
                        
                        if (post.startDate && !post.endDate) {
                            const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
                            const postStartDate = parseToDate(post.startDate);
                            if (postStartDate && postStartDate < fourteenDaysAgo) {
                                currentLocalNotifications.push({
                                    id: `suggestion-old-post-${post.id}`,
                                    createdAt: now.toISOString(), type: 'suggestion',
                                    title: 'Dags för förnyelse?',
                                    message: `Ditt inlägg "${post.internalTitle}" har visats i över 14 dagar. Dags att fräscha upp det?`,
                                    isRead: false, relatedScreenId: screen.id, relatedPostId: post.id,
                                });
                            }
                        }
                    });
                });

                try {
                    const notifiedHolidaysStr = localStorage.getItem(NOTIFIED_HOLIDAYS_KEY);
                    const notifiedHolidays = notifiedHolidaysStr ? JSON.parse(notifiedHolidaysStr) : {};
                    const year = now.getFullYear();
                    const holidays = getSwedishHolidays(year);
                    const reminderDays = 14;

                    holidays.forEach(holiday => {
                        const holidayKey = `${holiday.name}-${year}`;
                        const diffDays = (holiday.date.getTime() - now.getTime()) / (1000 * 3600 * 24);

                        if (diffDays > 0 && diffDays <= reminderDays && !notifiedHolidays[holidayKey]) {
                            currentLocalNotifications.push({
                                id: `suggestion-holiday-${holidayKey}`,
                                createdAt: now.toISOString(), type: 'suggestion',
                                title: `${holiday.name} närmar sig!`,
                                message: `Passa på att skapa en kampanj eller ett inlägg för att fira ${holiday.name}.`,
                                isRead: false,
                            });
                            notifiedHolidays[holidayKey] = true;
                        }
                    });
                    localStorage.setItem(NOTIFIED_HOLIDAYS_KEY, JSON.stringify(notifiedHolidays));
                } catch (e) { console.error("Failed holiday check", e); }
                
                const lastCheckUnusedEventsStr = localStorage.getItem(UNUSED_EVENTS_KEY);
                const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                const lastCheckUnusedEvents = lastCheckUnusedEventsStr ? parseToDate(lastCheckUnusedEventsStr) : thirtyDaysAgo;

                if ((!organization.customEvents || organization.customEvents.length === 0) && lastCheckUnusedEvents && lastCheckUnusedEvents <= thirtyDaysAgo) {
                    const year = now.getFullYear();
                    const upcomingHolidays = getSwedishHolidays(year).filter(h => h.date >= now).sort((a,b) => a.date.getTime() - b.date.getTime());

                    if (upcomingHolidays.length > 0) {
                        const nextHoliday = upcomingHolidays[0];
                        currentLocalNotifications.push({
                            id: `suggestion-use-events-${year}-${nextHoliday.name}`,
                            createdAt: now.toISOString(), type: 'suggestion',
                            title: 'Planera för kommande händelser!',
                            message: `Vi ser att du inte har lagt in egna händelser. Tips: Planera för "${nextHoliday.name}"!`,
                            isRead: false,
                        });
                        localStorage.setItem(UNUSED_EVENTS_KEY, now.toISOString());
                    }
                }
            }


            // 3. Reconcile with previous state to preserve isRead for local notifications
            const previousNotificationsJSON = localStorage.getItem(NOTIFICATIONS_KEY);
            const previousNotifications = previousNotificationsJSON ? JSON.parse(previousNotificationsJSON) : [];
            const reconciledLocalNotifications = currentLocalNotifications.map(newNotif => {
                const oldNotif = previousNotifications.find((n: AppNotification) => n.id === newNotif.id);
                return oldNotif ? { ...newNotif, isRead: oldNotif.isRead } : newNotif;
            });
            
            const finalNotifications = [...remoteNotifications, ...reconciledLocalNotifications];
            saveNotifications(finalNotifications);

            localStorage.setItem(LAST_CHECK_KEY, now.toISOString());
        };

        runChecks();
    }, [organization, currentUser, page, saveNotifications, LAST_CHECK_KEY, NOTIFIED_HOLIDAYS_KEY, UNUSED_EVENTS_KEY, READ_ANNOUNCEMENTS_KEY, NOTIFICATIONS_KEY]);


    const markAsRead = useCallback((notificationId: string) => {
        if (notificationId.startsWith('sys-')) {
            const originalId = notificationId.substring(4);
            const readIds = JSON.parse(localStorage.getItem(READ_ANNOUNCEMENTS_KEY) || '[]');
            if (!readIds.includes(originalId)) {
                localStorage.setItem(READ_ANNOUNCEMENTS_KEY, JSON.stringify([...readIds, originalId]));
            }
        }
        const updated = notifications.map(n => n.id === notificationId ? { ...n, isRead: true } : n);
        saveNotifications(updated);
    }, [notifications, saveNotifications, READ_ANNOUNCEMENTS_KEY]);

    const markAllAsRead = useCallback(() => {
        const systemNotifIdsToMark = notifications
            .filter(n => n.id.startsWith('sys-') && !n.isRead)
            .map(n => n.id.substring(4));
            
        if (systemNotifIdsToMark.length > 0) {
            const readIds = JSON.parse(localStorage.getItem(READ_ANNOUNCEMENTS_KEY) || '[]');
            const newReadIds = [...new Set([...readIds, ...systemNotifIdsToMark])];
            localStorage.setItem(READ_ANNOUNCEMENTS_KEY, JSON.stringify(newReadIds));
        }
            
        const updated = notifications.map(n => ({ ...n, isRead: true }));
        saveNotifications(updated);
    }, [notifications, saveNotifications, READ_ANNOUNCEMENTS_KEY]);
    
    const unreadCount = notifications.filter(n => !n.isRead).length;

    return { notifications, unreadCount, markAsRead, markAllAsRead };
};
