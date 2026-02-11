
import React from 'react';
import { PrimaryButton, SecondaryButton, DestructiveButton } from './Buttons';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  confirmText?: string;
  cancelText?: string;
  children: React.ReactNode;
  variant?: 'primary' | 'destructive';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  confirmText = 'Bekräfta',
  cancelText = 'Avbryt',
  children,
  variant = 'destructive'
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };
  
  const ConfirmButton = variant === 'destructive' ? DestructiveButton : PrimaryButton;

  return (
    <div 
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-[100] p-4 transition-all duration-300" 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="confirm-dialog-title" 
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 sm:p-10 w-full max-w-md text-slate-900 dark:text-white shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/20 dark:border-slate-700 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-center">
          <h2 id="confirm-dialog-title" className="text-2xl font-black mb-3 tracking-tight">{title}</h2>
          <div className="text-slate-600 dark:text-slate-300 mb-8 leading-relaxed">
            {typeof children === 'string' ? <p>{children}</p> : children}
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row-reverse gap-3">
          <ConfirmButton 
            onClick={handleConfirm}
            className="w-full !py-4 !rounded-2xl text-lg shadow-lg"
          >
            {confirmText}
          </ConfirmButton>
          <SecondaryButton 
            onClick={onClose}
            className="w-full !py-4 !rounded-2xl text-lg !bg-slate-100 dark:!bg-slate-700 hover:!bg-slate-200 dark:hover:!bg-slate-600"
          >
            {cancelText}
          </SecondaryButton>
        </div>
      </div>
    </div>
  );
};
