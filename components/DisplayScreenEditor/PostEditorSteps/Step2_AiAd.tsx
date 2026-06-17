import React, { useState, useEffect } from 'react';
import { DisplayPost, Organization, DisplayScreen } from '../../../types';
import { generateCompletePost } from '../../../services/geminiService';
import { uploadPostAsset } from '../../../services/firebaseService';
import { SparklesIcon, LoadingSpinnerIcon, PaperAirplaneIcon } from '@/components/icons';
import { useToast } from '../../../context/ToastContext';

// Helper to convert base64 to Blob
const dataUriToBlob = (dataURI: string) => {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
};

interface Step2_AiAdProps {
    post: DisplayPost;
    onPostChange: (updatedPost: DisplayPost) => void;
    organization: Organization | null;
    screen: DisplayScreen;
}

export const Step2_AiAd: React.FC<Step2_AiAdProps> = ({ post, onPostChange, organization, screen }) => {
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [history, setHistory] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
    const { showToast } = useToast();

    // If the post is already generated, we might have history or just show it.
    // For now, if it's empty, we show a big prompt input.
    const isInitial = !post.headline && !post.imageUrl && !post.body && history.length === 0;

    const handleGenerate = async () => {
        if (!prompt.trim() || !organization) return;

        setIsGenerating(true);
        const userPrompt = prompt;
        setPrompt('');
        
        setHistory(prev => [...prev, { role: 'user', text: userPrompt }]);

        try {
            // Include history in the prompt for context
            const fullPrompt = history.length > 0 
                ? `Tidigare konversation:\n${history.map(h => `${h.role === 'user' ? 'Användare' : 'AI'}: ${h.text}`).join('\n')}\n\nNuvarande inläggsdata: ${JSON.stringify(post)}\n\nAnvändarens nya instruktion: ${userPrompt}\n\nUppdatera inlägget baserat på instruktionen.`
                : userPrompt;

            const result = await generateCompletePost(fullPrompt, organization, screen.aspectRatio, undefined, undefined, undefined, undefined, true);
            
            let updates = { ...result.postData };
            delete updates.id; // Ensure we don't overwrite the post ID
            
            // If we have a new image, upload it
            if (result.imageData) {
                try {
                    const blob = dataUriToBlob(`data:${result.imageData.mimeType};base64,${result.imageData.imageBytes}`);
                    const file = new File([blob], `ai-generated-image.jpg`, { type: 'image/jpeg' });
                    const url = await uploadPostAsset(organization.id, post.id, file, () => {});
                    updates.imageUrl = url;
                } catch (uploadError) {
                    console.error("Failed to upload AI image to storage", uploadError);
                    updates.imageUrl = `data:${result.imageData.mimeType};base64,${result.imageData.imageBytes}`;
                }
            }

            updates.layout = 'ai-ad';

            onPostChange({ ...post, ...updates });
            setHistory(prev => [...prev, { role: 'ai', text: 'Jag har uppdaterat annonsen enligt dina önskemål. Vad tycker du?' }]);

        } catch (error) {
            console.error("Error generating AI ad:", error);
            showToast({ message: "Ett fel uppstod vid genereringen. Försök igen om en liten stund.", type: 'error' });
            setHistory(prev => [...prev, { role: 'ai', text: 'Ett fel uppstod när jag försökte skapa annonsen. Försök igen.' }]);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            {isInitial ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                    <SparklesIcon className="w-16 h-16 text-purple-500 mb-6 animate-pulse" />
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Skapa en AI-annons</h2>
                    <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-md">
                        Beskriv vad du vill ha en annons för. Jag skapar en professionell annons med bild, text och design anpassad efter ditt varumärke.
                    </p>
                    <div className="w-full max-w-2xl relative">
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="T.ex. 'En sommarkampanj för våra nya löparskor med 20% rabatt...'"
                            className="w-full p-4 pr-16 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white resize-none focus:ring-2 focus:ring-purple-500"
                            rows={4}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleGenerate();
                                }
                            }}
                        />
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || !prompt.trim()}
                            className="absolute bottom-4 right-4 p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                        >
                            {isGenerating ? <LoadingSpinnerIcon className="w-5 h-5" /> : <PaperAirplaneIcon className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col h-full gap-6">
                    {/* Chat Area */}
                    <div className="w-full flex-1 flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
                            <SparklesIcon className="w-5 h-5 text-purple-500" />
                            <h3 className="font-bold text-slate-900 dark:text-white">AI Annonsskapare</h3>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {history.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] p-3 rounded-2xl ${
                                        msg.role === 'user' 
                                            ? 'bg-purple-600 text-white rounded-tr-sm' 
                                            : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded-tl-sm'
                                    }`}>
                                        <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                                    </div>
                                </div>
                            ))}
                            {isGenerating && (
                                <div className="flex justify-start">
                                    <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-2xl rounded-tl-sm flex items-center gap-3">
                                        <LoadingSpinnerIcon className="w-5 h-5 text-purple-500" />
                                        <span className="text-sm text-slate-600 dark:text-slate-300">Skapar annons...</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                            <div className="relative">
                                <textarea
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    placeholder="Be om ändringar..."
                                    className="w-full p-3 pr-12 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white resize-none focus:ring-2 focus:ring-purple-500 text-sm"
                                    rows={2}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleGenerate();
                                        }
                                    }}
                                />
                                <button
                                    onClick={handleGenerate}
                                    disabled={isGenerating || !prompt.trim()}
                                    className="absolute bottom-3 right-3 p-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                                >
                                    {isGenerating ? <LoadingSpinnerIcon className="w-4 h-4" /> : <PaperAirplaneIcon className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
