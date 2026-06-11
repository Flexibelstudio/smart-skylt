import React from 'react';
import { env } from '../services/firebaseInit';

export const EnvironmentBadge: React.FC = () => {
    if (env === 'offline') {
        return (
             <div className="fixed top-20 right-6 bg-slate-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg z-40" title="Appen körs i offline-läge med simulerad data.">
                OFFLINE
            </div>
        );
    }

    if (env === 'staging') {
        return (
            <div className="fixed top-20 right-6 bg-orange-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg z-40" title="Appen är ansluten till STAGING-databasen.">
                STAGING
            </div>
        );
    }

    return null;
};