import { useEffect, useRef, useState } from 'react';

export default function useMaraVoice({ active, onTranscript }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canListen = Boolean(Recognition) && window.isSecureContext;
  const canSpeak = Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const recognitionRef = useRef(null);
  const utteranceRef = useRef(null);
  const activeRef = useRef(active);
  const transcriptRef = useRef(onTranscript);
  activeRef.current = active;
  transcriptRef.current = onTranscript;

  function stopSpeaking() {
    const utterance = utteranceRef.current;
    if (utterance) {
      utterance.onstart = null;
      utterance.onend = null;
      utterance.onerror = null;
      utteranceRef.current = null;
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }

  function stopListening() {
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognitionRef.current = null;
      recognition.abort();
    }
    setListening(false);
  }

  useEffect(() => {
    if (!active) {
      stopListening();
      stopSpeaking();
    }
    return () => {
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognitionRef.current = null;
        recognition.abort();
      }
      const utterance = utteranceRef.current;
      if (utterance) {
        utterance.onstart = null;
        utterance.onend = null;
        utterance.onerror = null;
        utteranceRef.current = null;
        window.speechSynthesis.cancel();
      }
    };
  }, [active]);

  function startListening() {
    if (!canListen || !activeRef.current || recognitionRef.current) return;
    stopSpeaking();
    setVoiceError('');
    const recognition = new Recognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const text = Array.from(event.results).map((result) => result[0].transcript).join(' ').trim();
      if (activeRef.current && text) transcriptRef.current(text);
    };
    recognition.onerror = (event) => {
      if (event.error === 'aborted') return;
      const messages = {
        'not-allowed': 'Microphone permission was denied. Allow microphone access in your browser or type instead.',
        'service-not-allowed': 'Speech recognition is blocked by this browser. You can still type.',
        'audio-capture': 'No working microphone was found. Connect a microphone or type instead.',
        'no-speech': 'No speech was detected. Try the microphone again or type instead.',
        network: 'Speech recognition could not connect. Check your connection or type instead.',
      };
      setVoiceError(messages[event.error] || `Speech recognition failed (${event.error}). You can still type.`);
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
        setListening(false);
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch (error) {
      stopListening();
      setVoiceError(`Could not start the microphone: ${error.message}`);
    }
  }

  function speak(text) {
    if (!canSpeak || !activeRef.current) return;
    stopListening();
    stopSpeaking();
    setVoiceError('');
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = navigator.language || 'en-US';
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => {
      utteranceRef.current = null;
      setSpeaking(false);
    };
    utterance.onerror = (event) => {
      utteranceRef.current = null;
      setSpeaking(false);
      setVoiceError(`Could not play Mara's voice (${event.error}). Her reply is available as text.`);
    };
    utteranceRef.current = utterance;
    try {
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      stopSpeaking();
      setVoiceError(`Could not play Mara's voice: ${error.message}`);
    }
  }

  return {
    canListen, canSpeak, listening, speaking, voiceError,
    startListening, stopListening, stopSpeaking, speak,
  };
}
