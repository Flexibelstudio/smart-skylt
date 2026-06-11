
import { useState, useEffect, useRef, useCallback } from 'react';

// FIX: Add minimal type definitions for the Web Speech API to resolve "Cannot find name" errors.
// These interfaces are not part of the standard DOM typings and need to be declared.
interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string;
}

interface SpeechRecognitionAlternative {
    readonly transcript: string;
}

interface SpeechRecognitionResult {
    readonly [index: number]: SpeechRecognitionAlternative;
    readonly length: number;
}

interface SpeechRecognitionResultList {
    readonly [index: number]: SpeechRecognitionResult;
    readonly length: number;
}

interface SpeechRecognitionEvent extends Event {
    readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognition {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    onstart: () => void;
    onresult: (event: SpeechRecognitionEvent) => void;
    onerror: (event: SpeechRecognitionErrorEvent) => void;
    onend: () => void;
    start: () => void;
    stop: () => void;
}
// END FIX

// Define the SpeechRecognition interface to handle vendor prefixes
interface CustomSpeechRecognition extends SpeechRecognition {
  new (): SpeechRecognition;
}
declare global {
  interface Window {
    SpeechRecognition: CustomSpeechRecognition;
    webkitSpeechRecognition: CustomSpeechRecognition;
  }
}

const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
const browserSupportsSpeechRecognition = !!SpeechRecognitionAPI;

export const useSpeechRecognition = () => {
  const [isListening, setIsListening] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const startListening = useCallback(() => {
    if (isListening) {
      stopListening();
      return;
    }
    
    if (!browserSupportsSpeechRecognition) {
      const errorMessage = "Web Speech API is not supported by this browser.";
      console.error(errorMessage);
      setError(errorMessage);
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'sv-SE';
    recognition.interimResults = false; // Only get final results
    recognition.continuous = false; // Stop after a pause
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      setFinalTranscript('');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (transcript) {
        setFinalTranscript(transcript);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setError(event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.start();
  }, [isListening, stopListening]);

  return {
    isListening,
    transcript: finalTranscript,
    error,
    startListening,
    stopListening,
    browserSupportsSpeechRecognition,
  };
};
