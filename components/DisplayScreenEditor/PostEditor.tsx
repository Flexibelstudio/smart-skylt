
import React, { useState } from 'react';
import { DisplayPost, Organization, DisplayScreen, UserRole, PostTemplate } from '../../types';
import { PrimaryButton, SecondaryButton, DestructiveButton } from '../Buttons';
import { ConfirmDialog } from '../ConfirmDialog';
import { Step1_Layout } from './PostEditorSteps/Step1_Layout';
import { Step2_Content } from './PostEditorSteps/Step2_Content';
import { Step3_Atmosphere } from './PostEditorSteps/Step3_Atmosphere';
import { Step4_Publishing } from './PostEditorSteps/Step4_Publishing';
import { useToast } from '../../context/ToastContext';
import { updateSuggestedPost } from '../../services/firebaseService';
import { CreatePostModal } from './Modals'; 
import { useLocation } from '../../context/StudioContext';

export interface PostEditorProps {
    post: DisplayPost;
    originalPost: DisplayPost | null;
    screen: DisplayScreen;
    organization: Organization;
    onPostChange: (updatedPost: DisplayPost) => void;
    onSave: (postToSave: DisplayPost) => Promise<void>;
    onCancel: () => void;
    onUpdateOrganization: (organizationId: string, data: Partial<Organization>) => Promise<void>;
    userRole: UserRole;
}

// Det nya flödet: Layout -> Content -> Atmosphere -> Publishing
type EditorStep = 'layout' | 'content' | 'atmosphere' | 'publishing';

const StepButton: React.FC<{
    step: EditorStep;
    currentStep: EditorStep;
    onClick: () => void;
    title: string;
    stepNumber: number;
}> = ({ step, currentStep, onClick, title, stepNumber }) => {
    const isActive = step === currentStep;
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 p-3 text-base font-semibold border-b-2 transition-colors whitespace-nowrap ${isActive ? 'border-primary text-primary' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-primary/70'}`}
        >
            <span className={`flex items-center justify-center w-6 h-6 text-sm rounded-full border-2 ${isActive ? 'bg-primary border-primary text-white' : 'border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400'}`}>
                {stepNumber}
            </span>
            {title}
        </button>
    );
};

