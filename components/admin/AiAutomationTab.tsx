
import React, { useState, useEffect } from 'react';
import { Organization, DisplayScreen, DisplayPost, AiAutomation, SuggestedPost } from '../../types';
import { listenToSuggestedPosts, updateSuggestedPost, updateDisplayScreen } from '../../services/firebaseService'; // Using direct updateDisplayScreen here for simplicity as it's a specific action
import { Card } from '../Card';
import { PrimaryButton, SecondaryButton, DestructiveButton } from '../Buttons';
import { CompactToggleSwitch, PencilIcon, TrashIcon, LoadingSpinnerIcon } from '../icons';
import { SkylieEmptyState } from '../SkylieEmptyState';
import { AiAutomationEditorModal } from '../AiAutomationEditorModal';
import { ConfirmDialog } from '../ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { DisplayPostRenderer } from '../DisplayPostRenderer';

interface AiAutomationTabProps {
    organization: Organization;
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
    onEditDisplayScreen: (screen: DisplayScreen, post?: DisplayPost) => void;
}

export const AiAutomationTab: React.FC<AiAutomationTabProps> = ({ organization, onUpdateOrganization, onEditDisplayScreen }) => {
    const { showToast } = useToast();
    const [editingAutomation, setEditingAutomation] = useState<AiAutomation | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [automationToDelete, setAutomationToDelete] = useState<AiAutomation | null>(null);

    const [suggestedPosts, setSuggestedPosts] = useState<SuggestedPost[]>([]);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(true);

    useEffect(() => {
        setIsLoadingSuggestions(true);
        const unsubscribe = listenToSuggestedPosts(organization.id, (posts) => {
            setSuggestedPosts(posts);
            setIsLoadingSuggestions(false);
        });
        return () => unsubscribe();
    }, [organization.id]);

    const handleSaveAutomation = async (automation: AiAutomation) => {
        const currentAutomations = organization.aiAutomations || [];
        const isNew = !currentAutomations.some(a => a.id === automation.id);
        const updatedAutomations = isNew
            ? [...currentAutomations, automation]
            : currentAutomations.map(a => a.id === automation.id ? automation : a);

        try {
            await onUpdateOrganization(organization.id, { aiAutomations: updatedAutomations });
            showToast({ message: `Automation ${isNew ? 'skapades' : 'uppdaterades'}.`, type: 'success' });
            setIsEditorOpen(false);
            setEditingAutomation(null);
        } catch (e) {
            showToast({ message: "Kunde inte spara automationen.", type: 'error' });
        }
    };

    const handleDeleteAutomation = async () => {
        if (!automationToDelete) return;
        const updatedAutomations = (organization.aiAutomations || []).filter(a => a.id !== automationToDelete.id);
        try {
            await onUpdateOrganization(organization.id, { aiAutomations: updatedAutomations });
            showToast({ message: "Automationen togs bort.", type: 'success' });
            setAutomationToDelete(null);
        } catch (e) {
            showToast({ message: "Kunde inte ta bort automationen.", type: 'error' });
        }
    };
    
    const handleEditSuggestion = (suggestion: SuggestedPost) => {
        const targetScreen = organization.displayScreens?.find(s => s.id === suggestion.targetScreenId);
        if (targetScreen) {
            const postToEdit: DisplayPost = {
                ...suggestion.postData,
                suggestionOriginId: suggestion.id,
            };
            onEditDisplayScreen(targetScreen, postToEdit);
        } else {
            showToast({ message: `Kanalen "${suggestion.targetScreenId}" kunde inte hittas.`, type: 'error' });
        }
    };

    const handleApproveSuggestion = async (suggestion: SuggestedPost) => {
        try {
            const screen = organization.displayScreens?.find(s => s.id === suggestion.targetScreenId);
            if (!screen) throw new Error("Målkanalen kunde inte hittas.");
            
            const newPost = { ...suggestion.postData, id: `post-${Date.now()}` };
            const updatedPosts = [...(screen.posts || []), newPost];
            
            await updateDisplayScreen(organization.id, screen.id, { posts: updatedPosts });
            await updateSuggestedPost(organization.id, suggestion.id, { status: 'approved', finalPostId: newPost.id });

            showToast({ message: `Inlägget "${newPost.internalTitle}" har publicerats!`, type: 'success' });
        } catch (e) {
             showToast({ message: `Kunde inte godkänna förslaget: ${e instanceof Error ? e.message : 'Okänt fel'}`, type: 'error' });
        }
    };

    const handleRejectSuggestion = async (suggestion: SuggestedPost) => {
         try {
            await updateSuggestedPost(organization.id, suggestion.id, { status: 'rejected' });
            showToast({ message: `Förslaget har arkiverats.`, type: 'info' });
        } catch (e) {
            showToast({ message: `Kunde inte arkivera förslaget.`, type: 'error' });
        }
    };
    
    const pendingSuggestions = suggestedPosts.filter(p => p.status === 'pending');

    return (
        <div className="space-y-8">
            <Card
                title="AI Automation"
                subTitle="Schemalägg AI:n att automatiskt skapa och föreslå nytt innehåll."
                actions={<PrimaryButton onClick={() => { setEditingAutomation(null); setIsEditorOpen(true); }}>Skapa ny automation</PrimaryButton>}
            >
                <div className="space-y-3">
                    {(organization.aiAutomations || []).length > 0 ? (
                        (organization.aiAutomations || []).map(auto => (
                            <div key={auto.id} className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg flex justify-between items-center border border-slate-200 dark:border-slate-700">
                                <div>
                                    <p className="font-semibold text-lg text-slate-900 dark:text-white">{auto.name}</p>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">{auto.topic}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <CompactToggleSwitch checked={auto.isEnabled} onChange={(checked) => handleSaveAutomation({...auto, isEnabled: checked })} />
                                    <SecondaryButton onClick={() => { setEditingAutomation(auto); setIsEditorOpen(true); }}><PencilIcon /></SecondaryButton>
                                    <DestructiveButton onClick={() => setAutomationToDelete(auto)}><TrashIcon /></DestructiveButton>
                                </div>
                            </div>
                        ))
                    ) : (
                        <SkylieEmptyState
                            title="Skapa din första automation!"
                            message="Låt AI:n jobba åt dig! Skapa en automation för att regelbundet få nya inläggsförslag, t.ex. 'Veckans Tips' eller 'Måndagsmotivation'."
                            action={{ text: 'Skapa ny automation', onClick: () => { setEditingAutomation(null); setIsEditorOpen(true); } }}
                        />
                    )}
                </div>
            </Card>

            <Card
                title="Inläggsförslag att granska"
                subTitle="Här är de senaste inläggen som AI:n har skapat baserat på dina automationer."
            >
                {isLoadingSuggestions ? (
                    <div className="flex justify-center p-8"><LoadingSpinnerIcon className="h-8 w-8 text-primary"/></div>
                ) : pendingSuggestions.length > 0 ? (
                    <div className="space-y-4">
                        {pendingSuggestions.map(suggestion => (
                           <div key={suggestion.id} className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row gap-4">
                                <div className="flex-shrink-0 w-full sm:w-32 h-20 sm:h-auto bg-black rounded-md overflow-hidden">
                                    <DisplayPostRenderer post={suggestion.postData} mode="preview" allTags={organization.tags} organization={organization}/>
                                </div>
                                <div className="flex-grow">
                                    <p className="font-semibold text-slate-900 dark:text-white">{suggestion.postData.internalTitle}</p>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{suggestion.postData.body}</p>
                                    <div className="text-xs font-semibold text-slate-400 mt-1">
                                        För kanal: <span className="font-bold text-slate-600 dark:text-slate-300">{organization.displayScreens?.find(s => s.id === suggestion.targetScreenId)?.name || 'Okänd'}</span>
                                    </div>
                                </div>
                                <div className="flex sm:flex-col gap-2 self-end sm:self-center flex-shrink-0">
                                     <PrimaryButton onClick={() => handleApproveSuggestion(suggestion)} className="bg-green-600 hover:bg-green-500 !py-2 !px-3 text-sm">Godkänn</PrimaryButton>
                                     <SecondaryButton onClick={() => handleEditSuggestion(suggestion)} className="!py-2 !px-3 text-sm">Redigera</SecondaryButton>
                                     <DestructiveButton onClick={() => handleRejectSuggestion(suggestion)} className="!py-2 !px-3 text-sm">Neka</DestructiveButton>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                     <SkylieEmptyState
                        title="Inga nya förslag just nu"
                        message="När dina automationer körs kommer nya inläggsförslag att dyka upp här för din granskning."
                    />
                )}
            </Card>

            {isEditorOpen && (
                <AiAutomationEditorModal
                    isOpen={isEditorOpen}
                    onClose={() => setIsEditorOpen(false)}
                    onSave={handleSaveAutomation}
                    automation={editingAutomation}
                    organization={organization}
                />
            )}
            
            <ConfirmDialog
                isOpen={!!automationToDelete}
                onClose={() => setAutomationToDelete(null)}
                onConfirm={handleDeleteAutomation}
                title="Ta bort automation"
            >
                Är du säker på att du vill ta bort automationen "{automationToDelete?.name}"?
            </ConfirmDialog>
        </div>
    );
};
