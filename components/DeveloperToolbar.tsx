import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';

type SimulatedUserType = 'systemowner' | 'organizationadmin' | 'screen';

export const DeveloperToolbar: React.FC = () => {
    const { switchSimulatedUser, role, isScreenMode } = useAuth();
    const [isExpanded, setIsExpanded] = useState(false);

    if (!switchSimulatedUser) {
        return null; // Should not happen in offline mode, but good practice
    }

    const handleSwitch = (userType: SimulatedUserType) => {
        switchSimulatedUser(userType);
    };

    const getButtonClass = (targetRole: UserRole | 'screen') => {
        let currentRole: UserRole | 'screen' = role;
        if (isScreenMode) {
            currentRole = 'screen';
        }
        
        return `w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
            currentRole === targetRole 
            ? 'bg-primary text-white font-bold' 
            : 'bg-gray-600 hover:bg-gray-500 text-gray-200'
        }`;
    };

    if (!isExpanded) {
        return (
            <button
                onClick={() => setIsExpanded(true)}
                title="Dev-verktyg"
                className="fixed bottom-4 left-4 z-[9999] w-10 h-10 bg-slate-800/90 hover:bg-slate-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95 border border-slate-600 cursor-pointer"
            >
                🛠
            </button>
        );
    }

    return (
        <div className="fixed bottom-4 left-4 bg-gray-800/80 backdrop-blur-md rounded-lg shadow-2xl z-[9999] w-56 border border-gray-600 text-white p-3 font-sans">
            <div className="flex items-center justify-between border-b border-gray-600 pb-2 mb-2">
                <h4 className="font-bold text-sm text-yellow-400">DEV TOOLBAR</h4>
                <button
                    onClick={() => setIsExpanded(false)}
                    title="Minska"
                    className="text-gray-400 hover:text-white text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                >
                    ✕
                </button>
            </div>
            <p className="text-xs text-gray-400 mb-3">Simulera användarroll:</p>
            <div className="space-y-2">
                <button 
                    onClick={() => handleSwitch('systemowner')}
                    className={getButtonClass('systemowner')}
                >
                    Systemägare
                </button>
                <button 
                    onClick={() => handleSwitch('organizationadmin')}
                    className={getButtonClass('organizationadmin')}
                >
                    Org. Admin
                </button>
                <button 
                    onClick={() => handleSwitch('screen')}
                    className={getButtonClass('screen')}
                >
                    Skärmläge
                </button>
                
                {localStorage.getItem('forceOffline') === 'true' && (
                    <button 
                        onClick={() => {
                            localStorage.removeItem('forceOffline');
                            window.location.reload();
                        }}
                        className="w-full text-left px-3 py-2 text-sm rounded-md transition-colors bg-red-600 hover:bg-red-500 text-white mt-4 font-bold"
                    >
                        Återgå till inloggning
                    </button>
                )}
            </div>
        </div>
    );
};