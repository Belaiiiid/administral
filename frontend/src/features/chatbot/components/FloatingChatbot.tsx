import { ArrowRight, MessageCircle, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChatWindow } from '@/features/chatbot/components/ChatWindow';
import { useChatbot } from '@/features/chatbot/hooks/useChatbot';
import { useChatbotUiStore } from '@/features/chatbot/store/chatbotUiStore';
import { detectDeepLink } from '@/features/chatbot/utils/deepLinks';
import { useVoiceAssistant } from '@/features/voice/components/VoiceAssistantProvider';
import { useVoiceStore } from '@/features/voice/store/voiceStore';

/**
 * The persistent citizen assistant: a floating launcher and a slide-in panel,
 * mounted once in the citizen `AppShell` so it is available on every citizen
 * page and the conversation survives route changes.
 *
 * Reuses the existing `ChatWindow` and `useChatbot` verbatim — no second chatbot,
 * no second RAG path. It only adds the shell (button + panel), consumes a
 * pre-filled question from `chatbotUiStore`, and surfaces a navigation shortcut
 * when the citizen's last question clearly points at a place in the app.
 *
 * Citizen-only: it is never mounted in the agent portal, which has its own
 * Assistant IA page.
 */
export function FloatingChatbot() {
  const isOpen = useChatbotUiStore((state) => state.isOpen);
  const toggle = useChatbotUiStore((state) => state.toggle);
  const close = useChatbotUiStore((state) => state.close);
  const pendingQuestion = useChatbotUiStore((state) => state.pendingQuestion);
  const consumePendingQuestion = useChatbotUiStore((state) => state.consumePendingQuestion);

  const controller = useChatbot();
  const navigate = useNavigate();

  // Voice integration — speak assistant replies when voice mode is active
  const voice = useVoiceAssistant();
  const modeVocal = useVoiceStore((s) => s.modeVocal);
  const lastSpokenId = useRef<string | null>(null);

  // A question queued elsewhere (header help, documentation form) opens the panel
  // and is sent once. `send` is stable, so this fires only when a question lands.
  useEffect(() => {
    if (pendingQuestion === null) return;
    const question = consumePendingQuestion();
    if (question) controller.send(question);
  }, [pendingQuestion, consumePendingQuestion, controller]);

  // Auto-speak the latest assistant reply exactly once while voice mode is on
  useEffect(() => {
    const { messages } = controller;
    if (!modeVocal || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== 'assistant') return;
    if (lastSpokenId.current === last.id) return;
    lastSpokenId.current = last.id;
    voice.speakText(String(last.content ?? ''));
  }, [controller.messages, modeVocal, voice]);

  // Suggest a destination from the citizen's most recent question.
  const lastUserMessage = [...controller.messages].reverse().find((m) => m.role === 'user');
  const deepLink = detectDeepLink(lastUserMessage?.content);

  const goTo = (to: string) => {
    close();
    navigate(to);
  };

  return (
    <>
      {/* Launcher — hidden while the panel is open so it never overlaps it. */}
      <button
        type="button"
        onClick={toggle}
        aria-label={isOpen ? 'Fermer l’assistant' : 'Ouvrir l’assistant'}
        aria-expanded={isOpen}
        className={cn(
          'fixed bottom-5 right-5 z-40 flex size-14 items-center justify-center rounded-full bg-ai text-primary-foreground shadow-soft transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai focus-visible:ring-offset-2',
          isOpen && 'hidden',
        )}
      >
        <MessageCircle aria-hidden="true" />
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Assistant"
          className="fixed bottom-5 right-5 z-50 flex h-[min(620px,85vh)] w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-soft"
        >
          <header className="flex items-center justify-between border-b border-border bg-ai px-4 py-3 text-primary-foreground">
            <span className="flex items-center gap-2 text-label-md">
              <MessageCircle className="size-5" aria-hidden="true" />
              Assistant
            </span>
            <button
              type="button"
              onClick={close}
              aria-label="Fermer l’assistant"
              className="rounded-lg p-1 transition-colors hover:bg-white/15"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </header>

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

          <div className="flex flex-1 flex-col overflow-y-auto px-4 py-3">
            <ChatWindow controller={controller} />
          </div>
        </div>
      )}
    </>
  );
}
