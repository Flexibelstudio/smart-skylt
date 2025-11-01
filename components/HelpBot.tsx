import React, { useState, useEffect, useRef } from 'react';
import { Chat } from "@google/genai";
import { ChatMessage } from '../types';
import { initializeHelpBotChat } from '../services/geminiService';
import { LoadingSpinnerIcon, PaperAirplaneIcon, SparklesIcon } from './icons';

interface HelpBotProps {
    onClose: () => void;
}

const TypingIndicator: React.FC = () => (
    <div className="flex items-center space-x-1 p-2">
        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
    </div>
);


export const HelpBot: React.FC<HelpBotProps> = ({ onClose }) => {
    const [chat, setChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const initChat = async () => {
            const chatInstance = await initializeHelpBotChat();
            setChat(chatInstance);
            setMessages([{
                role: 'model',
                parts: [{ text: "Hej! Jag är Smart Support, din AI-assistent. Hur kan jag hjälpa dig med appen idag?" }]
            }]);
            setIsLoading(false);
        };
        initChat();
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    // FIX: Refactored message sending logic to be type-safe and reusable.
    const sendMessage = async () => {
        if (!userInput.trim() || !chat || isLoading) return;

        const text = userInput.trim();
        setUserInput('');
        setIsLoading(true);

        const userMessage: ChatMessage = { role: 'user', parts: [{ text }] };
        const botMessagePlaceholder: ChatMessage = { role: 'model', parts: [{ text: '' }] };
        setMessages(prev => [...prev, userMessage, botMessagePlaceholder]);
        
        try {
            const stream = await chat.sendMessageStream({ message: text });
            
            let accumulatedText = "";
            for await (const chunk of stream) {
                accumulatedText += chunk.text;
                setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    if (lastMessage && lastMessage.role === 'model') {
                        lastMessage.parts = [{ text: accumulatedText }];
                    }
                    return newMessages;
                });
            }
        } catch (error) {
            console.error("Error sending message:", error);
            setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage && lastMessage.role === 'model') {
                    lastMessage.parts = [{ text: "Ursäkta, något gick fel. Försök igen." }];
                }
                return newMessages;
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        sendMessage();
    };

    return (
        <div className="fixed bottom-24 right-6 w-[90vw] max-w-md h-[70vh] max-h-[600px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col z-50 animate-fade-in">
            <header className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">Hjälp & Support</h3>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold text-2xl">&times;</button>
            </header>
            <main className="flex-grow p-4 overflow-y-auto">
                <div className="space-y-4">
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                            {msg.role === 'model' && <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm flex-shrink-0">AI</div>}
                            <div className={`max-w-[80%] p-3 rounded-xl ${msg.role === 'user' ? 'bg-primary text-white rounded-br-none' : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-none'}`}>
                                <p className="whitespace-pre-wrap">{msg.parts.map(p => p.text).join('')}</p>
                            </div>
                        </div>
                    ))}
                    {isLoading && messages.length > 0 && messages[messages.length-1].role === 'user' && (
                         <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm flex-shrink-0">AI</div>
                            <div className="max-w-[80%] p-3 rounded-xl bg-slate-100 dark:bg-slate-700 rounded-bl-none">
                               <TypingIndicator />
                            </div>
                        </div>
                    )}
                </div>
                <div ref={messagesEndRef} />
            </main>
            <footer className="p-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                    <textarea
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                sendMessage();
                            }
                        }}
                        placeholder="Ställ din fråga här..."
                        rows={1}
                        className="w-full bg-slate-100 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:border-primary transition-colors resize-none"
                        disabled={isLoading}
                    />
                    <button type="submit" disabled={!userInput.trim() || isLoading} className="bg-primary text-white w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors hover:brightness-110 disabled:bg-slate-400 dark:disabled:bg-slate-600">
                        {isLoading ? <LoadingSpinnerIcon /> : <PaperAirplaneIcon />}
                    </button>
                </form>
            </footer>
        </div>
    );
};

export const AIStatusIndicator: React.FC<{ isThinking: boolean; statusText?: string; }> = ({ isThinking, statusText = 'AI arbetar...' }) => {
  if (!isThinking) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-24 z-50 flex items-center gap-3 rounded-full bg-purple-600/90 py-2 px-4 text-white shadow-lg backdrop-blur-sm animate-fade-in border border-purple-400">
      <SparklesIcon className="h-5 w-5 animate-pulse" />
      <span className="text-sm font-semibold">{statusText}</span>
    </div>
  );
};