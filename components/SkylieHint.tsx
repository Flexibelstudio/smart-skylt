import React from 'react';
import { LightBulbIcon } from './icons';

interface SkylieHintProps {
    children: React.ReactNode;
    className?: string;
}

export const SkylieHint: React.FC<SkylieHintProps> = ({ children, className }) => {
    return (
        <div className={`flex items-start gap-3 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800/50 ${className || ''}`}>
            <div className="flex-shrink-0 pt-0.5">
                <LightBulbIcon className="h-6 w-6 text-yellow-500 dark:text-yellow-400" />
            </div>
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
                <span className="font-bold">Skylies Tips:</span> {children}
            </div>
        </div>
    );
};
