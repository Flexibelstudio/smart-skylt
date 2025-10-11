import React from 'react';
import { LoadingSpinnerIcon } from './icons';

interface ButtonProps {
    onClick?: () => void;
    disabled?: boolean;
    children: React.ReactNode;
    title?: string;
    className?: string;
    type?: 'button' | 'submit' | 'reset';
    loading?: boolean;
}

export const PrimaryButton: React.FC<ButtonProps> = ({ onClick, disabled, children, title, className, type = 'button', loading = false }) => (
    <button onClick={onClick} disabled={disabled || loading} title={title} type={type}
        className={`bg-primary hover:brightness-110 text-white font-bold py-2 px-5 rounded-lg transition-all shadow-sm hover:shadow-md disabled:bg-slate-400 disabled:dark:bg-slate-600 disabled:text-slate-500 disabled:dark:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none transform hover:-translate-y-px flex items-center justify-center gap-2 ${className}`}>
        {loading && <LoadingSpinnerIcon className="h-5 w-5" />}
        {children}
    </button>
);

export const SecondaryButton: React.FC<ButtonProps> = ({ onClick, disabled, children, className, type = 'button', loading = false }) => (
    <button onClick={onClick} disabled={disabled || loading} type={type}
        className={`bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${className}`}>
        {loading && <LoadingSpinnerIcon className="h-5 w-5 text-slate-500" />}
        {children}
    </button>
);

export const DestructiveButton: React.FC<ButtonProps> = ({ onClick, disabled, children, className, loading = false }) => (
     <button onClick={onClick} disabled={disabled || loading} 
        className={`bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${className}`}>
        {loading && <LoadingSpinnerIcon className="h-5 w-5" />}
        {children}
    </button>
);