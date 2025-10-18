import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { AiAutomation, Organization } from '../types';
import { PrimaryButton, SecondaryButton } from './Buttons';
import { StyledInput, StyledSelect } from './Forms';
import { CompactToggleSwitch } from './icons';

interface AiAutomationEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (automation: AiAutomation) => void;
  automation: AiAutomation | null;
  organization: Organization;
}

const defaultAutomation: Omit<AiAutomation, 'id'> = {
  name: '',
  isEnabled: true,
  topic: '',
  frequency: 'weekly',
  dayOfWeek: 1,
  timeOfDay: '09:00',
  targetScreenIds: [],
  requiresApproval: true,
};

export const AiAutomationEditorModal: React.FC<AiAutomationEditorModalProps> = ({ isOpen, onClose, onSave, automation, organization }) => {
  const [current, setCurrent] = useState<Omit<AiAutomation, 'id'>>(() => automation || defaultAutomation);

  useEffect(() => {
    if (isOpen) {
        setCurrent(automation || { ...defaultAutomation, targetScreenIds: (organization.displayScreens || []).length > 0 ? [organization.displayScreens![0].id] : [] });
    }
  }, [isOpen, automation, organization]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (current.name.trim() && current.topic.trim() && current.targetScreenIds.length > 0) {
      onSave({ id: automation?.id || `auto-${Date.now()}`, ...current });
    }
  };

  const portalRoot = document.getElementById('modal-root') || document.body;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-2xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-4">{automation ? 'Redigera Automation' : 'Skapa ny Automation'}</h2>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            <div className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg">
                <label className="font-semibold" htmlFor="automation-enabled">Aktiverad</label>
                <CompactToggleSwitch id="automation-enabled" checked={current.isEnabled} onChange={c => setCurrent(s => ({...s, isEnabled: c}))} />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Namn på automation</label>
                <StyledInput type="text" value={current.name} onChange={e => setCurrent(s => ({...s, name: e.target.value}))} placeholder="T.ex. Veckans Erbjudande"/>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Kreativt ämne för AI:n</label>
                <textarea
                    rows={3}
                    value={current.topic}
                    onChange={e => setCurrent(s => ({...s, topic: e.target.value}))}
                    placeholder="T.ex. 'Skapa ett inspirerande inlägg om fördelarna med morgonträning' eller 'Ett frestande erbjudande på kaffe och bulle'."
                    className="w-full bg-slate-100 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                />
            </div>
            <div>
                <h3 className="text-lg font-semibold mb-2">Schema</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Frekvens</label>
                        <StyledSelect value={current.frequency} onChange={e => setCurrent(s => ({...s, frequency: e.target.value as any}))}>
                            <option value="daily">Dagligen</option>
                            <option value="weekly">Veckovis</option>
                            <option value="monthly">Månadsvis</option>
                        </StyledSelect>
                    </div>
                    {current.frequency === 'weekly' && (
                        <div>
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Veckodag</label>
                            <StyledSelect value={current.dayOfWeek} onChange={e => setCurrent(s => ({...s, dayOfWeek: parseInt(e.target.value) as any}))}>
                                <option value={1}>Måndag</option>
                                <option value={2}>Tisdag</option>
                                <option value={3}>Onsdag</option>
                                <option value={4}>Torsdag</option>
                                <option value={5}>Fredag</option>
                                <option value={6}>Lördag</option>
                                <option value={7}>Söndag</option>
                            </StyledSelect>
                        </div>
                    )}
                    {current.frequency === 'monthly' && (
                        <div>
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Dag i månaden</label>
                            <StyledInput type="number" min="1" max="31" value={current.dayOfMonth || 1} onChange={e => setCurrent(s => ({...s, dayOfMonth: parseInt(e.target.value) as any}))} />
                        </div>
                    )}
                     <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Tid på dygnet</label>
                        <StyledInput type="time" value={current.timeOfDay} onChange={e => setCurrent(s => ({...s, timeOfDay: e.target.value}))} />
                    </div>
                </div>
            </div>
            <div>
                <h3 className="text-lg font-semibold mb-2">Målkanaler</h3>
                <div className="space-y-2">
                    {(organization.displayScreens || []).map(screen => (
                        <label key={screen.id} className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={current.targetScreenIds.includes(screen.id)}
                                onChange={e => {
                                    const { checked } = e.target;
                                    setCurrent(s => ({
                                        ...s,
                                        targetScreenIds: checked
                                            ? [...s.targetScreenIds, screen.id]
                                            : s.targetScreenIds.filter(id => id !== screen.id)
                                    }));
                                }}
                                className="h-5 w-5 rounded text-primary focus:ring-primary"
                            />
                            <span className="font-medium text-slate-800 dark:text-slate-200">{screen.name}</span>
                        </label>
                    ))}
                </div>
            </div>
            <div>
                <h3 className="text-lg font-semibold mb-2">Publicering</h3>
                 <div className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg">
                    <label className="font-semibold" htmlFor="automation-approval">Kräv manuellt godkännande</label>
                    <CompactToggleSwitch id="automation-approval" checked={current.requiresApproval} onChange={c => setCurrent(s => ({...s, requiresApproval: c}))} disabled={true}/>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Funktionen för automatisk publicering är under utveckling. För närvarande måste alla AI-förslag godkännas manuellt.</p>
            </div>
        </div>
        <div className="flex justify-end gap-4 mt-6 border-t border-slate-200 dark:border-slate-700 pt-4">
          <SecondaryButton onClick={onClose}>Avbryt</SecondaryButton>
          <PrimaryButton onClick={handleSave}>Spara</PrimaryButton>
        </div>
      </div>
    </div>,
    portalRoot
  );
};
