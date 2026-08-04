import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Clock,
  Files,
  Home,
  MessageCircle,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useContext, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { ChatWindow } from '@/features/chatbot/components/ChatWindow';
import { ConversationHistory } from '@/features/chatbot/components/ConversationHistory';
import { useChatbot } from '@/features/chatbot/hooks/useChatbot';
import { useChatbotUiStore } from '@/features/chatbot/store/chatbotUiStore';
import { detectDeepLink } from '@/features/chatbot/utils/deepLinks';
import { useVoiceAssistant } from '@/features/voice/components/VoiceAssistantProvider';
import { VoiceStatusStrip } from '@/features/voice/components/VoiceStatusStrip';
import { VoicePageContext } from '@/features/voice/context/VoicePageContext';
import { useVoiceComposer } from '@/features/voice/hooks/useVoiceComposer';

/**
 * The persistent citizen assistant: one multimodal widget, not two.
 *
 * Mounted once in the citizen `AppShell` so it is available on every citizen
 * page and the conversation survives route changes. It used to be a floating
 * text panel (`FloatingChatbot`) with a *second*, independent floating panel
 * (`VoiceAssistantPanel`) stacked on the same corner whenever voice mode was
 * on — two launchers, two status displays, one conversation only the text
 * one actually saw. This is the merge: a single launcher, a single panel,
 * where the mic is just another way to fill the same composer that feeds
 * `useChatbot` — Conversation History, Message List, Text Input, Voice
 * Button, Speech Recognition and Text-to-Speech all live here together.
 *
 * Reuses `ChatWindow` and `useChatbot` verbatim — no second chatbot, no
 * second RAG path — and the same `VoiceAssistantProvider` pipeline every
 * other voice-aware page already shares.
 *
 * Citizen-only: it is never mounted in the agent portal, which has its own
 * Assistant IA page.
 */
