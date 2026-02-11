import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CustomPage, CustomPageTab } from '../types';
import { MarkdownRenderer } from './CustomContentScreen';
import { formatPageWithAI, generatePageContentFromPrompt } from '../services/geminiService';
import { LoadingSpinnerIcon } from './icons';
import { useToast } from '../context/ToastContext';
import { PrimaryButton } from './Buttons';
import { AIStatusIndicator } from './HelpBot';

// FIX: Define props interface for the component.
interface CustomPageEditorScreenProps {
    onSave: (page: CustomPage) => Promise<void>;
    onCancel: () => void;
    pageToEdit: CustomPage | null;
}

const createNewTab = (): CustomPageTab => ({
    id: `tab-${Date.now()}`,
    title: 'Ny Flik',
    content: ''
});

export const CustomPageEditorScreen: React.FC<CustomPageEditorScreenProps> = ({ onSave, onCancel, pageToEdit }) => {
    const [title, setTitle] = useState('');
    const [tabs, setTabs] = useState<CustomPageTab[]>([]);
    const [activeTabIndex, setActiveTabIndex] = useState(0);

    const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
    const [isProcessing, setIsProcessing] = useState(false);
    const { showToast } = useToast();
    
    const [aiModalState, setAiModalState] = useState<'closed' | 'choice' | 'generate'>('closed');
    const [aiPrompt, setAiPrompt] = useState('');
    const [generatedAiText, setGeneratedAiText] = useState('');
    const [aiError, setAiError] = useState('');
    
    useEffect(() => {
        if (pageToEdit) {
            setTitle(pageToEdit.title);
            setTabs(pageToEdit.tabs && pageToEdit.tabs.length > 0 ? pageToEdit.tabs : [createNewTab()]);
            setActiveTabIndex(0);
        } else {
            setTitle('');
            setTabs([createNewTab()]);
            setActiveTabIndex(0);
        }
        setViewMode('edit');
    }, [pageToEdit]);

    const handleSave = async () => {
        setIsProcessing(true);
        const pageData: CustomPage = {
            id: pageToEdit?.id || `custom-page-${Date.now()}`,
            title: title.trim(),
            tabs: tabs,
        };
        await onSave(pageData);
        showToast({ message: "Sidan sparades.", type: "success" });
        // isProcessing will be implicitly false on navigation
    };
    
    const handleFormatWithAI = async () => {
        setAiModalState('closed');
        const activeTab = tabs[activeTabIndex];
        if (!activeTab || !activeTab.content.trim()) {
            showToast({ message: "Det finns inget innehåll i den valda fliken att formatera.", type: 'info' });
            return;
        }
        setIsProcessing(true);
        try {
            const formattedContent = await formatPageWithAI(activeTab.content);
            const newTabs = [...tabs];
            newTabs[activeTabIndex] = { ...newTabs[activeTabIndex], content: formattedContent };
            setTabs(newTabs);
            setViewMode('preview');
            showToast({ message: "Innehållet har formaterats med AI.", type: 'success' });
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : "Ett fel uppstod vid AI-formattering.", type: 'error'});
        } finally {
            setIsProcessing(false);
        }
    };

    const handleGenerateWithAI = async () => {
        if (!aiPrompt.trim()) return;
        setIsProcessing(true);
        setAiError('');
        setGeneratedAiText('');
        try {
            const newContent = await generatePageContentFromPrompt(aiPrompt);
            setGeneratedAiText(newContent);
        } catch (error) {
            setAiError(error instanceof Error ? error.message : "Ett fel uppstod vid AI-generering.");
        } finally {
            setIsProcessing(false);
        }
    }

    const handleUseGeneratedText = () => {
        const newTabs = [...tabs];
        newTabs[activeTabIndex] = { ...newTabs[activeTabIndex], content: generatedAiText };
        setTabs(newTabs);
        setAiModalState('closed');
        setViewMode('preview');
    };
    
    const handleUpdateActiveTab = (field: 'title' | 'content', value: string) => {
        const newTabs = [...tabs];
        newTabs[activeTabIndex] = { ...newTabs[activeTabIndex], [field]: value };
        setTabs(newTabs);
    };

    const handleAddTab = () => {
        const newTab = createNewTab();
        const newTabs = [...tabs, newTab];
        setTabs(newTabs);
        setActiveTabIndex(newTabs.length - 1); // Switch to the new tab
    };

    const handleRemoveTab = (indexToRemove: number) => {
        if (tabs.length <= 1) {
            showToast({ message: "Du måste ha minst en flik.", type: 'info' });
            return;
        }
        if (window.confirm(`Är du säker på att du vill ta bort fliken "${tabs[indexToRemove].title}"?`)) {
            const newTabs = tabs.filter((_, index) => index !== indexToRemove);
            setTabs(newTabs);
            // Adjust active tab index if needed
            if (activeTabIndex >= indexToRemove) {
                setActiveTabIndex(Math.max(0, activeTabIndex - 1));
            }
        }
    };

    const isSavable = useMemo(() => {
        return title.trim() !== '' && tabs.length > 0 && tabs.every(t => t.title.trim() !== '');
    }, [title, tabs]);
    
    const activeTab = tabs[activeTabIndex];

    return (
        <div className="w-full max-w-7xl mx-auto space-y-6 pb-28 animate-fade-in">
            <AIStatusIndicator isThinking={isProcessing} statusText={isProcessing ? "AI arbetar..." : undefined} />
             <div className="bg-white dark:bg-gray-800 p-6 rounded-lg space-y-6 border border-slate-200 dark:border-gray-700">
                <div className="flex justify-between items-center flex-wrap gap-4">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{pageToEdit ? 'Redigera infosida' : 'Skapa ny infosida'}</h2>
                     <div className="flex items-center gap-4">
                        {viewMode === 'preview' && (
                             <button onClick={() => setViewMode('edit')} className="bg-slate-200 dark:bg-gray-600 hover:bg-slate-300 dark:hover:bg-gray-500 text-slate-800 dark:text-white font-semibold py-2 px-4 rounded-lg text-sm">
                                Redigeringsläge
                            </button>
                        )}
                        <PrimaryButton
                            onClick={() => setAiModalState('choice')}
                            disabled={isProcessing}
                            loading={isProcessing}
                            className="bg-purple-600 hover:bg-purple-500"
                        >
                            {!isProcessing && '✨'} AI-magi
                        </PrimaryButton>
                    </div>
                </div>
                
                 <div>
                    <label htmlFor="page-title" className="block text-sm font-medium text-slate-500 dark:text-gray-300 mb-1">Sidans Huvudtitel</label>
                    <input
                        id="page-title"
                        type="text"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="Titel som visas på knappen i coach-menyn"
                        className="w-full bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white p-3 rounded-md border border-slate-300 dark:border-gray-600 focus:ring-2 focus:ring-primary focus:outline-none text-xl"
                    />
                </div>
                
                 {/* Content area */}
                <div className="flex flex-col gap-6">
                   {/* TAB CONTROLS */}
                    <div className="border-b border-slate-200 dark:border-gray-600">
                        <div className="flex items-center gap-2 overflow-x-auto">
                           {tabs.map((tab, index) => (
                               <div key={tab.id} className="relative">
                                    <button
                                      onClick={() => setActiveTabIndex(index)}
                                      className={`px-4 py-3 font-semibold transition-colors focus:outline-none whitespace-nowrap rounded-t-md ${activeTabIndex === index ? 'bg-slate-100 dark:bg-gray-700 text-primary' : 'text-slate-500 dark:text-gray-400 hover:bg-slate-200/50 dark:hover:bg-gray-700/50'}`}
                                    >
                                      {tab.title || 'Namnlös flik'}
                                    </button>
                                     <button
                                        onClick={() => handleRemoveTab(index)}
                                        className="absolute top-0 right-0 p-1 text-slate-500 hover:text-red-400 transition-colors"
                                        aria-label="Ta bort flik"
                                        title="Ta bort flik"
                                    >
                                        &times;
                                    </button>
                               </div>
                           ))}
                            <button onClick={handleAddTab} className="p-3 text-primary hover:bg-slate-200/50 dark:hover:bg-gray-700/50 rounded-md">+</button>
                        </div>
                    </div>
                    
                    {/* EDITOR/PREVIEW GRID */}
                    <div className={`grid grid-cols-1 ${viewMode === 'preview' ? 'lg:grid-cols-2' : ''} gap-6`}>
                        {/* Left Pane: Editor */}
                        <div className="flex flex-col gap-4 min-h-[50vh]">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Redigera Flik: <span className="text-primary">{activeTab?.title}</span></h3>
                            <div>
                                <label htmlFor="tab-title" className="block text-sm font-medium text-slate-500 dark:text-gray-400 mb-1">Flikens Titel</label>
                                <input
                                    id="tab-title"
                                    type="text"
                                    value={activeTab?.title || ''}
                                    onChange={e => handleUpdateActiveTab('title', e.target.value)}
                                    className="w-full bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white p-3 rounded-md border border-slate-300 dark:border-gray-600 focus:ring-2 focus:ring-primary focus:outline-none"
                                />
                            </div>
                            <div className="flex flex-col flex-grow">
                                <label htmlFor="page-content" className="block text-sm font-medium text-slate-500 dark:text-gray-400 mb-1">Innehåll (Stöder Markdown)</label>
                                <textarea
                                    id="page-content"
                                    value={activeTab?.content || ''}
                                    onChange={e => handleUpdateActiveTab('content', e.target.value)}
                                    placeholder="Skriv eller klistra in innehållet för sidan här...&#10;Använd sedan 'AI-magi' för att formatera och snygga till texten."
                                    className="w-full flex-grow bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white p-3 rounded-md border border-slate-300 dark:border-gray-600 focus:ring-2 focus:ring-primary focus:outline-none font-mono resize-none"
                                />
                            </div>
                        </div>

                        {/* Right Pane: Preview */}
                         {viewMode === 'preview' && (
                            <div className="flex flex-col gap-2 min-h-[50vh]">
                                <label className="block text-lg font-semibold text-slate-900 dark:text-white flex-shrink-0">Förhandsgranskning</label>
                                <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-gray-600 flex-grow">
                                    <div className="h-full overflow-y-auto">
                                        <MarkdownRenderer content={activeTab?.content || ''} className="prose prose-lg dark:prose-invert max-w-none p-6" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-black/80 backdrop-blur-sm p-4 border-t border-slate-200 dark:border-gray-700 z-10">
                <div className="max-w-7xl mx-auto flex justify-end gap-4">
                    <button onClick={onCancel} className="bg-slate-200 dark:bg-gray-600 hover:bg-slate-300 dark:hover:bg-gray-500 text-slate-800 dark:text-white font-bold py-3 px-6 rounded-lg transition-colors">Avbryt</button>
                    <PrimaryButton 
                        onClick={handleSave} 
                        disabled={!isSavable}
                        loading={isProcessing}
                        className="disabled:bg-gray-500 disabled:cursor-not-allowed"
                        title={!isSavable ? "Sidan måste ha en huvudtitel och varje flik måste ha en titel." : ""}
                    >
                        Spara sida
                    </PrimaryButton>
                </div>
            </div>

             {/* AI Modal */}
            {aiModalState !== 'closed' && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setAiModalState('closed')}>
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-2xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
                        {aiModalState === 'choice' && (
                             <div>
                                <h2 className="text-2xl font-bold mb-4">✨ AI-magi</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-6">Vad vill du göra?</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <button onClick={handleFormatWithAI} className="bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 p-6 rounded-lg text-left transition-colors">
                                        <h3 className="font-bold text-lg text-primary">Formatera befintlig text</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Strukturera och snygga till texten som redan finns i redigeraren.</p>
                                    </button>
                                    <button onClick={() => setAiModalState('generate')} className="bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 p-6 rounded-lg text-left transition-colors">
                                        <h3 className="font-bold text-lg text-primary">Skapa ny text från idé</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Generera helt nytt innehåll baserat på en kort beskrivning. Ersätter befintlig text.</p>
                                    </button>
                                </div>
                            </div>
                        )}
                        {aiModalState === 'generate' && (
                            <div>
                                <h2 className="text-2xl font-bold mb-2">Skapa ny text från idé</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-6">Beskriv vad sidan ska handla om, så skriver AI:n ett utkast åt dig.</p>
                                <textarea
                                    value={aiPrompt}
                                    onChange={e => setAiPrompt(e.target.value)}
                                    placeholder="T.ex. 'en välkomstsida för nya medlemmar som förklarar våra öppettider och hur man bokar pass'"
                                    className="w-full h-24 bg-white dark:bg-slate-900/50 p-3 rounded-md border border-slate-300 dark:border-slate-600"
                                    disabled={isProcessing}
                                />
                                <div className="flex justify-end gap-2 mt-2">
                                    <button onClick={() => setAiModalState('choice')} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-4 py-2">Tillbaka</button>
                                    <PrimaryButton onClick={handleGenerateWithAI} disabled={!aiPrompt.trim()} loading={isProcessing} className="bg-purple-600 hover:bg-purple-500">
                                         Generera text
                                    </PrimaryButton>
                                </div>
                                {generatedAiText && !isProcessing && (
                                    <div className="mt-4 space-y-4">
                                        <h3 className="font-semibold">Genererat förslag:</h3>
                                        <div className="max-h-60 overflow-y-auto bg-white dark:bg-slate-900/50 p-4 rounded-md border border-slate-300 dark:border-slate-600">
                                            <MarkdownRenderer content={generatedAiText} className="prose prose-sm dark:prose-invert max-w-none"/>
                                        </div>
                                        <button onClick={handleUseGeneratedText} className="w-full bg-primary font-bold py-3 rounded-lg hover:brightness-95">Använd den här texten</button>
                                    </div>
                                )}
                                {aiError && <p className="text-red-400 mt-2 text-sm">{aiError}</p>}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};