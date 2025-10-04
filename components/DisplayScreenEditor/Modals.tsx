import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { PostTemplate, DisplayPost, Organization, DisplayScreen, CampaignIdea } from '../../types';
import { LightBulbIcon, SparklesIcon, FacebookIcon } from '../icons';
import { PrimaryButton, SecondaryButton } from '../Buttons';

export const CampaignIdeaModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    isLoading: boolean;
    ideas: CampaignIdea[] | null;
    error: string | null;
    eventName: string | undefined;
    onCreatePost: (idea: CampaignIdea) => void;
}> = ({ isOpen, onClose, isLoading, ideas, error, eventName, onCreatePost }) => {
    if (!isOpen) return null;
    
    let portalRoot = document.getElementById('modal-root');
    if (!portalRoot) {
        portalRoot = document.createElement('div');
        portalRoot.id = 'modal-root';
        document.body.appendChild(portalRoot);
    }

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-2xl text-white shadow-2xl border border-slate-700 animate-fade-in max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-2">✨ AI-kampanjidéer för "{eventName}"</h2>
                {isLoading && (
                    <div className="text-center py-12">
                        <SparklesIcon className="h-10 w-10 text-primary animate-pulse mx-auto" />
                        <p className="mt-4 text-slate-300">Genererar kreativa idéer...</p>
                    </div>
                )}
                {error && (
                    <div className="text-center py-12">
                        <p className="text-red-400">Ett fel inträffade:</p>
                        <p className="text-slate-300 mt-2">{error}</p>
                    </div>
                )}
                {ideas && !isLoading && (
                    <div className="space-y-4 mt-6">
                        <p className="text-slate-300">Här är några förslag för att komma igång. Välj en för att skapa ett utkast till ett nytt inlägg.</p>
                        {ideas.map((idea, index) => (
                            <div key={index} className="bg-slate-700/50 p-4 rounded-lg border border-slate-600 flex justify-between items-start gap-4">
                                <div className="flex-grow">
                                    <h3 className="font-bold text-primary">{idea.headline}</h3>
                                    <p className="text-slate-300 text-sm mt-1">{idea.body}</p>
                                </div>
                                <PrimaryButton onClick={() => onCreatePost(idea)}>Använd denna idé</PrimaryButton>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex justify-end mt-6">
                    <SecondaryButton onClick={onClose}>Stäng</SecondaryButton>
                </div>
            </div>
        </div>,
        portalRoot
    );
};

export const ShareToFacebookModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    post: DisplayPost | null;
    organization: Organization;
    screen: DisplayScreen;
}> = ({ isOpen, onClose, post, organization, screen }) => {
    if (!isOpen || !post) return null;

    const embedUrl = `${window.location.origin}/embed/org/${organization.id}/screen/${screen.id}`;
    const shareText = post.headline || 'Kolla in detta!';
    const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(embedUrl)}&quote=${encodeURIComponent(shareText)}`;

    const handleShare = () => {
        window.open(facebookShareUrl, '_blank', 'noopener,noreferrer');
        onClose();
    };
    
    let portalRoot = document.getElementById('modal-root');
    if (!portalRoot) {
        portalRoot = document.createElement('div');
        portalRoot.id = 'modal-root';
        document.body.appendChild(portalRoot);
    }

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-lg text-white shadow-2xl border border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-2">Dela på Facebook</h2>
                <p className="text-slate-300 mb-6">Du är på väg att dela en länk till skyltfönstret "{screen.name}" med en text från inlägget "{post.internalTitle}".</p>
                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                    <p className="text-sm text-slate-400">Förhandsgranskning av text:</p>
                    <p className="font-semibold text-lg mt-1">{shareText}</p>
                </div>
                <div className="flex justify-end items-center gap-4 mt-8">
                    <SecondaryButton onClick={onClose}>Avbryt</SecondaryButton>
                    <PrimaryButton onClick={handleShare} className="bg-blue-600 hover:bg-blue-500">
                        <FacebookIcon className="h-5 w-5" /> Dela nu
                    </PrimaryButton>
                </div>
            </div>
        </div>,
        portalRoot
    );
};

export const CreatePostModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    templates: PostTemplate[];
    onCreate: (template?: PostTemplate) => void;
}> = ({ isOpen, onClose, templates, onCreate }) => {
    if (!isOpen) return null;
    let portalRoot = document.getElementById('modal-root');
    if (!portalRoot) {
        portalRoot = document.createElement('div');
        portalRoot.id = 'modal-root';
        document.body.appendChild(portalRoot);
    }
    
    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-4xl text-white shadow-2xl border border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-2">Skapa nytt inlägg</h2>
                <p className="text-slate-300 mb-6">Välj en startpunkt för ditt nya inlägg.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[60vh] overflow-y-auto pr-2">
                    <button onClick={() => onCreate()} className="h-48 p-6 bg-slate-700 hover:bg-slate-600 rounded-lg border-2 border-dashed border-slate-500 hover:border-primary text-left transition-all flex flex-col justify-center items-center group">
                        <span className="text-5xl text-slate-400 group-hover:text-primary transition-colors">+</span>
                        <span className="font-bold text-lg mt-2 text-slate-200">Tomt inlägg</span>
                        <p className="text-sm text-slate-400/80 text-center mt-1">Börja från noll med full kreativ frihet.</p>
                    </button>
                    {templates.map(template => (
                        <button key={template.id} onClick={() => onCreate(template)} className={`h-48 p-4 bg-slate-700 rounded-lg text-left transition-colors flex flex-col relative group hover:bg-slate-600 hover:ring-2 hover:ring-primary`}>
                            <h3 className="font-bold text-lg text-primary">{template.templateName}</h3>
                            <p className="text-sm text-slate-400 mt-1 line-clamp-2 flex-grow">{template.postData.headline}</p>
                            <span className="text-xs bg-slate-600 text-slate-300 px-2 py-1 rounded-full self-start">{template.postData.layout}</span>
                        </button>
                    ))}
                </div>
                <div className="flex justify-end mt-8 border-t border-slate-700 pt-4">
                    <SecondaryButton onClick={onClose}>Avbryt</SecondaryButton>
                </div>
            </div>
        </div>,
        portalRoot
    );
};

export const InputDialog: React.FC<{
  isOpen: boolean; onClose: () => void; onSave: (value: string) => void; title: string;
  labelText: string; initialValue?: string; saveText?: string;
}> = ({ isOpen, onClose, onSave, title, labelText, initialValue = '', saveText = 'Spara' }) => {
  const [value, setValue] = useState(initialValue);
  useEffect(() => { if (isOpen) setValue(initialValue); }, [isOpen, initialValue]);
  if (!isOpen) return null;
  let portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
      portalRoot = document.createElement('div');
      portalRoot.id = 'modal-root';
      document.body.appendChild(portalRoot);
  }
  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if(value.trim()) onSave(value.trim()); }} className="bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-md text-white shadow-2xl border border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-4">{title}</h2>
        <div>
          <label className="block text-sm font-medium text-slate-400">{labelText}</label>
          <input type="text" value={value} onChange={(e) => setValue(e.target.value)} className="w-full bg-slate-900/50 p-2.5 rounded-lg border border-slate-600 focus:ring-2 focus:ring-primary mt-1" autoFocus />
        </div>
        <div className="flex justify-end gap-4 mt-6">
          <SecondaryButton type="button" onClick={onClose}>Avbryt</SecondaryButton>
          <PrimaryButton disabled={!value.trim()} type="submit">{saveText}</PrimaryButton>
        </div>
      </form>
    </div>, portalRoot
  );
};

export const AICampaignGeneratorModal: React.FC<{
  isOpen: boolean; onClose: () => void; onGenerate: (prompt: string, postCount: number, files: File[], startDate?: string, endDate?: string) => Promise<void>;
  isGenerating: boolean; generationStatus: string;
}> = ({ isOpen, onClose, onGenerate, isGenerating, generationStatus }) => {
    const [prompt, setPrompt] = useState('');
    const [postCount, setPostCount] = useState(3);
    const [files, setFiles] = useState<File[]>([]);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(Array.from(e.target.files));
        }
    };

    const handleGenerate = () => {
        onGenerate(prompt, postCount, files, startDate, endDate);
    };

    if (!isOpen) return null;
    let portalRoot = document.getElementById('modal-root');
    if (!portalRoot) {
        portalRoot = document.createElement('div');
        portalRoot.id = 'modal-root';
        document.body.appendChild(portalRoot);
    }
    
    return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={isGenerating ? undefined : onClose}>
        <div className="bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-2xl text-white shadow-2xl border border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-bold mb-2">✨ Skapa kampanj med AI</h2>
            {isGenerating ? (
                <div className="text-center py-12">
                    <SparklesIcon className="h-12 w-12 text-primary animate-pulse mx-auto" />
                    <p className="mt-4 text-slate-300 text-lg">AI:n arbetar...</p>
                    <p className="text-slate-400">{generationStatus}</p>
                </div>
            ) : (
                <>
                    <p className="text-slate-300 mb-6">Beskriv målet med din kampanj. AI:n kommer att skapa en serie inlägg för att uppnå det.</p>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Kampanjmål</label>
                            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} placeholder="T.ex. 'Lansera vår nya yogaklass' eller 'En kampanj för Alla hjärtans dag'" className="w-full bg-slate-900 p-2 rounded-md border border-slate-600" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Antal inlägg</label>
                                <input type="number" value={postCount} onChange={e => setPostCount(parseInt(e.target.value, 10))} min="2" max="5" className="w-full bg-slate-900 p-2 rounded-md border border-slate-600" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Ladda upp egna bilder (valfritt)</label>
                                <input type="file" multiple accept="image/*" onChange={handleFileChange} className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"/>
                            </div>
                        </div>
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Startdatum (valfritt)</label>
                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-slate-900 p-2 rounded-md border border-slate-600" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Slutdatum (valfritt)</label>
                                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-slate-900 p-2 rounded-md border border-slate-600" />
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-4 mt-8 border-t border-slate-700 pt-4">
                        <SecondaryButton onClick={onClose}>Avbryt</SecondaryButton>
                        <PrimaryButton onClick={handleGenerate} disabled={!prompt.trim() || postCount < 1}>Generera Kampanj</PrimaryButton>
                    </div>
                </>
            )}
        </div>
    </div>, portalRoot);
};