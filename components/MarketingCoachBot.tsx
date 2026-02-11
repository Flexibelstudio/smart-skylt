
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chat, GenerateContentResponse, FunctionDeclaration, Type } from '@google/genai';
import { ChatMessage, Organization, DisplayPost, DisplayScreen } from '../types';
import { initializeMarketingCoachChat, fileToBase64, generateCompletePost, createDisplayPostFunctionDeclaration } from '../services/geminiService';
import { getVoiceServerConfig } from '../services/firebaseService';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinnerIcon, PaperAirplaneIcon, MicrophoneIcon, DuplicateIcon, PaperclipIcon, XCircleIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon, SparklesIcon } from './icons';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from './ConfirmDialog';
import { useAssistantProfile } from '../hooks/useAssistantProfile';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChannelSelectionModal } from './ChannelSelectionModal';
import { useLocation } from '../context/StudioContext';
import { ThinkingDots } from './HelpBot';


/* ------------------------------- UI ------------------------------- */

const TypingIndicator: React.FC = () => (
  <div className="flex flex-col items-start gap-1 p-2">
    <div className="flex items-center gap-2 text-xs font-semibold text-purple-400 mb-1">
      <SparklesIcon className="w-3 h-3 animate-pulse" />
      <span>Skylie skapar ett svar</span>
    </div>
    <ThinkingDots className="text-slate-400" />
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
           <ThinkingDots className="mr-2" />
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

/* ---------------------- helpers för textmellanrum ------------------- */

function smartAppend(prev: string, chunk: string) {
  const a = prev || '';
  const b = (chunk || '').trim();
  if (!a) return b;
  const needSpace = !/\s$/.test(a) && !/^[,.;:!?)]/.test(b);
  return (a + (needSpace ? ' ' : '') + b).replace(/\s{2,}/g, ' ');
}

// Helper to guarantee a string, recursively extracting from object if needed
const ensureString = (val: any, fallback: string): string => {
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return String(val);
    if (val && typeof val === 'object') {
        if ('text' in val) return ensureString(val.text, fallback);
        if ('value' in val) return ensureString(val.value, fallback);
        return fallback; // Cannot extract meaningful string
    }
    return fallback;
};

