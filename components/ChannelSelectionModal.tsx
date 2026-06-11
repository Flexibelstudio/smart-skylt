import React, { useState, useEffect } from 'react';
import { DisplayScreen } from '../types';
import { PrimaryButton, SecondaryButton } from './Buttons';

interface ChannelSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (screens: DisplayScreen[]) => void;
  screens: DisplayScreen[];
}

export const ChannelSelectionModal: React.FC<ChannelSelectionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  screens,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSelectedIds([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggle = (screenId: string) => {
    setSelectedIds(prev =>
      prev.includes(screenId)
        ? prev.filter(id => id !== screenId)
        : [...prev, screenId]
    );
  };

  const handleConfirm = () => {
    const selectedScreens = screens.filter(s => selectedIds.includes(s.id));
    onConfirm(selectedScreens);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[51] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-lg text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold mb-2">Välj Kanaler</h2>
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          Vilka kanaler ska Skylie skapa utkast för?
        </p>

        <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
          {screens.length > 0 ? (
            screens.map((screen) => (
              <label
                key={screen.id}
                className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(screen.id)}
                  onChange={() => handleToggle(screen.id)}
                  className="h-5 w-5 rounded text-primary focus:ring-primary"
                />
                <span className="font-semibold text-lg text-slate-800 dark:text-slate-200">
                  {screen.name}
                </span>
              </label>
            ))
          ) : (
            <p className="text-slate-500 dark:text-slate-400 text-center py-4">
              Det finns inga kanaler att välja. Skapa en först.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-4 mt-8 border-t border-slate-200 dark:border-slate-700 pt-4">
          <SecondaryButton onClick={onClose}>Avbryt</SecondaryButton>
          <PrimaryButton onClick={handleConfirm} disabled={selectedIds.length === 0}>
            Skapa utkast ({selectedIds.length})
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
};