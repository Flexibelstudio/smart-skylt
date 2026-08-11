
import React, { useState } from 'react';
import { DisplayPost, Organization, DisplayScreen, UserRole, PostTemplate } from '../../types';
import { PrimaryButton, SecondaryButton, DestructiveButton } from '../Buttons';
import { ConfirmDialog } from '../ConfirmDialog';
import { Step1_Layout } from './PostEditorSteps/Step1_Layout';
import { Step2_Content } from './PostEditorSteps/Step2_Content';
import { Step2_AiAd } from './PostEditorSteps/Step2_AiAd';
import { Step3_Atmosphere } from './PostEditorSteps/Step3_Atmosphere';
import { Step4_Publishing } from './PostEditorSteps/Step4_Publishing';
import { useToast } from '../../context/ToastContext';
import { updateSuggestedPost } from '../../services/firebaseService';
import { InputDialog } from './Modals'; 
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
    const isNew = post?.id?.startsWith('new-') || false;
    const [currentStep, setCurrentStep] = useState<EditorStep>(isNew ? 'layout' : 'content');
    
    const [isSaving, setIsSaving] = useState(false);
    const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
    const [isSaveTemplateModalOpen, setIsSaveTemplateModalOpen] = useState(false);
    const [isNoDateConfirmOpen, setIsNoDateConfirmOpen] = useState(false);
    const { showToast } = useToast();

    const allSteps: EditorStep[] = ['layout', 'content', 'atmosphere', 'publishing'];
    const aiSteps: EditorStep[] = ['layout', 'content', 'publishing'];
    const steps = post.layout === 'ai-ad' ? aiSteps : allSteps;
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
            internalTitle: template ? template.templateName : 'Nytt inlägg',
            ...basePost,
            id: `new-${Date.now()}`,
            headlineFontFamily: template?.postData.headlineFontFamily ?? organization.headlineFontFamily,
            bodyFontFamily: template?.postData.bodyFontFamily ?? organization.bodyFontFamily,
        };
        onPostChange(newPost); 
    };

    const handleSaveTemplate = async (templateName: string) => {
        setIsSaveTemplateModalOpen(false);
        try {
            const { id, startDate, endDate, internalTitle, ...postDataWithoutId } = post;
            const newTemplate: PostTemplate = {
                id: `template-${Date.now()}`,
                templateName,
                postData: postDataWithoutId
            };
            const updatedTemplates = [...(organization.postTemplates || []), newTemplate];
            await onUpdateOrganization(organization.id, { postTemplates: updatedTemplates });
            showToast({ message: 'Mallen har sparats!', type: 'success' });
        } catch (error) {
            showToast({ message: 'Kunde inte spara mallen.', type: 'error' });
        }
    };

    const handleConfirmCancel = () => {
        onCancel();
        setIsCancelConfirmOpen(false);
    };

    const doSave = async (postToSave: typeof post): Promise<boolean> => {
        setIsSaving(true);
        try {
            await onSave(postToSave);
            return true;
        } catch (e) {
            showToast({ message: `Kunde inte spara: ${e instanceof Error ? e.message : "Okänt fel"}`, type: 'error' });
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveWrapper = async () => {
        if (!post.startDate) {
            setIsNoDateConfirmOpen(true);
            return;
        }
        await doSave(post);
    };

    const handlePublishNow = async () => {
        setIsNoDateConfirmOpen(false);
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        await doSave({ ...post, startDate: today, ...(post.status === 'draft' ? { status: 'active' as const } : {}) });
    };

    const handleSaveAsDraft = async () => {
        setIsNoDateConfirmOpen(false);
        const ok = await doSave(post);
        if (ok) {
            showToast({ message: "Sparat som utkast — inlägget visas inte på skyltfönstret förrän det får ett startdatum.", type: 'info' });
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
        if (post.layout === 'ai-ad' && currentStep !== 'layout' && currentStep !== 'publishing') {
            return <Step2_AiAd post={post} onPostChange={onPostChange} organization={organization} screen={screen} />;
        }

        switch (currentStep) {
            case 'layout':
                return (
                    <Step1_Layout 
                        post={post} 
                        onPostChange={(updatedPost) => {
                            onPostChange(updatedPost);
                            if (updatedPost.layout === 'ai-ad' && post.layout !== 'ai-ad') {
                                setCurrentStep('content');
                            }
                        }} 
                        screen={screen} 
                    />
                );
            case 'content':
                return <Step2_Content post={post} onPostChange={onPostChange} organization={organization} screen={screen} />;
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
                            {post.layout === 'ai-ad' ? (
                                <StepButton step="content" currentStep={currentStep === 'atmosphere' ? 'content' : currentStep} onClick={() => setCurrentStep('content')} title="Skapa med AI" stepNumber={2} />
                            ) : (
                                <>
                                    <StepButton step="content" currentStep={currentStep} onClick={() => setCurrentStep('content')} title="Text" stepNumber={2} />
                                    <StepButton step="atmosphere" currentStep={currentStep} onClick={() => setCurrentStep('atmosphere')} title="Media" stepNumber={3} />
                                </>
                            )}
                            <StepButton step="publishing" currentStep={currentStep} onClick={() => setCurrentStep('publishing')} title="Publicering" stepNumber={post.layout === 'ai-ad' ? 3 : 4} />
                        </div>
                    </div>

                    <div className="animate-fade-in">
                        {renderStep()}
                    </div>
                </div>

                <div className="flex justify-between items-center mt-6">
                    <div>
                        {isLastStep && post.layout !== 'ai-ad' && (
                            <SecondaryButton onClick={() => setIsSaveTemplateModalOpen(true)} disabled={isSaving}>
                                Spara som mall
                            </SecondaryButton>
                        )}
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
            </div>
            
            <InputDialog
                isOpen={isSaveTemplateModalOpen}
                onClose={() => setIsSaveTemplateModalOpen(false)}
                onSave={handleSaveTemplate}
                title="Spara som mall"
                labelText="Namn på mallen"
                initialValue={post.internalTitle || 'Ny mall'}
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

            {isNoDateConfirmOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={() => setIsNoDateConfirmOpen(false)}>
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
                        <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-2">Inget startdatum valt</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mb-5">
                            Utan startdatum sparas inlägget som ett utkast och <strong>visas inte</strong> på skyltfönstret. Vill du publicera det från och med idag istället?
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2 justify-end">
                            <button type="button" onClick={() => setIsNoDateConfirmOpen(false)} className="px-4 py-2 rounded-lg text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">Fortsätt redigera</button>
                            <button type="button" onClick={handleSaveAsDraft} className="px-4 py-2 rounded-lg text-sm font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">Spara som utkast</button>
                            <button type="button" onClick={handlePublishNow} className="px-4 py-2 rounded-lg text-sm font-bold bg-teal-600 text-white hover:bg-teal-500 transition-colors">Publicera från idag</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
