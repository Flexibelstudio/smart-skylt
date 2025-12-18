import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chat, GenerateContentResponse, FunctionDeclaration, Type } from '@google/genai';
import { ChatMessage, Organization, DisplayPost, DisplayScreen } from '../types';
import { initializeMarketingCoachChat, fileToBase64, generateCompletePost } from '../services/geminiService';
import { getVoiceServerConfig } from '../services/firebaseService';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinnerIcon, PaperAirplaneIcon, MicrophoneIcon, DuplicateIcon, PaperclipIcon, XCircleIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon } from './icons';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from './ConfirmDialog';
import { useAssistantProfile } from '../hooks/useAssistantProfile';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChannelSelectionModal } from './ChannelSelectionModal';
import { useLocation } from '../context/StudioContext';


/* ------------------------------- UI ------------------------------- */

const TypingIndicator: React.FC = () => (
  <div className="flex items-center space-x-1 p-2">
    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
  </div>
);

const AnimatedSentence: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(' ').map((word, i) => (
      <React.Fragment key={i}>
        <span className="animate-fade-up-word" style={{ animationDelay: `${i * 0.05}s` }}>
          {word}
        </span>{' '}
      </React.Fragment>
    ))}
  </>
);

const LiveTranscriptionDisplay: React.FC<{
  userTranscription: string;
  modelTranscription: string;
  userName: string;
  modelName: string;
  isModelThinking: boolean;
}> = ({ userTranscription, modelTranscription, userName, modelName, isModelThinking }) => (
  <div className="p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 h-24 overflow-y-auto text-sm">
    {userTranscription && (
      <p>
        <strong className="text-primary">{userName}:</strong>{' '}
        <span className="text-slate-600 dark:text-slate-300"><AnimatedSentence text={userTranscription} /></span>
      </p>
    )}
    {isModelThinking && (
      <p className="flex items-center">
        <strong className="text-purple-400 mr-1">{modelName}:</strong>
        <span className="text-slate-500 dark:text-slate-400 italic flex items-center">
          <AnimatedSentence text="Skylie tänker..." />
        </span>
      </p>
    )}
    {modelTranscription && (
      <p>
        <strong className="text-purple-400">{modelName}:</strong>{' '}
        <span className="text-slate-600 dark:text-slate-300"><AnimatedSentence text={modelTranscription} /></span>
      </p>
    )}
  </div>
);

/* --------------------------- AUDIO HELPERS ------------------------- */

