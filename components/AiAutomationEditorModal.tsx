import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { AiAutomation, Organization } from '../types';
import { PrimaryButton, SecondaryButton } from './Buttons';
import { StyledInput, StyledSelect } from './Forms';
import { CompactToggleSwitch, SparklesIcon, InformationCircleIcon } from './icons';
import { AiPromptBuilderModal } from './AiPromptBuilderModal';
import { useToast } from '../context/ToastContext';

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
  maxWords: 25,
  frequency: 'weekly',
  dayOfWeek: 1,
  timeOfDay: '09:00',
  targetScreenIds: [],
  requiresApproval: true,
  postLifetimeMode: 'replace',
  postLifetimeDays: 7,
};

export const AiAutomationEditorModal: React.FC<AiAutomationEditorModalProps> = ({ isOpen, onClose, onSave, automation, organization }) => {
  const [current, setCurrent] = useState<Omit<AiAutomation, 'id'>>(() => automation || defaultAutomation);
  const [isPromptBuilderOpen, setIsPromptBuilderOpen] = useState(false);
  const { showToast } = useToast();


  useEffect(() => {
    // This effect synchronizes the internal state `current` with the `automation` prop.
    // It runs when the modal opens (`isOpen` becomes true) or if the `automation` prop changes.
    // The `organization` dependency has been removed to prevent unwanted state resets if the
    // parent organization object reference changes during a re-render.
    if (isOpen) {
        setCurrent(automation || { ...defaultAutomation, targetScreenIds: (organization.displayScreens || []).length > 0 ? [organization.displayScreens![0].id] : [] });
    }
  }, [isOpen, automation]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (current.name.trim() && current.topic.trim() && current.targetScreenIds.length > 0) {
      onSave({
        id: automation?.id || `auto-${Date.now()}`,
        ...current,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    }
  };

  const portalRoot = document.getElementById('modal-root') || document.body;

  return ReactDOM.createPortal(
    <>
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-2xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-bold mb-4">{automation ? 'Redigera Automation' : 'Skapa ny Automation'}</h2>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                <div className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg">
                    <label className="font-semibold" htmlFor="automation-enabled">Aktiverad</label>
                    <CompactToggleSwitch checked={current.isEnabled} onChange={c => setCurrent(s => ({...s, isEnabled: c}))} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Namn på automation</label>
                    <StyledInput type="text" value={current.name} onChange={e => setCurrent(s => ({...s, name: e.target.value}))} placeholder="T.ex. Veckans Erbjudande"/>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 flex justify-between items-center">
                        <span>Kreativt ämne för AI:n</span>
                        <button type="button" onClick={() => setIsPromptBuilderOpen(true)} className="flex items-center gap-1 text-sm font-semibold text-purple-600 dark:text-purple-400 hover:underline">
                            <SparklesIcon className="h-4 w-4" />
                            Prompt-hjälp
                        </button>
                    </label>
                    <textarea
                        rows={3}
                        value={current.topic ?? ""}
                        onChange={e => setCurrent(s => ({...s, topic: e.target.value}))}
                        placeholder="T.ex. 'Skapa ett inspirerande inlägg om fördelarna med morgonträning' eller 'Ett frestande erbjudande på kaffe och bulle'."
                        className="w-full bg-slate-100 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Maximal textlängd</label>
                    <div className="flex items-center gap-4 bg-slate-100 dark:bg-slate-700/50 p-3 rounded-lg">
                        <input
                            type="range"
                            min="10"
                            max="75"
                            step="5"
                            value={current.maxWords || 25}
                            onChange={e => setCurrent(s => ({ ...s, maxWords: parseInt(e.target.value, 10) }))}
                            className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex items-center gap-2">
                            <StyledInput
                                type="number"
                                min="10"
                                max="75"
                                value={String(current.maxWords || 25)}
                                onChange={e => setCurrent(s => ({ ...s, maxWords: parseInt(e.target.value, 10) }))}
                                className="w-20 text-center"
                            />
                            <span className="text-sm text-slate-500 dark:text-slate-400">ord</span>
                        </div>
                    </div>
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
                                <StyledInput type="number" min="1" max="31" value={String(current.dayOfMonth || 1)} onChange={e => setCurrent(s => ({...s, dayOfMonth: parseInt(e.target.value) as any}))} />
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Tid på dygnet</label>
                            <StyledInput type="time" value={current.timeOfDay} onChange={e => setCurrent(s => ({...s, timeOfDay: e.target.value}))} />
                        </div>
                    </div>
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-start gap-3 text-sm text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        <InformationCircleIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />
                        <div>
                            <strong>Observera:</strong> Automationer körs varje kvart (t.ex. 09:00, 09:15, 09:30). Ditt inläggsförslag kan därför dyka upp med upp till 15 minuters fördröjning.
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
                        <CompactToggleSwitch checked={current.requiresApproval} onChange={c => setCurrent(s => ({...s, requiresApproval: c}))} disabled={true}/>
                    </div>
                </div>
                <div>
                    <h3 className="text-lg font-semibold mb-2">Livslängd för inlägg</h3>
                    <div className="space-y-3 bg-slate-100 dark:bg-slate-700/50 p-4 rounded-lg">
                        {/* Option 1: Replace */}
                        <label className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer">
                            <input
                                type="radio"
                                name="postLifetimeMode"
                                value="replace"
                                checked={!current.postLifetimeMode || current.postLifetimeMode === 'replace'}
                                onChange={() => setCurrent(s => ({ ...s, postLifetimeMode: 'replace' }))}
                                className="h-5 w-5 text-primary focus:ring-primary"
                            />
                            <div>
                                <span className="font-medium text-slate-800 dark:text-slate-200">Ersätt när nytt inlägg publiceras</span>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Endast ett inlägg från denna automation är aktivt åt gången.</p>
                            </div>
                        </label>
                        
                        {/* Option 2: Duration */}
                        <label className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer">
                            <input
                                type="radio"
                                name="postLifetimeMode"
                                value="duration"
                                checked={current.postLifetimeMode === 'duration'}
                                onChange={() => setCurrent(s => ({ ...s, postLifetimeMode: 'duration' }))}
                                className="h-5 w-5 text-primary focus:ring-primary"
                            />
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-slate-800 dark:text-slate-200">Visa inlägg i</span>
                                <StyledInput
                                    type="number"
                                    min="1"
                                    value={String(current.postLifetimeDays || 7)}
                                    onChange={e => setCurrent(s => ({ ...s, postLifetimeDays: parseInt(e.target.value, 10) || 1 }))}
                                    onClick={e => {
                                        e.preventDefault(); // Prevent label click from deselecting radio
                                        setCurrent(s => ({...s, postLifetimeMode: 'duration' }));
                                    }}
                                    disabled={current.postLifetimeMode !== 'duration'}
                                    className="w-20 text-center !p-2 disabled:bg-slate-200 dark:disabled:bg-slate-800"
                                />
                                <span className="font-medium text-slate-800 dark:text-slate-200">dagar</span>
                            </div>
                        </label>
                    </div>
                </div>
            </div>
            <div className="flex justify-end gap-4 mt-6 border-t border-slate-200 dark:border-slate-700 pt-4">
            <SecondaryButton onClick={onClose}>Avbryt</SecondaryButton>
            <PrimaryButton onClick={handleSave}>Spara</PrimaryButton>
            </div>
        </div>
        </div>
        {isPromptBuilderOpen && (
            <AiPromptBuilderModal
                onClose={() => setIsPromptBuilderOpen(false)}
                onGenerate={(newPrompt) => {
                    setCurrent(s => ({ ...s, topic: newPrompt }));
                    // Delay closing the modal by one tick to prevent a race condition where
                    // the state might be reset by a parent re-render before the new topic is saved.
                    setTimeout(() => {
                        setIsPromptBuilderOpen(false);
                        showToast({ message: "Kommando uppdaterat med hjälp av AI.", type: 'success' });
                    }, 0);
                }}
            />
        )}
    </>,
    portalRoot
  );
};