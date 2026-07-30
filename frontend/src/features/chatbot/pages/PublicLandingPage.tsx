import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ChatWindow } from '@/features/chatbot/components/ChatWindow';
import { useChatbot } from '@/features/chatbot/hooks/useChatbot';
import { useChatbotUiStore } from '@/features/chatbot/store/chatbotUiStore';
import { VoicePageProvider } from '@/features/voice/context/VoicePageContext';
import { VoiceAssistantProvider, useVoiceAssistant } from '@/features/voice/components/VoiceAssistantProvider';
import { VoiceAssistantPanel } from '@/features/voice/components/VoiceAssistantPanel';
import { useVoiceStore } from '@/features/voice/store/voiceStore';

/**
 * Inner content that lives inside the voice providers so hooks like
 * `useVoiceAssistant()` have the required context.
 */
function PublicLandingPageContent() {
  useDocumentTitle("Ad'Ministral — Assistant");
  const controller = useChatbot();

  // ── Consume queued questions from the voice assistant ─────────────
  const pendingQuestion = useChatbotUiStore((s) => s.pendingQuestion);
  const consumePendingQuestion = useChatbotUiStore((s) => s.consumePendingQuestion);

  useEffect(() => {
    if (pendingQuestion === null) return;
    const q = consumePendingQuestion();
    if (q) controller.send(q);
  }, [pendingQuestion, consumePendingQuestion, controller]);

  // ── Auto-speak assistant replies when voice mode is on ────────────
  const voice = useVoiceAssistant();
  const modeVocal = useVoiceStore((s) => s.modeVocal);
  const lastSpokenId = useRef<string | null>(null);

  useEffect(() => {
    if (!modeVocal || controller.messages.length === 0) return;
    const last = controller.messages[controller.messages.length - 1];
    if (last.role !== 'assistant') return;
    if (lastSpokenId.current === last.id) return;
    lastSpokenId.current = last.id;
    voice.speakText(String(last.content ?? ''));
  }, [controller.messages, modeVocal, voice]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-header items-center justify-between border-b border-border bg-surface-lowest px-margin-mobile md:px-gutter">
        <Logo />
        <Button asChild>
          <Link to={ROUTES.login}>Se connecter</Link>
        </Button>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-container flex-1 flex-col px-margin-mobile py-8 focus:outline-none md:px-gutter"
      >
        <div className="mb-6 text-center">
          <h1 className="text-headline-lg text-primary">Comment pouvons-nous vous aider ?</h1>
          <p className="mx-auto mt-2 max-w-form text-body-md text-on-surface-variant">
            Posez vos questions sur votre éligibilité, une démarche ou un document — sans avoir
            besoin de créer de compte.
          </p>
        </div>

        <ChatWindow controller={controller} />
      </main>

      <VoiceAssistantPanel />
    </div>
  );
}

/**
 * Public entry point (`/`) for a visitor with no session.
 *
 * The assistant first, an account second: a citizen unsure whether they are
 * even eligible should not have to register before finding out. It is the
 * same `useChatbot` + `ChatWindow` the authenticated `/chat` page uses — the
 * anonymous case was already supported server-side
 * (`get_current_user_optional`), so nothing new was needed there, only a
 * place to reach it before signing in.
 *
 * "Se connecter" is the only way further in from here; there is no session
 * to protect and nothing to fabricate for one that does not exist yet.
 *
 * Voice providers are mounted here (not in `AppProviders`, which sits outside
 * the router) so that PTT and auto-speak work on the public landing page.
 */
export default function PublicLandingPage() {
  return (
    <VoicePageProvider>
      <VoiceAssistantProvider>
        <PublicLandingPageContent />
      </VoiceAssistantProvider>
    </VoicePageProvider>
  );
}