function encode(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function decode(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number) {
  const s16 = new Int16Array(data.buffer);
  const frames = s16.length / numChannels;
  const buf = ctx.createBuffer(numChannels, frames, sampleRate);
  for (let ch = 0; ch < numChannels; ch++) {
    const out = buf.getChannelData(ch);
    for (let i = 0; i < frames; i++) out[i] = s16[i * numChannels + ch] / 32768.0;
  }
  return buf;
}

function smartAppend(prev: string, chunk: string) {
  const a = prev || '';
  const b = (chunk || '').trim();
  if (!a) return b;
  const needSpace = !/\s$/.test(a) && !/^[,.;:!?)]/.test(b);
  return (a + (needSpace ? ' ' : '') + b).replace(/\s{2,}/g, ' ');
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

interface MarketingCoachBotProps { 
    onClose: () => void; 
    organization: Organization; 
    onEditDisplayScreenFromBot: (screen: DisplayScreen, post: DisplayPost) => void;
}


export const MarketingCoachBot: React.FC<MarketingCoachBotProps> = ({ onClose, organization, onEditDisplayScreenFromBot }) => {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const assistantProfile = useAssistantProfile();
  const { updateDisplayScreen } = useLocation();

  const assistantName = assistantProfile?.name || 'Skylie';
  const assistantAvatar = assistantProfile?.avatarUrl || 'https://dummyimage.com/80x80/64748b/ffffff&text=S';

  const [textChat, setTextChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const streamingRef = useRef(false);

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const isClosingIntentionally = useRef(false);
  const retryTimeoutRef = useRef<number | undefined>(undefined);

  const [currentUserTranscription, setCurrentUserTranscription] = useState('');
  const [currentModelTranscription, setCurrentModelTranscription] = useState('');
  const [isModelThinking, setIsModelThinking] = useState(false);
  const userTranscriptionRef = useRef('');
  const modelTranscriptionRef = useRef('');
  
  const [postPrompt, setPostPrompt] = useState<string | null>(null);
  const [isChannelSelectOpen, setIsChannelSelectOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const chat = await initializeMarketingCoachChat(organization);
        setTextChat(chat);
        setMessages([{
          role: 'model',
          parts: [{ text: `Jag heter ${assistantName}, din digitala marknadsassistent! Vad kan jag hjälpa dig med idag? 🌟` }],
        }]);
      } catch (e) {
        console.error('Could not initialize chat:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [organization, assistantName]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, isMaximized]);

  const handleCopy = (text: string) =>
    navigator.clipboard.writeText(text)
      .then(() => showToast({ message: 'Texten kopierad!', type: 'success' }))
      .catch(() => showToast({ message: 'Kunde inte kopiera texten.', type: 'error' }));

  const removeAttachment = () => {
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview);
    setAttachment(null);
    setAttachmentPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        showToast({ message: 'Filen är för stor. Max 10MB.', type: 'error' });
        return;
      }
      setAttachment(file);
      setAttachmentPreview(URL.createObjectURL(file));
    }
  };

  const safeSet = (updater: (prev: ChatMessage[]) => ChatMessage[]) =>
    setMessages((prev) => (Array.isArray(prev) ? updater(prev) : []));

  const appendToAssistant = (text: string) => {
    if (!text) return;
    safeSet((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice();
      const i = next.length - 1;
      const last = next[i];
      if (last.role !== 'model') {
        next.push({ role: 'model', parts: [{ text }] });
        return next;
      }
      const firstPart = last.parts?.[0] as any;
      const existing = firstPart && 'text' in firstPart ? (firstPart.text || '') : '';
      next[i] = { ...last, parts: [{ text: existing + text }] };
      return next;
    });
  };

  const sendTextMessage = async (prompt?: string) => {
    const effectiveInput = prompt || userInput;
    if ((!effectiveInput.trim() && !attachment) || !textChat || isLoading || streamingRef.current) return;

    setIsLoading(true);
    streamingRef.current = true;

    const rawParts: ChatMessage['parts'] = [];
    if (effectiveInput.trim()) rawParts.push({ text: effectiveInput.trim() });

    if (attachment) {
      try {
        const { mimeType, data } = await fileToBase64(attachment);
        rawParts.push({ inlineData: { mimeType, data } });
      } catch (e) {
        showToast({ message: 'Kunde inte ladda filen.', type: 'error' });
        setIsLoading(false);
        streamingRef.current = false;
        return;
      }
    }

    const partsForState = JSON.parse(JSON.stringify(rawParts));
    setUserInput('');
    removeAttachment();

    safeSet((prev) => [...prev, { role: 'user', parts: partsForState }]);
    safeSet((prev) => [...prev, { role: 'model', parts: [{ text: '' }] }]);

    try {
      // Fix: Använd det enklaste formatet för sendMessageStream för att undvika ContentUnion-felet
      const stream = await textChat.sendMessageStream({ message: rawParts });

      let sawAnyText = false;
      for await (const chunk of stream) {
        if (chunk.functionCalls?.length) {
          for (const fc of chunk.functionCalls) {
            if (fc.name === 'createDisplayPost') {
              const { topic, offerDetails, product, validity } = fc.args as any;
              let cp = (topic as string) || '';
              if (product) cp += ` på ${product}`;
              if (offerDetails) cp += ` med ${offerDetails}`;
              if (validity) cp += ` som gäller ${validity}`;
              if (cp) {
                setPostPrompt(cp);
                setIsChannelSelectOpen(true);
              }
            }
          }
          break;
        }
        const delta = chunk.text;
        if (delta) {
          sawAnyText = true;
          appendToAssistant(delta);
        }
      }

      if (!sawAnyText) {
         // Fallback if streaming failed for some reason
      }
    } catch (err: any) {
      console.error('Error sending message:', err);
      appendToAssistant(`\n\nUrsäkta, något gick fel: ${err?.message || 'Ett tekniskt fel uppstod.'}`);
    } finally {
      setIsLoading(false);
      streamingRef.current = false;
    }
  };

  const cleanupVoiceResources = useCallback(() => {
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    scriptProcessorRef.current?.disconnect();
    scriptProcessorRef.current = null;
    if (inputAudioContextRef.current?.state !== 'closed') inputAudioContextRef.current?.close();
    if (outputAudioContextRef.current?.state !== 'closed') outputAudioContextRef.current?.close();
    sourcesRef.current.forEach((s) => s.stop());
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, []);

  const stopVoiceChat = useCallback(() => {
    isClosingIntentionally.current = true;
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.close(1000);
    wsRef.current = null;
    cleanupVoiceResources();
    setConnectionState('disconnected');
    setCurrentUserTranscription('');
    setCurrentModelTranscription('');
    setIsModelThinking(false);
  }, [cleanupVoiceResources]);

  const startVoiceChat = useCallback(async () => {
    if (!currentUser) return;
    isClosingIntentionally.current = false;
    setConnectionState('connecting');

    const createDisplayPost: FunctionDeclaration = {
        name: 'createDisplayPost',
        description: "Skapa ett inlägg för en digital skylt.",
        parameters: {
            type: Type.OBJECT,
            properties: { prompt: { type: Type.STRING } },
            required: ['prompt']
        }
    };

    try {
      const token = await currentUser.getIdToken();
      const { url } = await getVoiceServerConfig();
      const wsUrl = `${url.replace(/^http/, 'ws')}/voice/stream?token=${token}&orgId=${organization.id}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        try {
          inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
          outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStreamRef.current = stream;
          const source = inputAudioContextRef.current.createMediaStreamSource(stream);
          const proc = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
          scriptProcessorRef.current = proc;
          proc.onaudioprocess = (e) => {
            const input = e.inputBuffer.getChannelData(0);
            const pcm = new Int16Array(input.length);
            for (let i = 0; i < input.length; i++) pcm[i] = input[i] * 32768;
            const base64 = encode(new Uint8Array(pcm.buffer));
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'audio_chunk', data: base64, tools: [{ functionDeclarations: [createDisplayPost] }] }));
            }
          };
          source.connect(proc);
          proc.connect(inputAudioContextRef.current.destination);
        } catch (err) {
          stopVoiceChat();
          setConnectionState('error');
        }
      };

      ws.onmessage = async (event) => {
        const m = JSON.parse(event.data);
        if (m.type === 'connected') setConnectionState('connected');
        if (m.type === 'audio_chunk' && m.data) {
          const out = outputAudioContextRef.current;
          if (!out) return;
          nextStartTimeRef.current = Math.max(nextStartTimeRef.current, out.currentTime);
          const buf = await decodeAudioData(decode(m.data), out, 24000, 1);
          const src = out.createBufferSource();
          src.buffer = buf;
          src.connect(out.destination);
          src.start(nextStartTimeRef.current);
          nextStartTimeRef.current += buf.duration;
        }
        if (m.type === 'tool_code' && m.data.name === 'createDisplayPost') {
          if (m.data.args.prompt) {
            setPostPrompt(m.data.args.prompt);
            setIsChannelSelectOpen(true);
          }
        }
      };
      ws.onclose = () => stopVoiceChat();
    } catch (error) {
      setConnectionState('error');
    }
  }, [currentUser, organization, stopVoiceChat]);

  const handleMicClick = () => (connectionState === 'connected' || connectionState === 'connecting') ? stopVoiceChat() : startVoiceChat();

  const handleConfirmClear = async () => {
    setIsLoading(true);
    safeSet(() => []);
    try {
      const chat = await initializeMarketingCoachChat(organization);
      setTextChat(chat);
      safeSet(() => [{
        role: 'model',
        parts: [{ text: `Jag heter ${assistantName}, din digitala marknadsassistent! Vad kan jag hjälpa dig med idag? 🌟` }],
      }]);
    } catch (e) {
      showToast({ message: 'Kunde inte rensa chatten.', type: 'error' });
    } finally {
      setIsLoading(false);
      setIsClearConfirmOpen(false);
    }
  };

  const handleMultiChannelSelect = async (screens: DisplayScreen[]) => {
    if (!postPrompt) return;
    setIsChannelSelectOpen(false);
    setIsLoading(true);
    appendToAssistant(`Jag skapar nu utkast för dina kanaler...`);

    try {
        await Promise.all(screens.map(async (screen) => {
            const { postData, imageData } = await generateCompletePost(postPrompt, organization, screen.aspectRatio);
            const imageUrl = imageData ? `data:${imageData.mimeType};base64,${imageData.imageBytes}` : undefined;
            const newPost: DisplayPost = {
                id: `post-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                internalTitle: postData.headline || 'AI-inlägg',
                ...(postData as any),
                imageUrl,
                isAiGeneratedImage: !!imageUrl,
            };
            const updatedPosts = [...(screen.posts || []), newPost];
            await updateDisplayScreen(screen.id, { posts: updatedPosts });
        }));
        appendToAssistant(`\n\nKlart! ✨ Jag har skapat utkast i de valda kanalerna.`);
    } catch (e) {
        appendToAssistant(`\n\nUrsäkta, något gick fel vid skapandet.`);
    } finally {
        setIsLoading(false);
        setPostPrompt(null);
    }
  };

  const containerClasses = isMaximized
    ? "fixed inset-4 md:inset-10 z-50 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col animate-fade-in"
    : "fixed bottom-24 right-6 w-[90vw] max-w-md h-[70vh] max-h-[600px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col z-50 animate-fade-in";

  return (
    <>
      <div className={containerClasses}>
        <header className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <img src={assistantAvatar} alt={assistantName} className="w-8 h-8 rounded-full object-cover" />
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">{assistantName}</h3>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsClearConfirmOpen(true)} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:underline">Rensa</button>
            <button onClick={() => setIsMaximized(!isMaximized)} className="text-slate-400 hover:text-slate-200">{isMaximized ? <ArrowsPointingInIcon /> : <ArrowsPointingOutIcon />}</button>
            <button onClick={onClose} className="text-slate-400 font-bold text-2xl">&times;</button>
          </div>
        </header>

        <main className="flex-grow p-4 overflow-y-auto">
          <div className="space-y-4">
            {messages.map((msg, index) => (
              <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'model' && <img src={assistantAvatar} className="w-8 h-8 rounded-full" />}
                <div className={`p-3 rounded-xl max-w-[80%] ${msg.role === 'user' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200'}`}>
                   <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.parts.map(p => (p as any).text).join('')}</ReactMarkdown>
                </div>
              </div>
            ))}
            {isLoading && messages[messages.length-1]?.role === 'user' && <TypingIndicator />}
          </div>
          <div ref={messagesEndRef} />
        </main>

        <footer className="p-4 border-t border-slate-200 dark:border-slate-700">
          {attachmentPreview && (
             <div className="mb-2 relative w-16 h-16">
               <img src={attachmentPreview} className="w-full h-full object-cover rounded" />
               <button onClick={removeAttachment} className="absolute -top-1 -right-1 bg-black text-white rounded-full">&times;</button>
             </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={handleMicClick} className={`w-10 h-10 rounded-lg flex items-center justify-center ${connectionState === 'connected' ? 'bg-green-500' : 'bg-slate-200'}`}><MicrophoneIcon className="h-5 w-5"/></button>
            <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 bg-slate-200 rounded-lg flex items-center justify-center"><PaperclipIcon className="h-5 w-5"/></button>
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
            <form onSubmit={e => { e.preventDefault(); sendTextMessage(); }} className="flex-grow flex gap-2">
              <input value={userInput} onChange={e => setUserInput(e.target.value)} placeholder="Skriv något..." className="w-full bg-slate-100 dark:bg-slate-900 p-2 rounded-lg border border-slate-300 dark:border-slate-600" />
              <button type="submit" className="bg-primary text-white p-2 rounded-lg"><PaperAirplaneIcon className="h-5 w-5"/></button>
            </form>
          </div>
        </footer>
      </div>

      <ChannelSelectionModal isOpen={isChannelSelectOpen} onClose={() => setIsChannelSelectOpen(false)} onConfirm={handleMultiChannelSelect} screens={organization.displayScreens || []} />
      <ConfirmDialog isOpen={isClearConfirmOpen} onClose={() => setIsClearConfirmOpen(false)} onConfirm={handleConfirmClear} title="Rensa chatten?" confirmText="Ja, rensa">Är du säker på att du vill rensa historiken?</ConfirmDialog>
    </>
  );
};