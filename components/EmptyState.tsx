import React from 'react';
import { PrimaryButton } from './Buttons';

interface EmptyStateProps {
    icon: React.ReactNode;
    title: string;
    message: string;
    action?: {
        text: string;
        onClick: () => void;
        disabled?: boolean;
    };
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, message, action }) => {
    return (
        <div className="text-center p-8 bg-slate-50 dark:bg-slate-800/50 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700">
            <div className="flex justify-center items-center text-slate-400 dark:text-slate-500 mb-4">
                {icon}
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">{title}</h3>
            <p className="mt-1 text-slate-500 dark:text-slate-400 max-w-md mx-auto">{message}</p>
            {action && (
                <div className="mt-6">
                    <PrimaryButton onClick={action.onClick} disabled={action.disabled}>
                        {action.text}
                    </PrimaryButton>
                </div>
            )}
        </div>
    );
};
