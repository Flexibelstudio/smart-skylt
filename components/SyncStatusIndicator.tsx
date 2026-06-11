import React, { useState, useEffect, useRef } from 'react';
import { LoadingSpinnerIcon, CheckCircleIcon, ExclamationTriangleIcon } from './icons';

type SyncStatus = 'synced' | 'syncing' | 'offline';

export const SyncStatusIndicator: React.FC<{ status: SyncStatus }> = ({ status }) => {
    const [visible, setVisible] = useState(false);
    const [content, setContent] = useState<{ icon: React.ReactNode; text: string; classes: string; } | null>(null);
    // FIX: Initialize useRef with `undefined` to satisfy the requirement of providing an initial value and to align with the types for `setTimeout` and `clearTimeout`.
    const hideTimer = useRef<number | undefined>(undefined);

    useEffect(() => {
        clearTimeout(hideTimer.current);

        switch (status) {
            case 'syncing':
                setContent({ icon: <LoadingSpinnerIcon className="h-5 w-5" />, text: 'Sparar...', classes: 'bg-blue-500' });
                setVisible(true);
                break;
            case 'offline':
                setContent({ icon: <ExclamationTriangleIcon className="h-5 w-5" />, text: 'Offline-läge', classes: 'bg-yellow-500' });
                setVisible(true);
                break;
            case 'synced':
                // Only show the synced message if we were previously syncing.
                // This prevents it from showing on initial load.
                if (content?.text === 'Sparar...') {
                    setContent({ icon: <CheckCircleIcon className="h-5 w-5" />, text: 'Alla ändringar sparade', classes: 'bg-green-500' });
                    setVisible(true);
                    hideTimer.current = window.setTimeout(() => {
                        setVisible(false);
                    }, 2000);
                }
                break;
            default:
                setVisible(false);
        }

        return () => clearTimeout(hideTimer.current);
    // We only want to react to status changes, not content changes, to avoid loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status]);

    if (!content) return null;

    return (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm font-semibold shadow-lg transition-all duration-300 ${content.classes} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
            {content.icon}
            {content.text}
        </div>
    );
};