export const PostEditor: React.FC<PostEditorProps> = (props) => {
    const { post, originalPost, onPostChange, onSave, onCancel, screen, organization, onUpdateOrganization } = props;
    
    // Starta på 'layout' för nya inlägg, eller 'content' om det är ett befintligt (för snabbare redigering)
    const isNew = post.id.startsWith('new-');
    const [currentStep, setCurrentStep] = useState<EditorStep>(isNew ? 'layout' : 'content');
    
    const [isSaving, setIsSaving] = useState(false);
    const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
    const [isCreatePostModalOpen, setIsCreatePostModalOpen] = useState(false);
    const { showToast } = useToast();

    const steps: EditorStep[] = ['layout', 'content', 'atmosphere', 'publishing'];
    const currentStepIndex = steps.indexOf(currentStep);
    const isLastStep = currentStepIndex === steps.length - 1;

    const handleNext = () => {
        if (!isLastStep) {
            setCurrentStep(steps[currentStepIndex + 1]);
        }
    };

    const handlePrevious = () => {
        if (currentStepIndex > 0) {
            setCurrentStep(steps[currentStepIndex - 1]);
        }
    };

    const handleCancel = () => {
        const isDirty = originalPost && post && JSON.stringify(originalPost) !== JSON.stringify(post);
        if (isDirty) {
            setIsCancelConfirmOpen(true);
        } else {
            onCancel();
        }
    };
    
    const handleCreatePostFromTemplate = (template?: PostTemplate) => {
        if (!organization) return;
        const basePost = template ? { ...template.postData } : { layout: 'text-only' as const, durationSeconds: 10 };
        const newPost: DisplayPost = {
            id: `new-${Date.now()}`,
            internalTitle: template ? template.templateName : 'Nytt inlägg',
            ...basePost,
            headlineFontFamily: template?.postData.headlineFontFamily ?? organization.headlineFontFamily,
            bodyFontFamily: template?.postData.bodyFontFamily ?? organization.bodyFontFamily,
        };
        onPostChange(newPost); 
        setIsCreatePostModalOpen(false);
    };

    const handleConfirmCancel = () => {
        onCancel();
        setIsCancelConfirmOpen(false);
    };

    const handleSaveWrapper = async () => {
        setIsSaving(true);
        try {
            await onSave(post);
        } catch (e) {
            showToast({ message: `Kunde inte spara: ${e instanceof Error ? e.message : "Okänt fel"}`, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleRejectSuggestion = async () => {
        if (!post.suggestionOriginId || !organization) return;
        setIsSaving(true);
        try {
            await updateSuggestedPost(organization.id, post.suggestionOriginId, { status: 'rejected' });
            showToast({ message: "Förslaget har förkastats och AI:n har fått feedback.", type: 'info' });
            onCancel(); 
        } catch(e) {
            showToast({ message: "Kunde inte förkasta förslaget.", type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const renderStep = () => {
        switch (currentStep) {
            case 'layout':
                return <Step1_Layout post={post} onPostChange={onPostChange} screen={screen} />;
            case 'content':
                return <Step2_Content post={post} onPostChange={onPostChange} organization={organization} />;
            case 'atmosphere':
                return <Step3_Atmosphere post={post} onPostChange={onPostChange} organization={organization} screen={screen} onUpdateOrganization={onUpdateOrganization} />;
            case 'publishing':
                return <Step4_Publishing post={post} onPostChange={onPostChange} organization={organization} />;
            default:
                return null;
        }
    };

    return (
        <>
            <div className="space-y-6">
                <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="border-b border-slate-200 dark:border-slate-700 mb-6">
                        <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide">
                            <StepButton step="layout" currentStep={currentStep} onClick={() => setCurrentStep('layout')} title="Layout" stepNumber={1} />
                            <StepButton step="content" currentStep={currentStep} onClick={() => setCurrentStep('content')} title="Text" stepNumber={2} />
                            <StepButton step="atmosphere" currentStep={currentStep} onClick={() => setCurrentStep('atmosphere')} title="Media" stepNumber={3} />
                            <StepButton step="publishing" currentStep={currentStep} onClick={() => setCurrentStep('publishing')} title="Publicering" stepNumber={4} />
                        </div>
                    </div>

                    <div className="animate-fade-in">
                        {renderStep()}
                    </div>
                </div>

                <div className="flex justify-end items-center gap-4">
                    {post.suggestionOriginId && isLastStep && (
                        <DestructiveButton onClick={handleRejectSuggestion} disabled={isSaving}>Förkasta Förslag</DestructiveButton>
                    )}
                    <SecondaryButton onClick={handleCancel} disabled={isSaving}>Avbryt</SecondaryButton>
                    {currentStepIndex > 0 && (
                        <SecondaryButton onClick={handlePrevious} disabled={isSaving}>
                            Föregående
                        </SecondaryButton>
                    )}
                    {isLastStep ? (
                        <PrimaryButton onClick={handleSaveWrapper} loading={isSaving}>
                            {post.suggestionOriginId ? "Godkänn & Spara" : "Spara inlägg"}
                        </PrimaryButton>
                    ) : (
                        <PrimaryButton onClick={handleNext}>
                            Nästa
                        </PrimaryButton>
                    )}
                </div>
            </div>
            
             <CreatePostModal
                isOpen={isCreatePostModalOpen} onClose={() => setIsCreatePostModalOpen(false)}
                templates={organization.postTemplates || []} onCreate={handleCreatePostFromTemplate}
            />

            <ConfirmDialog
                isOpen={isCancelConfirmOpen}
                onClose={() => setIsCancelConfirmOpen(false)}
                onConfirm={handleConfirmCancel}
                title="Avbryt ändringar"
                confirmText="Ja, avbryt"
            >
                Är du säker på att du vill avbryta? Dina ändringar kommer inte att sparas.
            </ConfirmDialog>
        </>
    );
};
