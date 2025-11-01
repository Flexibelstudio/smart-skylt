import React from 'react';

export const Card: React.FC<{children: React.ReactNode, title: React.ReactNode, subTitle?: string, saving?: boolean, actions?: React.ReactNode}> = ({children, title, subTitle, saving, actions}) => (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl space-y-6 border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-700 pb-4 mb-4">
            <div>
                 <div className="text-2xl font-bold text-slate-900 dark:text-white">{title}</div>
                 {subTitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subTitle}</p>}
            </div>
            <div className="flex items-center gap-4">
                {saving && <span className="text-sm text-slate-400 animate-pulse">Sparar...</span>}
                {actions}
            </div>
        </div>
        {children}
    </div>
);
