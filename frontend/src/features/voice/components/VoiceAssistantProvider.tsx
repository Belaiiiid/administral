import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVoiceStore } from '../store/voiceStore';
import { MistralSttProvider } from '../providers/MistralSttProvider';
import { MistralTtsProvider } from '../providers/MistralTtsProvider';
import { DeterministicVoiceIntentResolver } from '../resolvers/DeterministicVoiceIntentResolver';
import { VoiceCommandExecutor } from '../executors/VoiceCommandExecutor';
import { VoicePageContext } from '../context/VoicePageContext';
import type { VoiceIntent, VoicePageAction, SpeechToTextProvider, TextToSpeechProvider } from '../types';

export type VoiceStatus = 'idle' | 'standby' | 'listening' | 'speaking' | 'error';

interface VoiceAssistantContextType {
  status: VoiceStatus;
  transcript: string;
  lastIntent: VoiceIntent | null;
  error: string | null;
  isWaitingForConfirmation: boolean;
  pendingAction: VoicePageAction | null;
  triggerCommand: (text: string) => void;
  speakText: (text: string) => void;
  stopSpeaking: () => void;
  startListening: () => void;
  /**
   * Records until `stopPushToTalk`, then resolves the transcript.
   * With no argument, the transcript is handed to `triggerCommand` (the
   * deterministic navigation/action resolver, falling back to `/api/voice/classify`).
   * With `onResult`, the resolver is bypassed entirely and the raw transcript
   * goes straight to the caller instead — this is what lets voice act as a
   * second way to type into an ordinary conversation (the chat widget's mic
   * button) without being reinterpreted as a page command.
   */
  startPushToTalk: (onResult?: (text: string) => void) => void;
  stopPushToTalk: () => void;
}

const VoiceAssistantContext = createContext<VoiceAssistantContextType | null>(null);
export const useVoiceAssistant = () => {
  const context = useContext(VoiceAssistantContext);
  if (!context) throw new Error('useVoiceAssistant must be used within a VoiceAssistantProvider');
  return context;
};

