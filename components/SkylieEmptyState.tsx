import React from 'react';
import { PrimaryButton } from './Buttons';
import { ChatBubbleLeftRightIcon } from './icons';

interface SkylieEmptyStateProps {
    title: string;
    message: React.ReactNode;
    action?: {
        text: string;
        onClick: () => void;
        disabled?: boolean;
    };
}

export const SkylieEmptyState: React.FC<SkylieEmptyStateProps> = ({ title, message, action }) => {
    return (
        <div className="text-center p-8 bg-slate-50 dark:bg-slate-800/50 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white flex-shrink-0 ring-4 ring-white dark:ring-slate-800 shadow-lg">
                <ChatBubbleLeftRightIcon className="h-8 w-8"/>
            </div>
            <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">{title}</h3>
                <p className="mt-1 text-slate-500 dark:text-slate-400 max-w-md mx-auto">{message}</p>
            </div>
            {action && (
                <div className="mt-4">
                    <PrimaryButton onClick={action.onClick} disabled={action.disabled}>
                        {action.text}
                    </PrimaryButton>
                </div>
            )}
        </div>
    );
};