export function FloatingChatbot() {
  const isOpen = useChatbotUiStore((state) => state.isOpen);
  const close = useChatbotUiStore((state) => state.close);
  const pendingQuestion = useChatbotUiStore((state) => state.pendingQuestion);
  const consumePendingQuestion = useChatbotUiStore((state) => state.consumePendingQuestion);

  const controller = useChatbot();
  const navigate = useNavigate();

  // Focus management for the floating panel (RGAA 12.8 / WCAG 2.4.3): a
  // keyboard or screen-reader user who opens it lands inside it, Escape
  // closes it from anywhere in the panel, and closing it (by any means)
  // hands focus back to the launcher instead of dropping it into the void.
  // The launcher itself now lives in `FloatingActionBubbles` (the Mistral
  // bubble, bottom-left) — found by id rather than a shared ref, since the
  // two components don't otherwise know about each other.
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);

  const {
    status: voiceStatus,
    transcript,
    error: voiceError,
    isRecording,
    toggleRecording,
    speakText,
    stopSpeaking,
  } = useVoiceComposer(controller.send);
  // Quick navigation commands ("Accueil", "Documents", "Lire la page"…) reuse
  // the same deterministic resolver the old voice panel used — kept, not
  // dropped, just folded into this one widget instead of a second one.
  const { triggerCommand } = useVoiceAssistant();
  const pageContext = useContext(VoicePageContext);
  const [showQuickActions, setShowQuickActions] = useState(false);

  // 'history' swaps the composer for the day-by-day view of the same
  // persisted thread (see `ConversationHistory`) — not a second thread, just
  // another way to look at the one the citizen already has.
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const pendingScrollIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (view !== 'chat' || !pendingScrollIdRef.current) return;
    const id = pendingScrollIdRef.current;
    pendingScrollIdRef.current = null;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`chat-message-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [view]);

  const resumeConversation = (firstMessageId: string) => {
    pendingScrollIdRef.current = firstMessageId;
    setView('chat');
  };

  // Off by default: an assistant that starts talking on its own, unasked, is
  // not what "texte uniquement" citizens expect. Opt in per session instead.
  const [readRepliesAloud, setReadRepliesAloud] = useState(false);
  const lastSpokenIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!readRepliesAloud) return;
    const lastMessage = controller.messages[controller.messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant') return;
    if (lastSpokenIdRef.current === lastMessage.id) return;
    lastSpokenIdRef.current = lastMessage.id;
    speakText(lastMessage.content);
  }, [controller.messages, readRepliesAloud, speakText]);

  // A question queued elsewhere (header help, documentation form) opens the panel
  // and is sent once. `send` is stable, so this fires only when a question lands.
  useEffect(() => {
    if (pendingQuestion === null) return;
    const question = consumePendingQuestion();
    if (question) controller.send(question);
  }, [pendingQuestion, consumePendingQuestion, controller]);

  // Suggest a destination from the citizen's most recent question.
  const lastUserMessage = [...controller.messages].reverse().find((m) => m.role === 'user');
  const deepLink = detectDeepLink(lastUserMessage?.content);

  const goTo = (to: string) => {
    close();
    navigate(to);
  };

  const handleReadPage = () => {
    if (pageContext?.readableText) speakText(pageContext.readableText);
    else speakText("Il n'y a aucun contenu lisible sur cette page.");
  };

  useEffect(() => {
    if (isOpen) {
      // Panel just opened — move focus inside it, past the launcher button
      // that's now hidden.
      panelRef.current?.focus();
    } else if (wasOpenRef.current) {
      // Panel just closed — the launcher is the only thing that reopens it,
      // so that's where focus belongs, not lost on <body>.
      document.getElementById('assistant-launcher-bubble')?.focus();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  const handlePanelKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  };

  return (
    <>
      {/* Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Assistant"
          aria-modal="false"
          tabIndex={-1}
          onKeyDown={handlePanelKeyDown}
          className="fixed bottom-5 right-5 z-50 flex h-[min(680px,85vh)] w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-soft focus:outline-none"
        >
          <header className="flex items-center justify-between border-b border-border bg-ai px-4 py-3 text-primary-foreground">
            <span className="flex items-center gap-2 text-label-md">
              <MessageCircle className="size-5" aria-hidden="true" />
              {view === 'history' ? 'Historique' : 'Assistant'}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setView((value) => (value === 'history' ? 'chat' : 'history'))}
                aria-pressed={view === 'history'}
                aria-label={
                  view === 'history' ? 'Revenir à la conversation' : "Voir l'historique des conversations"
                }
                title={view === 'history' ? 'Revenir à la conversation' : 'Historique des conversations'}
                className="rounded-lg p-1.5 transition-colors hover:bg-white/15"
              >
                <Clock className="size-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setReadRepliesAloud((value) => !value)}
                aria-pressed={readRepliesAloud}
                aria-label={
                  readRepliesAloud
                    ? 'Désactiver la lecture audio des réponses'
                    : 'Activer la lecture audio des réponses'
                }
                title={readRepliesAloud ? 'Lecture audio activée' : 'Lecture audio désactivée'}
                className="rounded-lg p-1.5 transition-colors hover:bg-white/15"
              >
                {readRepliesAloud ? (
                  <Volume2 className="size-5" aria-hidden="true" />
                ) : (
                  <VolumeX className="size-5" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={close}
                aria-label="Fermer l’assistant"
                className="rounded-lg p-1.5 transition-colors hover:bg-white/15"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
          </header>

          {view === 'history' ? (
            <ConversationHistory messages={controller.messages} onResume={resumeConversation} />
          ) : (
            <>
              {deepLink && (
                <div className="border-b border-border bg-ai-surface px-4 py-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full justify-between border-ai/30 bg-surface-lowest"
                    onClick={() => goTo(deepLink.to)}
                  >
                    {deepLink.label}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              )}

              <VoiceStatusStrip
                status={voiceStatus}
                transcript={transcript}
                error={voiceError}
                onStopSpeaking={stopSpeaking}
              />

              <div className="flex flex-1 flex-col overflow-y-auto px-4 py-3">
                <ChatWindow controller={controller} onVoiceInput={toggleRecording} isRecording={isRecording} />
              </div>
            </>
          )}

          {/* Quick navigation commands — collapsed by default so the panel
              reads as a chat first, a command console second. Hidden in the
              history view: it acts on the live conversation, not the list. */}
          {view === 'chat' && (
            <div className="border-t border-border">
              <button
                type="button"
                onClick={() => setShowQuickActions((value) => !value)}
                aria-expanded={showQuickActions}
                className="flex w-full items-center justify-between px-4 py-2 text-label-sm text-on-surface-variant transition-colors hover:bg-surface-high"
              >
                Actions rapides
                {showQuickActions ? (
                  <ChevronUp className="size-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-4" aria-hidden="true" />
                )}
              </button>
              {showQuickActions && (
                <div className="grid grid-cols-2 gap-2 px-4 pb-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start gap-2"
                    onClick={() => triggerCommand("assistant aller a l'accueil")}
                  >
                    <Home className="size-4" aria-hidden="true" />
                    Accueil
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start gap-2"
                    onClick={() => triggerCommand('assistant ouvrir mes documents')}
                  >
                    <Files className="size-4" aria-hidden="true" />
                    Documents
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="col-span-2 justify-start gap-2"
                    onClick={handleReadPage}
                  >
                    <Volume2 className="size-4" aria-hidden="true" />
                    Lire la page à voix haute
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