export const VoiceAssistantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const modeVocal = useVoiceStore((state) => state.modeVocal);
  const navigate = useNavigate();

  const pageContext = useContext(VoicePageContext);
  const { readableText, actions, fields } = pageContext || { readableText: '', actions: [], fields: [] };

  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [lastIntent, setLastIntent] = useState<VoiceIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWaitingForConfirmation, setWaitingForConfirmation] = useState(false);
  const [pendingAction, setPendingAction] = useState<VoicePageAction | null>(null);

  const ttsProvider = useRef<TextToSpeechProvider | null>(null);
  const sttProvider = useRef<SpeechToTextProvider | null>(null);
  const resolver = useRef<DeterministicVoiceIntentResolver | null>(null);
  const executor = useRef<VoiceCommandExecutor | null>(null);

  const commandWindowActive = useRef(false);
  const listenTimeout = useRef<number | null>(null);

  function clearListenTimeout() { if (listenTimeout.current) { window.clearTimeout(listenTimeout.current); listenTimeout.current = null; } }
  function startStandby() { sttProvider.current?.stop(); sttProvider.current = null; setStatus('standby'); }

  function startListeningWindow(sliceMs = 6000) {
    sttProvider.current?.stop();
    commandWindowActive.current = true;
    sttProvider.current = new MistralSttProvider({ sliceMs });
    sttProvider.current.onError((errMsg) => { setError(errMsg); setStatus('error'); });
    sttProvider.current.onTranscript((text) => {
      if (!commandWindowActive.current) return;
      commandWindowActive.current = false; clearListenTimeout(); triggerCommand(text); sttProvider.current?.stop(); setStatus('standby');
    });
    setStatus('listening'); sttProvider.current.start(); clearListenTimeout();
    listenTimeout.current = window.setTimeout(() => { commandWindowActive.current = false; sttProvider.current?.stop(); startStandby(); }, sliceMs);
  }

  useEffect(() => {
    ttsProvider.current = new MistralTtsProvider();
    resolver.current = new DeterministicVoiceIntentResolver();
    executor.current = new VoiceCommandExecutor();
    ttsProvider.current.onEnd(() => {
      // Ensure only one TTS session active and transition cleanly
      sttProvider.current?.stop();
      if (useVoiceStore.getState().modeVocal) startStandby(); else setStatus('idle');
    });
    return () => { clearListenTimeout(); sttProvider.current?.stop(); ttsProvider.current?.stop(); };
  }, []);

  const triggerCommand = useMemo(() => {
    return (text: string) => {
      if (!resolver.current || !executor.current || !ttsProvider.current) return;
      const activeFieldsList = fields || [];
      const intent = resolver.current.resolve(text, activeFieldsList, isWaitingForConfirmation);
      setTranscript(text); setLastIntent(intent);

      if (intent.type === 'unknown') {
        (async () => {
          try {
            const resp = await fetch('/api/voice/classify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: text, actions: (actions || []).map(a => a.label), fields: (activeFieldsList || []).flatMap(f => f.labels) }) });
            if (resp.ok) {
              const data = await resp.json();
              if (data.type === 'navigate' && (data.target === 'home' || data.target === 'documents')) {
                const deps = { navigate, tts: ttsProvider.current, actions: actions || [], fields: activeFieldsList, isWaitingForConfirmation, setWaitingForConfirmation, pendingAction, setPendingAction, readableText: readableText || '' };
                sttProvider.current?.stop(); setStatus('speaking'); executor.current.execute({ type: 'navigate', target: data.target }, deps); return;
              }
              if (data.type === 'read_page') {
                const deps = { navigate, tts: ttsProvider.current, actions: actions || [], fields: activeFieldsList, isWaitingForConfirmation, setWaitingForConfirmation, pendingAction, setPendingAction, readableText: readableText || '' };
                sttProvider.current?.stop(); setStatus('speaking'); executor.current.execute({ type: 'read_page' }, deps); return;
              }
              if (data.type === 'stop_speaking') { stopSpeaking(); return; }
              if (data.type === 'explain_actions') {
                const labels = (actions || []).map((a) => a.label).join(', ');
                const msg = labels ? `Tu peux dire: ${labels}.` : 'Aucune action disponible.';
                if (ttsProvider.current) { sttProvider.current?.stop(); setStatus('speaking'); ttsProvider.current.speak(msg); }
                return;
              }
              if (data.type === 'reply' && data.reply) {
                if (ttsProvider.current) { sttProvider.current?.stop(); setStatus('speaking'); ttsProvider.current.speak(String(data.reply)); }
                return;
              }
              if (data.type === 'fill_field' && data.value) {
                const deps = { navigate, tts: ttsProvider.current, actions: actions || [], fields: activeFieldsList, isWaitingForConfirmation, setWaitingForConfirmation, pendingAction, setPendingAction, readableText: readableText || '' };
                let targetFieldId: string | null = null;
                if (activeFieldsList.length === 1) targetFieldId = activeFieldsList[0].fieldId;
                else {
                  const lower = text.toLowerCase();
                  for (const f of activeFieldsList) { if ((f.labels || []).some((lbl) => lower.includes(String(lbl).toLowerCase()))) { targetFieldId = f.fieldId; break; } }
                }
                if (targetFieldId) { sttProvider.current?.stop(); setStatus('speaking'); executor.current.execute({ type: 'fill_field', fieldId: targetFieldId, value: String(data.value) }, deps); }
                else if (ttsProvider.current) { sttProvider.current?.stop(); setStatus('speaking'); ttsProvider.current.speak('Quel champ dois-je remplir ?'); }
                return;
              }
            }
          } catch (_) { /* ignore and fall back */ }
          if (ttsProvider.current) { sttProvider.current?.stop(); setStatus('speaking'); ttsProvider.current.speak("Désolé, je n'ai pas compris la commande."); }
        })();
        return;
      }

      const deps = { navigate, tts: ttsProvider.current, actions: actions || [], fields: activeFieldsList, isWaitingForConfirmation, setWaitingForConfirmation, pendingAction, setPendingAction, readableText: readableText || '' };
      sttProvider.current?.stop(); setStatus('speaking'); executor.current.execute(intent, deps);
      setTimeout(() => { if (ttsProvider.current && !ttsProvider.current.isSpeaking() && useVoiceStore.getState().modeVocal) { startStandby(); } }, 300);
    };
  }, [actions, fields, isWaitingForConfirmation, pendingAction, readableText, navigate]);

  useEffect(() => {
    if (modeVocal) { setError(null); startStandby(); }
    else { setStatus('idle'); clearListenTimeout(); sttProvider.current?.stop(); ttsProvider.current?.stop(); }
  }, [modeVocal]);

  const speakText = (text: string) => { if (ttsProvider.current) { sttProvider.current?.stop(); setStatus('speaking'); ttsProvider.current.speak(text); } };
  const stopSpeaking = () => { if (ttsProvider.current) { ttsProvider.current.stop(); if (modeVocal) startStandby(); else setStatus('idle'); } };
  const startListening = () => startListeningWindow();

  const startPushToTalk = (onResult?: (text: string) => void) => {
    clearListenTimeout(); setTranscript(''); commandWindowActive.current = true;
    const provider = new MistralSttProvider({ sliceMs: 2500, deferUpload: true, minSliceBytes: 40000, coalesceTargetBytes: 120000, coalesceMinSlices: 3 });
    sttProvider.current = provider;
    provider.onError((errMsg) => { setError(errMsg); setStatus('error'); });
    provider.onTranscript((text) => {
      setTranscript(text);
      if (onResult) {
        sttProvider.current?.stop();
        setStatus('standby');
        onResult(text);
      } else {
        setStatus('listening'); triggerCommand(text); sttProvider.current?.stop(); setStatus('standby');
      }
    });
    setStatus('listening'); provider.start();
  };

  const stopPushToTalk = () => { commandWindowActive.current = false; sttProvider.current?.stop(); setStatus('standby'); };

  const value = useMemo(() => ({ status, transcript, lastIntent, error, isWaitingForConfirmation, pendingAction, triggerCommand, speakText, stopSpeaking, startListening, startPushToTalk, stopPushToTalk, }), [status, transcript, lastIntent, error, isWaitingForConfirmation, pendingAction, triggerCommand]);

  return <VoiceAssistantContext.Provider value={value}>{children}</VoiceAssistantContext.Provider>;
};
