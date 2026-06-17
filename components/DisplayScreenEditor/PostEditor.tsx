


import React, { useState } from 'react';
import { DisplayPost, Organization } from '../../../types';
import { StyledInput } from '../Forms';
import { SparklesIcon, HandThumbUpIcon } from '../../icons';
import { analyzePost } from '../../../services/geminiService';
import { useToast } from '../../../context/ToastContext';
import { PostAnalysisModal } from '../Modals';

const toDateTimeLocal = (isoString?: string): string => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '';

        const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        return localDate.toISOString().slice(0, 16);
    } catch (e) {
        return '';
    }
};

export const Step4_Publishing: React.FC<{
    post: DisplayPost;
    onPostChange: (updatedPost: DisplayPost) => void;
    organization: Organization;
}> = ({ post, onPostChange, organization }) => {
    const { showToast } = useToast();
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<{ score: number; critique: string; improvements: string[]; positive: string } | null>(null);
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);

    const handleFieldChange = (field: keyof DisplayPost, value: any) => {
        onPostChange({ ...post, [field]: value });
    };

    const handleTagChange = (tagId: string, checked: boolean) => {
        const currentTags = post.tagIds || [];
        const newTags = checked
            ? [...currentTags, tagId]
            : currentTags.filter(id => id !== tagId);
        handleFieldChange('tagIds', newTags);
    };

    const handleAnalyze = async () => {
        setIsAnalyzing(true);
        setIsAnalysisModalOpen(true);
        setAnalysisResult(null); // Clear previous result
        try {
            const result = await analyzePost(post, organization);
            setAnalysisResult(result);
        } catch (error) {
            showToast({ message: "Kunde inte analysera inlägget.", type: 'error' });
            setIsAnalysisModalOpen(false); // Close modal on error
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Analysis Banner */}
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-6 text-white shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="bg-white/20 p-3 rounded-full backdrop-blur-sm">
                        <HandThumbUpIcon className="w-8 h-8 text-yellow-300 animate-bounce" />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg">Skylies Omdöme</h3>
                        <p className="text-indigo-100 text-sm opacity-90">Låt Skylie dubbelkolla inlägget och ge en tumme upp!</p>
                    </div>
                </div>
                <button
                    onClick={handleAnalyze}
                    className="px-5 py-2.5 bg-white text-indigo-600 font-bold rounded-lg shadow hover:bg-indigo-50 transition-colors whitespace-nowrap flex items-center gap-2"
                >
                    <SparklesIcon className="w-4 h-4" />
                    Få feedback
                </button>
            </div>

            <div className="space-y-4">
                <h4 className="font-bold text-slate-800 dark:text-slate-200">Schema & Varaktighet</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1">
                        <label className="block text-sm font-semibold text-slate-550 dark:text-slate-400 mb-1">Visningstid (sekunder)</label>
                        <StyledInput 
                            type="number" 
                            min="3" 
                            value={post.durationSeconds !== undefined && post.durationSeconds !== null ? String(post.durationSeconds) : "15"} 
                            onChange={e => handleFieldChange('durationSeconds', parseInt(e.target.value, 10) || 15)} 
                        />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-semibold text-slate-550 dark:text-slate-400 mb-1">Startdatum</label>
                        <StyledInput 
                            type="datetime-local" 
                            value={toDateTimeLocal(post.startDate)} 
                            onChange={e => handleFieldChange('startDate', e.target.value ? new Date(e.target.value).toISOString() : undefined)} 
                            className="dark-date-input"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-550 dark:text-slate-400 mb-1">Slutdatum (valfritt)</label>
                        <StyledInput 
                            type="datetime-local" 
                            value={toDateTimeLocal(post.endDate)} 
                            onChange={e => handleFieldChange('endDate', e.target.value ? new Date(e.target.value).toISOString() : undefined)}
                            className="dark-date-input"
                        />
                    </div>
                </div>

                {/* Veckodagarsschemaläggning */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Begränsa till specifika veckodagar</label>
                            <span className="text-xs text-slate-400 dark:text-slate-500">Om inga väljs visas inlägget alla dagar</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                const currentDays = post.scheduleDays || [];
                                if (currentDays.length === 7) {
                                    handleFieldChange('scheduleDays', []);
                                } else {
                                    handleFieldChange('scheduleDays', [1, 2, 3, 4, 5, 6, 0]);
                                }
                            }}
                            className="text-xs font-bold text-indigo-650 hover:text-indigo-500 dark:text-indigo-400"
                        >
                            {(post.scheduleDays || []).length === 7 ? 'Spara ingen' : 'Välj alla'}
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {[
                            { label: 'Mån', value: 1 },
                            { label: 'Tis', value: 2 },
                            { label: 'Ons', value: 3 },
                            { label: 'Tor', value: 4 },
                            { label: 'Fre', value: 5 },
                            { label: 'Lör', value: 6 },
                            { label: 'Sön', value: 0 },
                        ].map(day => {
                            const isSelected = (post.scheduleDays || []).includes(day.value);
                            return (
                                <button
                                    type="button"
                                    key={day.value}
                                    onClick={() => {
                                        const currentDays = post.scheduleDays || [];
                                        const nextDays = isSelected
                                            ? currentDays.filter(d => d !== day.value)
                                            : [...currentDays, day.value];
                                        handleFieldChange('scheduleDays', nextDays);
                                    }}
                                    className={`w-11 h-9 rounded-xl text-xs font-extrabold border transition-all active:scale-95 ${
                                        isSelected
                                            ? 'border-indigo-500 bg-indigo-500 text-white shadow-sm ring-2 ring-indigo-500/20'
                                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-650 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                                    }`}
                                >
                                    {day.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Tidsspannsschemaläggning under dygnet */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Specifika tidsspann under dygnet</label>
                            <span className="text-xs text-slate-400 dark:text-slate-500">Om inga tider anges visas inlägget dygnet runt</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                const currentRanges = post.scheduleTimeRanges || [];
                                handleFieldChange('scheduleTimeRanges', [...currentRanges, { startTime: '08:00', endTime: '17:00' }]);
                            }}
                            className="px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 border border-slate-250 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 rounded-lg flex items-center gap-1 transition-all"
                        >
                            + Lägg till tid
                        </button>
                    </div>

                    {(post.scheduleTimeRanges || []).length > 0 ? (
                        <div className="space-y-2">
                            {(post.scheduleTimeRanges || []).map((range, index) => (
                                <div key={index} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                                    <div className="flex items-center gap-2 flex-grow">
                                        <div className="w-1/2">
                                            <input
                                                type="time"
                                                value={range.startTime || '08:00'}
                                                onChange={e => {
                                                    const nextRanges = [...(post.scheduleTimeRanges || [])];
                                                    nextRanges[index] = { ...range, startTime: e.target.value };
                                                    handleFieldChange('scheduleTimeRanges', nextRanges);
                                                }}
                                                className="w-full bg-white dark:bg-slate-800 border border-slate-250 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-1 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <span className="text-xs font-bold text-slate-400">till</span>
                                        <div className="w-1/2">
                                            <input
                                                type="time"
                                                value={range.endTime || '17:00'}
                                                onChange={e => {
                                                    const nextRanges = [...(post.scheduleTimeRanges || [])];
                                                    nextRanges[index] = { ...range, endTime: e.target.value };
                                                    handleFieldChange('scheduleTimeRanges', nextRanges);
                                                }}
                                                className="w-full bg-white dark:bg-slate-800 border border-slate-250 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-1 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>
                                    
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const nextRanges = (post.scheduleTimeRanges || []).filter((_, i) => i !== index);
                                            handleFieldChange('scheduleTimeRanges', nextRanges);
                                        }}
                                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-400 hover:text-red-550 rounded-lg transition-colors"
                                        title="Ta bort tidsspann"
                                    >
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-4 bg-slate-50/40 dark:bg-slate-900/10 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                            <span className="text-xs text-slate-400 dark:text-slate-500">Standard: inlägget visas dygnet runt</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <h4 className="font-bold text-slate-800 dark:text-slate-200">Extrafunktioner</h4>
                
                <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Taggar & Stämplar</label>
                    {organization.tags && organization.tags.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {organization.tags.map(tag => (
                                <label key={tag.id} className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer">
                                    <input type="checkbox" checked={(post.tagIds || []).includes(tag.id)} onChange={e => handleTagChange(tag.id, e.target.checked)} className="h-4 w-4 rounded text-primary focus:ring-primary"/>
                                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{tag.text}</span>
                                </label>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-slate-400 italic">Inga taggar skapade än.</p>
                    )}
                </div>

                <div className="space-y-4 mt-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">QR-kod (valfritt)</label>
                        <StyledInput type="url" placeholder="URL för QR-kod" value={post.qrCodeUrl || ''} onChange={e => handleFieldChange('qrCodeUrl', e.target.value.trim() ? e.target.value.trim() : undefined)} />
                    </div>
                    {post.qrCodeUrl && (
                        <div>
                            <div className="flex justify-between mb-1">
                                <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Storlek ({post.qrWidth || 12}%)</label>
                            </div>
                            <input
                                type="range"
                                min="5"
                                max="50"
                                step="1"
                                value={post.qrWidth || 12}
                                onChange={e => handleFieldChange('qrWidth', parseInt(e.target.value, 10))}
                                className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer"
                            />
                            <p className="text-xs text-slate-500 mt-1">Du kan dra och släppa QR-koden i förhandsgranskningen för att flytta den.</p>
                        </div>
                    )}
                </div>
            </div>

            <PostAnalysisModal
                isOpen={isAnalysisModalOpen}
                onClose={() => setIsAnalysisModalOpen(false)}
                result={analysisResult}
                isLoading={isAnalyzing}
            />
        </div>
    );
};
