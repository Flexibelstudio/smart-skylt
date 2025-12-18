import React from 'react';
import { DisplayPost, Organization } from '../../../types';
import { StyledInput } from '../../Forms'; // Tog bort StyledSelect då den inte används längre

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

    return (
        <div className="space-y-6">
            <h3 className="text-xl font-bold">Publicering & Detaljer</h3>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Visningstid (sekunder)</label>
                    <StyledInput type="number" min="5" value={String(post.durationSeconds)} onChange={e => handleFieldChange('durationSeconds', parseInt(e.target.value, 10))} />
                </div>
                
                {/* BORTTAGET: Övergångseffekt. 
                   Vi kör nu alltid "Hard Cut" för att garantera stabilitet på Sony-skärmar.
                   Koden är raderad för att inte förvirra användaren.
                */}

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Startdatum</label>
                        <StyledInput 
                            type="datetime-local" 
                            value={toDateTimeLocal(post.startDate)} 
                            onChange={e => handleFieldChange('startDate', e.target.value ? new Date(e.target.value).toISOString() : undefined)} 
                            className="dark-date-input"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Slutdatum (valfritt)</label>
                        <StyledInput 
                            type="datetime-local" 
                            value={toDateTimeLocal(post.endDate)} 
                            onChange={e => handleFieldChange('endDate', e.target.value ? new Date(e.target.value).toISOString() : undefined)}
                            className="dark-date-input"
                        />
                    </div>
                </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <h4 className="font-semibold">Taggar & QR-kod</h4>
                <div>
                    <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Välj taggar som ska visas</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {(organization.tags || []).map(tag => (
                            <label key={tag.id} className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer">
                                <input type="checkbox" checked={(post.tagIds || []).includes(tag.id)} onChange={e => handleTagChange(tag.id, e.target.checked)} className="h-4 w-4 rounded text-primary focus:ring-primary"/>
                                <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{tag.text}</span>
                            </label>
                        ))}
                    </div>
                </div>
                <div className="space-y-4">
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
        </div>
    );
};