/* -------------------------------- MAIN ----------------------------- */

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

  // Robust check: ensure assistantName is absolutely a string to prevent "Object invalid as child" errors
  const assistantName = ensureString(assistantProfile?.name, 'Skylie');
  const assistantAvatar = ensureString(assistantProfile?.avatarUrl, 'https://dummyimage.com/80x80/64748b/ffffff&text=S');

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

  // Voice chat
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

  /* ---------------------------- init chat -------------------------- */

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
        setMessages([{
          role: 'model',
          parts: [{ text: `Jag heter ${assistantName}, din digitala marknadsassistent! Vad kan jag hjälpa dig med idag? 🌟` }],
        }]);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [organization, assistantName]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, isMaximized]);

  useEffect(() => {
    return () => { if (attachmentPreview) URL.revokeObjectURL(attachmentPreview); };
  }, [attachmentPreview]);

  /* ----------------------------- helpers --------------------------- */

  const handleCopy = (text: string) =>
    navigator.clipboard.writeText(text)
      .then(() => showToast({ message: 'Texten kopierad!', type: 'success' }))
      .catch((err) => {
        console.error('Copy failed', err);
        showToast({ message: 'Kunde inte kopiera texten.', type: 'error' });
      });

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

  const appendUserMessage = (parts: ChatMessage['parts']) => {
    const msg: ChatMessage = { role: 'user', parts };
    safeSet((prev) => [...prev, msg]);
  };

  const ensureAssistantRow = () => {
    safeSet((prev) => (prev.length === 0 || prev[prev.length - 1].role !== 'model'
      ? [...prev, { role: 'model', parts: [{ text: '' }] }]
      : prev));
  };

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

  /* --------------------------- text message ------------------------ */
  const sendTextMessage = async (prompt?: string) => {
    const effectiveInput = prompt || userInput;
    if ((!effectiveInput.trim() && !attachment) || !textChat || isLoading || streamingRef.current) return;

    setIsLoading(true);
    streamingRef.current = true;

    const rawParts: ChatMessage['parts'] = [];
    const text = effectiveInput.trim();
    if (text) rawParts.push({ text });

    if (attachment) {
      try {
        const { mimeType, data } = await fileToBase64(attachment);
        rawParts.push({ inlineData: { mimeType, data } });
      } catch (e) {
        console.error(e);
        showToast({ message: 'Kunde inte ladda filen.', type: 'error' });
        setIsLoading(false);
        streamingRef.current = false;
        return;
      }
    }

    const partsForState: ChatMessage['parts'] = JSON.parse(JSON.stringify(rawParts));
    const partsForApi: ChatMessage['parts'] = JSON.parse(JSON.stringify(rawParts));

    setUserInput('');
    removeAttachment();

    appendUserMessage(partsForState);
    ensureAssistantRow();

    try {
      const stream = await textChat.sendMessageStream({ message: text });

      let sawAnyText = false;
      let functionCallHandled = false;

      for await (const chunk of stream) {
        // Kolla efter funktionsanrop i kandidaterna
        const functionCalls = chunk.candidates?.[0]?.content?.parts?.filter(p => !!p.functionCall);
        
        if (functionCalls && functionCalls.length > 0) {
          for (const p of functionCalls) {
            const fc = p.functionCall;
            if (fc && fc.name === 'createDisplayPost') {
              const promptArg = fc.args.prompt;
              if (promptArg && typeof promptArg === 'string') {
                setPostPrompt(promptArg);
                setIsChannelSelectOpen(true);
                functionCallHandled = true;
                break;
              }
            }
          }
        }
        
        if (functionCallHandled) break;

        const delta = chunk.text; // Använd .text propertyn enligt riktlinjer
        if (delta) {
          sawAnyText = true;
          appendToAssistant(delta);
        }
      }

      if (!sawAnyText && !functionCallHandled) {
          appendToAssistant('\n\nJag kunde inte generera ett svar just nu. Prova igen om en liten stund!');
      }
    } catch (err: any) {
      console.error('Error sending message:', err);
      const errMsg = (err?.message || String(err));
      appendToAssistant(`\n\nUrsäkta, något gick fel${errMsg ? `: ${errMsg}` : '.'}`);
    } finally {
      setIsLoading(false);
      streamingRef.current = false;
    }
  };

  /* ----------------------------- voice chat ------------------------ */

  const cleanupVoiceResources = useCallback(() => {
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;

    scriptProcessorRef.current?.disconnect();
    scriptProcessorRef.current = null;

    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      inputAudioContextRef.current.close().catch(console.error);
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
      outputAudioContextRef.current.close().catch(console.error);
      outputAudioContextRef.current = null;
    }
    sourcesRef.current.forEach((s) => s.stop());
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, []);

  const stopVoiceChat = useCallback(() => {
    isClosingIntentionally.current = true;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.close(1000, 'User ended session');
    wsRef.current = null;
    cleanupVoiceResources();
    setCurrentUserTranscription('');
    setCurrentModelTranscription('');
    setIsModelThinking(false);
    userTranscriptionRef.current = '';
    modelTranscriptionRef.current = '';
    setConnectionState('disconnected');
  }, [cleanupVoiceResources]);

  const handleMultiChannelSelect = async (screens: DisplayScreen[]) => {
    if (!postPrompt) {
        showToast({ message: "Kunde inte hitta instruktionerna för inlägget. Försök igen.", type: 'error' });
        return;
    }
    
    if (screens.length === 0) return;
    
    setIsChannelSelectOpen(false);
    setIsLoading(true);
    ensureAssistantRow();
    const screenNames = screens.map(s => `"${s.name}"`).join(', ');
    appendToAssistant(`Jag förstår! Jag skapar nu utkast för ${screenNames}... Det kan ta en liten stund.`);

    try {
        const results = await Promise.allSettled(screens.map(async (screen) => {
            const { postData, imageData } = await generateCompletePost(postPrompt, organization, screen.aspectRatio);
            const imageUrl = imageData ? `data:${imageData.mimeType};base64,${imageData.imageBytes}` : undefined;
            
            const newPost: DisplayPost = {
                id: `post-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                internalTitle: postData.headline || 'AI-genererat inlägg',
                ...(postData as Omit<DisplayPost, 'id' | 'internalTitle'>),
                imageUrl,
                isAiGeneratedImage: !!imageUrl,
            };

            const targetScreen = organization.displayScreens?.find(s => s.id === screen.id);
            if (targetScreen) {
                const updatedPosts = [...(targetScreen.posts || []), newPost];
                await updateDisplayScreen(screen.id, { posts: updatedPosts });
            }
            return screen.name;
        }));

        const successCount = results.filter(r => r.status === 'fulfilled').length;
        const failureCount = results.length - successCount;

        if (successCount > 0) {
            appendToAssistant(`\n\nKlart! ✨ Jag har skapat ${successCount} nya utkast. Du hittar dem i respektive kanals planeringsvy.`);
            showToast({ message: "Nya utkast har skapats!", type: "success" });
        }
        
        if (failureCount > 0) {
             appendToAssistant(`\n\nOBS: Några inlägg kunde tyvärr inte skapas. Prova gärna igen för de kanalerna.`);
        }

    } catch (e) {
        console.error("Multi-channel post creation failed", e);
        appendToAssistant(`\n\nUrsäkta, ett fel inträffade när jag försökte skapa inläggen. Prova att fråga igen!`);
    } finally {
        setIsLoading(false);
        setPostPrompt(null);
    }
  };

  const startVoiceChat = useCallback(async () => {
    if (!currentUser) { showToast({ message: 'Du måste vara inloggad.', type: 'error' }); return; }
    isClosingIntentionally.current = false;
    setConnectionState('connecting');

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
              wsRef.current.send(JSON.stringify({ 
                type: 'audio_chunk', 
                data: base64, 
                tools: [{ functionDeclarations: [createDisplayPostFunctionDeclaration] }] 
              }));
            }
          };

          source.connect(proc);
          proc.connect(inputAudioContextRef.current.destination);
        } catch (err) {
          console.error('Mic access error:', err);
          showToast({ message: 'Kunde inte komma åt mikrofonen.', type: 'error' });
          stopVoiceChat();
          setConnectionState('error');
        }
      };

      ws.onmessage = async (event) => {
        try {
          const m = JSON.parse(event.data);
          switch (m.type) {
            case 'connected':
              setConnectionState('connected');
              break;

            case 'audio_chunk': {
              setIsModelThinking(false);
              if (!m.data) break;
              const out = outputAudioContextRef.current;
              if (!out) return;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, out.currentTime);
              const buf = await decodeAudioData(decode(m.data), out, 24000, 1);
              const src = out.createBufferSource();
              src.buffer = buf;
              src.connect(out.destination);
              src.addEventListener('ended', () => sourcesRef.current.delete(src));
              src.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buf.duration;
              sourcesRef.current.add(src);
              break;
            }

            case 'transcription_update': {
              const t = (m.text || '').trim();
              if (!t) break;
              if (m.source === 'user') {
                const newText = smartAppend(userTranscriptionRef.current, t);
                userTranscriptionRef.current = newText;
                setCurrentUserTranscription(newText);
                if (m.isFinal) setIsModelThinking(true);
              } else if (m.source === 'model') {
                setIsModelThinking(false);
                const newText = smartAppend(modelTranscriptionRef.current, t);
                modelTranscriptionRef.current = newText;
                setCurrentModelTranscription(newText);
              }
              break;
            }

            case 'turn_complete': {
              setIsModelThinking(false);
              const userTxt = userTranscriptionRef.current;
              const modelTxt = modelTranscriptionRef.current;
              userTranscriptionRef.current = '';
              modelTranscriptionRef.current = '';
              setCurrentUserTranscription('');
              setCurrentModelTranscription('');
              const toAdd: ChatMessage[] = [];
              if (userTxt) toAdd.push({ role: 'user', parts: [{ text: userTxt }] });
              if (modelTxt) toAdd.push({ role: 'model', parts: [{ text: modelTxt }] });
              if (toAdd.length) safeSet((prev) => [...prev, ...toAdd]);
              break;
            }
            
            case 'tool_code': {
              const fc = m.data;
              if (fc.name === 'createDisplayPost') {
                const promptVal = fc.args.prompt;
                if (promptVal && typeof promptVal === 'string') {
                  setPostPrompt(promptVal);
                  setIsChannelSelectOpen(true);
                }
              }
              break;
            }

            case 'interrupted':
              sourcesRef.current.forEach((s) => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              break;

            case 'error':
              showToast({ message: m.message || 'Ett serverfel inträffade.', type: 'error' });
              break;
          }
        } catch (e) {
          console.error('WS message error', e);
        }
      };

      ws.onerror = () => setConnectionState('error');
      ws.onclose = (ev) => {
        if (!isClosingIntentionally.current && ev.code !== 1000) {
          showToast({ message: 'Anslutningen avslutades.', type: 'info' });
        }
        stopVoiceChat();
      };
    } catch (error) {
      console.error('Failed to start voice chat:', error);
      showToast({ message: 'Kunde inte starta röstchatt.', type: 'error' });
      setConnectionState('error');
    }
  }, [currentUser, showToast, stopVoiceChat, organization]);

  const handleMicClick = useCallback(() => {
    if (connectionState === 'connected' || connectionState === 'connecting') stopVoiceChat();
    else startVoiceChat();
  }, [connectionState, startVoiceChat, stopVoiceChat]);

  useEffect(() => () => { stopVoiceChat(); }, [stopVoiceChat]);

  /* ------------------------------ clear ---------------------------- */

  const handleConfirmClear = useCallback(async () => {
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
      console.error('Failed to clear and re-init', e);
      showToast({ message: 'Kunde inte rensa chatten.', type: 'error' });
    } finally {
      setIsLoading(false);
      setIsClearConfirmOpen(false);
    }
  }, [organization, showToast, assistantName]);

  const getMicButtonClasses = () => {
    switch (connectionState) {
      case 'connecting': return 'bg-yellow-500 hover:bg-yellow-600 text-white animate-pulse';
      case 'connected':  return 'bg-green-500 hover:bg-green-600 text-white animate-pulse';
      case 'error':      return 'bg-red-500 hover:bg-red-600 text-white';
      default:           return 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200';
    }
  };

  const isVoiceActive = connectionState === 'connected' || connectionState === 'connecting';
  
  const conversationStarters = [
    { label: "Annonsera ett erbjudande", prompt: "Jag want to advertise an offer." },
    { label: "Skapa ett 'nyhet'-inlägg", prompt: "Jag want to create a post about a news." },
    { label: "Ge mig en kreativ idé", prompt: "Give me a creative idea for a post that fits my business." },
  ];

  /* ------------------------------ render --------------------------- */

  const containerClasses = isMaximized
    ? "fixed inset-4 md:inset-10 z-50 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in flex flex-col"
    : "fixed bottom-24 right-6 w-[90vw] max-w-md h-[70vh] max-h-[600px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col z-50 animate-fade-in";

  return (
    <>
      <div className={containerClasses}>
        <header className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img src={assistantAvatar} alt={assistantName} className={`w-8 h-8 rounded-full object-cover transition-all ${isLoading ? 'ring-2 ring-purple-400 ring-offset-2 animate-pulse' : ''}`} />
              {isLoading && <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full border-2 border-white dark:border-slate-800 animate-ping" />}
            </div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">{assistantName}</h3>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsClearConfirmOpen(true)} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:underline" disabled={isLoading}>Rensa</button>
            <button 
                onClick={() => setIsMaximized(!isMaximized)} 
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title={isMaximized ? "Återställ storlek" : "Maximera"}
            >
                {isMaximized ? <ArrowsPointingInIcon /> : <ArrowsPointingOutIcon />}
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold text-2xl leading-none">&times;</button>
          </div>
        </header>

        <main className="flex-grow p-4 overflow-y-auto">
          <div className="space-y-4">
            {messages.map((msg, index) => (
              <div key={index} className={`flex items-start gap-3 group ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'model' && (
                  <img src={assistantAvatar} alt={assistantName} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                )}
                <div className={`relative max-w-[80%] p-3 rounded-xl ${msg.role === 'user' ? 'bg-primary text-white rounded-br-none' : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-none'}`}>
                  {(() => {
                    const isLastMessage = index === messages.length - 1;
                    const isEmptyModelMessage = msg.role === 'model' && (!msg.parts.length || ('text' in msg.parts[0] && !msg.parts[0].text));
                    if (isLoading && isLastMessage && isEmptyModelMessage) {
                      return <TypingIndicator />;
                    }
                    return (
                      <div className="space-y-2">
                        {msg.parts.map((part, partIndex) => {
                          if ('text' in part) {
                            const text = (part as any).text || '';
                            return (
                              <div key={partIndex} className="prose prose-slate dark:prose-invert max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {text}
                                </ReactMarkdown>
                              </div>
                            );
                          }
    
                          if ('inlineData' in part && part.inlineData) {
                            const src = (part.inlineData as any).url || `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                            if (part.inlineData.mimeType.startsWith('image/')) return <img key={partIndex} src={src} className="max-w-full rounded-lg" alt="Bifogad bild" />;
                            if (part.inlineData.mimeType.startsWith('video/')) return <video key={partIndex} src={src} controls className="max-w-full rounded-lg" />;
                          }
                          return null;
                        })}
                      </div>
                    );
                  })()}
                  {msg.role === 'model' && (
                    <button
                      onClick={() =>
                        handleCopy(
                          msg.parts.filter((p) => 'text' in p).map((p) => (p as { text: string }).text).join('\n\n')
                        )
                      }
                      className="absolute -top-2 -right-2 p-1.5 bg-white dark:bg-slate-600 rounded-full text-slate-500 dark:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 shadow-md hover:scale-110"
                      title="Kopiera text"
                    >
                      <DuplicateIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
             {messages.length <= 1 && !isLoading && (
              <div className="pt-4 space-y-2 animate-fade-in">
                  {conversationStarters.map(starter => (
                      <button 
                          key={starter.label}
                          onClick={() => sendTextMessage(starter.prompt)}
                          className="w-full text-left p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors font-semibold text-primary"
                      >
                          {starter.label}
                      </button>
                  ))}
              </div>
            )}
          </div>
          <div ref={messagesEndRef} />
        </main>

        <footer className="p-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
          {isVoiceActive && (
            <div className="mb-2">
              <LiveTranscriptionDisplay
                userTranscription={currentUserTranscription}
                modelTranscription={currentModelTranscription}
                userName="Du"
                modelName={assistantName}
                isModelThinking={isModelThinking}
              />
            </div>
          )}

          {attachmentPreview && (
            <div className="mb-2 relative w-20 h-20 border-2 border-slate-300 dark:border-slate-600 rounded-lg p-1 bg-white dark:bg-slate-700">
              <img src={attachmentPreview} className="w-full h-full object-cover rounded-md" alt="Förhandsvisning" />
              <button onClick={removeAttachment} className="absolute -top-2 -right-2 bg-slate-700 dark:bg-slate-900 rounded-full text-white hover:scale-110 transition-transform">
                <XCircleIcon className="w-6 h-6" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button type="button" onClick={handleMicClick} className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${getMicButtonClasses()}`} title={isVoiceActive ? 'Avsluta röstsamtal' : 'Starta röstsamtal'}>
              <MicrophoneIcon className="h-6 w-6" />
            </button>

            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isLoading || isVoiceActive} className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200 disabled:opacity-50">
              <PaperclipIcon className="h-6 w-6" />
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*,video/*" />

            <form onSubmit={(e) => { e.preventDefault(); sendTextMessage(); }} className="flex-grow flex items-center gap-2">
              <textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTextMessage(); }
                }}
                placeholder={isVoiceActive ? (connectionState === 'connecting' ? 'Ansluter...' : 'Samtal aktivt...') : 'Skriv ett meddelande...'}
                rows={1}
                className="w-full bg-slate-100 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:border-primary transition-colors resize-none"
                disabled={isLoading || isVoiceActive}
              />
              <button
                type="submit"
                disabled={(!userInput.trim() && !attachment) || isLoading || streamingRef.current || isVoiceActive}
                className="bg-primary text-white w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors hover:brightness-110 disabled:bg-slate-400 dark:disabled:bg-slate-600"
              >
                {isLoading ? <LoadingSpinnerIcon /> : <PaperAirplaneIcon />}
              </button>
            </form>
          </div>
        </footer>
      </div>
      
      {isChannelSelectOpen && (
        <ChannelSelectionModal
          isOpen={isChannelSelectOpen}
          onClose={() => { setIsChannelSelectOpen(false); setPostPrompt(null); }}
          onConfirm={handleMultiChannelSelect}
          screens={organization.displayScreens || []}
        />
      )}

      <ConfirmDialog
        isOpen={isClearConfirmOpen}
        onClose={() => setIsClearConfirmOpen(false)}
        onConfirm={handleConfirmClear}
        title="Rensa chatthistorik?"
        confirmText="Ja, rensa"
        variant="destructive"
      >
        Är du säker? Hela konversationen kommer att raderas permanent.
      </ConfirmDialog>
    </>
  );
};
