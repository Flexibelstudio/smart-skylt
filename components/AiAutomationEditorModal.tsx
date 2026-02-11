import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { AiAutomation, Organization, DisplayPost } from '../types';
import { PrimaryButton, SecondaryButton } from './Buttons';
import { StyledInput, StyledSelect } from './Forms';
import { CompactToggleSwitch, XCircleIcon, SparklesIcon, DuplicateIcon } from './icons';

interface AiAutomationEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (automation: AiAutomation) => Promise<void>;
    automation: AiAutomation | null;
    organization: Organization;
}

const DEFAULT_AUTOMATION: AiAutomation = {
    id: '',
    name: '',
    isEnabled: true,
    topic: '',
    frequency: 'weekly',
    dayOfWeek: 1, // Monday
    timeOfDay: '09:00',
    timezone: 'Europe/Stockholm',
    targetScreenIds: [],
    requiresApproval: true,
    postLifetimeMode: 'duration',
    postLifetimeDays: 7,
    preferredLayout: 'auto',
    imageStyle: 'professional photography'
};

export const AiAutomationEditorModal: React.FC<AiAutomationEditorModalProps> = ({
    isOpen,
    onClose,
    onSave,
    automation,
    organization
}) => {
    const [current, setCurrent] = useState<AiAutomation>(DEFAULT_AUTOMATION);
    const [isSaving, setIsSaving] = useState(false);
    const [mode, setMode] = useState<'create' | 'remix'>('create');

    useEffect(() => {
        if (isOpen) {
            if (automation) {
                setCurrent({ ...DEFAULT_AUTOMATION, ...automation });
                setMode(automation.remixBasePostId ? 'remix' : 'create');
            } else {
                setCurrent({ 
                    ...DEFAULT_AUTOMATION, 
                    id: `auto-${Date.now()}`,
                    targetScreenIds: organization.displayScreens?.map(s => s.id) || [] 
                });
                setMode('create');
            }
        }
    }, [isOpen, automation, organization]);

    // Flatten all posts for the selector
    const allPosts = useMemo(() => {
        const posts: { post: DisplayPost, screenName: string }[] = [];
        organization.displayScreens?.forEach(screen => {
            screen.posts?.forEach(post => {
                posts.push({ post, screenName: screen.name });
            });
        });
        return posts;
    }, [organization]);

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!current.name) return;
        // If create mode, clear remix ID. If remix mode, verify ID exists.
        if (mode === 'create') {
            if (!current.topic) return;
            current.remixBasePostId = undefined;
        } else {
            if (!current.remixBasePostId) return;
            // In remix mode, 'topic' acts as the remix instruction
            if (!current.topic) current.topic = "Gör en kreativ variation på detta inlägg.";
        }

        setIsSaving(true);
        await onSave(current);
        setIsSaving(false);
    };

    const handleTargetScreenToggle = (screenId: string) => {
        setCurrent(prev => {
            const currentIds = prev.targetScreenIds || [];
            if (currentIds.includes(screenId)) {
                return { ...prev, targetScreenIds: currentIds.filter(id => id !== screenId) };
            } else {
                return { ...prev, targetScreenIds: [...currentIds, screenId] };
            }
        });
    };

    const portalRoot = document.getElementById('modal-root') || document.body;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-2xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">{automation ? 'Redigera automation' : 'Skapa ny automation'}</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <XCircleIcon className="w-8 h-8" />
                    </button>
                </div>

                <div className="space-y-6">
                    {/* Basic Info */}
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Namn på automation</label>
                        <StyledInput 
                            type="text" 
                            value={current.name} 
                            onChange={e => setCurrent(s => ({...s, name: e.target.value}))} 
                            placeholder="t.ex. Måndagskampanj"
                        />
                    </div>

                    {/* Mode Selector */}
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Typ av automation</label>
                        <div className="flex gap-4">
                            <button
                                type="button"
                                onClick={() => setMode('create')}
                                className={`flex-1 p-4 rounded-lg border-2 text-left transition-all ${mode === 'create' ? 'border-primary bg-primary/5 dark:bg-primary/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
                            >
                                <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-white mb-1">
                                    <SparklesIcon className="w-5 h-5 text-purple-500" />
                                    Nytt innehåll
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    AI skapar helt nya inlägg baserat på ett ämne eller instruktion.
                                </p>
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('remix')}
                                className={`flex-1 p-4 rounded-lg border-2 text-left transition-all ${mode === 'remix' ? 'border-primary bg-primary/5 dark:bg-primary/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
                            >
                                <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-white mb-1">
                                    <DuplicateIcon className="w-5 h-5 text-blue-500" />
                                    Remixa inlägg
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    AI utgår från ett befintligt inlägg och gör nya varianter på det.
                                </p>
                            </button>
                        </div>
                    </div>

                    {/* Dynamic Inputs based on Mode */}
                    {mode === 'create' ? (
                        <div>
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Ämne / Instruktion</label>
                            <StyledInput 
                                type="text" 
                                value={current.topic} 
                                onChange={e => setCurrent(s => ({...s, topic: e.target.value}))} 
                                placeholder="Vad ska inläggen handla om? (t.ex. 'Veckans lunch')"
                            />
                        </div>
                    ) : (
                        <div className="space-y-4 animate-fade-in">
                            <div>
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Välj inlägg att remixa</label>
                                <StyledSelect 
                                    value={current.remixBasePostId || ''} 
                                    onChange={e => setCurrent(s => ({...s, remixBasePostId: e.target.value}))}
                                >
                                    <option value="">-- Välj inlägg --</option>
                                    {allPosts.map((item) => (
                                        <option key={item.post.id} value={item.post.id}>
                                            {item.post.internalTitle} ({item.screenName})
                                        </option>
                                    ))}
                                </StyledSelect>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Instruktion för remix (Valfritt)</label>
                                <StyledInput 
                                    type="text" 
                                    value={current.topic} 
                                    onChange={e => setCurrent(s => ({...s, topic: e.target.value}))} 
                                    placeholder="T.ex. 'Gör den roligare', 'Ändra bildstil', 'Förkorta texten'"
                                />
                            </div>
                        </div>
                    )}

                    {/* Schedule */}
                    <div>
                        <h3 className="text-lg font-semibold mb-3 border-b border-slate-200 dark:border-slate-700 pb-2">Schema</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Frekvens</label>
                                <StyledSelect value={current.frequency} onChange={e => setCurrent(s => ({...s, frequency: e.target.value as any}))}>
                                    <option value="daily">Varje dag</option>
                                    <option value="weekly">Varje vecka</option>
                                    <option value="monthly">Varje månad</option>
                                </StyledSelect>
                            </div>
                            
                            {current.frequency === 'weekly' && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Veckodag</label>
                                    <StyledSelect value={current.dayOfWeek} onChange={e => setCurrent(s => ({...s, dayOfWeek: parseInt(e.target.value) as any}))}>
                                        <option value="1">Måndag</option>
                                        <option value="2">Tisdag</option>
                                        <option value="3">Onsdag</option>
                                        <option value="4">Torsdag</option>
                                        <option value="5">Fredag</option>
                                        <option value="6">Lördag</option>
                                        <option value="7">Söndag</option>
                                    </StyledSelect>
                                </div>
                            )}

                            {current.frequency === 'monthly' && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Dag i månaden</label>
                                    <StyledInput 
                                        type="number" 
                                        min="1" max="31" 
                                        value={String(current.dayOfMonth || 1)} 
                                        onChange={e => setCurrent(s => ({...s, dayOfMonth: parseInt(e.target.value)}))} 
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Tidpunkt</label>
                                <StyledInput 
                                    type="time" 
                                    value={current.timeOfDay} 
                                    onChange={e => setCurrent(s => ({...s, timeOfDay: e.target.value}))} 
                                />
                            </div>
                        </div>
                    </div>

                    {/* Design */}
                    <div>
                        <h3 className="text-lg font-semibold mb-3 border-b border-slate-200 dark:border-slate-700 pb-2">Designpreferenser</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Föredragen layout</label>
                                <StyledSelect value={current.preferredLayout || 'auto'} onChange={e => setCurrent(s => ({...s, preferredLayout: e.target.value}))}>
                                    <option value="auto">Låt AI välja (Auto)</option>
                                    <option value="text-only">Endast text</option>
                                    <option value="image-fullscreen">Helskärmsbild</option>
                                    <option value="image-left">Bild vänster</option>
                                    <option value="image-right">Bild höger</option>
                                </StyledSelect>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Bildstil</label>
                                <StyledSelect value={current.imageStyle || 'professional photography'} onChange={e => setCurrent(s => ({...s, imageStyle: e.target.value}))}>
                                    <option value="professional photography">Professionellt foto</option>
                                    <option value="minimalist">Minimalistisk</option>
                                    <option value="cinematic">Cinematisk</option>
                                    <option value="studio">Studio</option>
                                    <option value="lifestyle">Lifestyle</option>
                                    <option value="illustration">Illustration</option>
                                </StyledSelect>
                            </div>
                        </div>
                    </div>

                    {/* Target Screens */}
                    <div>
                        <h3 className="text-lg font-semibold mb-3 border-b border-slate-200 dark:border-slate-700 pb-2">Målkanaler</h3>
                        <div className="grid grid-cols-2 gap-2">
                            {organization.displayScreens?.map(screen => (
                                <label key={screen.id} className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-700/50 rounded cursor-pointer border border-transparent hover:border-slate-300 dark:hover:border-slate-500">
                                    <input 
                                        type="checkbox" 
                                        checked={current.targetScreenIds?.includes(screen.id)} 
                                        onChange={() => handleTargetScreenToggle(screen.id)}
                                        className="rounded text-primary focus:ring-primary"
                                    />
                                    <span className="text-sm">{screen.name}</span>
                                </label>
                            ))}
                        </div>
                        {(!organization.displayScreens || organization.displayScreens.length === 0) && (
                            <p className="text-sm text-slate-500 italic">Inga kanaler tillgängliga.</p>
                        )}
                    </div>

                    {/* Settings */}
                    <div>
                        <h3 className="text-lg font-semibold mb-3 border-b border-slate-200 dark:border-slate-700 pb-2">Inställningar</h3>
                        
                        <div className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg mb-3">
                            <div>
                                <label className="font-semibold block text-slate-900 dark:text-white" htmlFor="automation-approval">Kräv manuellt godkännande</label>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Om avstängt publiceras inläggen direkt (Autopilot).</p>
                            </div>
                            <CompactToggleSwitch checked={current.requiresApproval} onChange={c => setCurrent(s => ({...s, requiresApproval: c}))} />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Hantera gamla inlägg</label>
                                <StyledSelect value={current.postLifetimeMode || 'duration'} onChange={e => setCurrent(s => ({...s, postLifetimeMode: e.target.value as any}))}>
                                    <option value="duration">Ta bort efter tid</option>
                                    <option value="replace">Ersätt föregående</option>
                                </StyledSelect>
                            </div>
                            {current.postLifetimeMode === 'duration' && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Antal dagar att visa</label>
                                    <StyledInput 
                                        type="number" 
                                        min="1" 
                                        value={String(current.postLifetimeDays || 7)} 
                                        onChange={e => setCurrent(s => ({...s, postLifetimeDays: parseInt(e.target.value)}))} 
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-4 mt-8 border-t border-slate-200 dark:border-slate-700 pt-4">
                    <SecondaryButton onClick={onClose} disabled={isSaving}>Avbryt</SecondaryButton>
                    <PrimaryButton 
                        onClick={handleSave} 
                        loading={isSaving} 
                        disabled={!current.name || (mode === 'create' && !current.topic) || (mode === 'remix' && !current.remixBasePostId)}
                    >
                        Spara automation
                    </PrimaryButton>
                </div>
            </div>
        </div>,
        portalRoot
    );
};