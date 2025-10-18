import React from 'react';
import { PrimaryButton, SecondaryButton, DestructiveButton } from './Buttons';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  confirmText?: string;
  children: React.ReactNode;
  variant?: 'primary' | 'destructive';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  confirmText = 'Bekräfta',
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" onClick={onClose}>
      <div 
        className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-md text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-2xl font-bold mb-4">{title}</h2>
        <div className="text-slate-600 dark:text-slate-300 mb-6">
          {typeof children === 'string' ? <p>{children}</p> : children}
        </div>
        <div className="flex justify-end gap-4">
          <SecondaryButton onClick={onClose}>Avbryt</SecondaryButton>
          <ConfirmButton onClick={handleConfirm}>{confirmText}</ConfirmButton>
        </div>
      </div>
    </div>
  );
};
