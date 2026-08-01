import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { Logo } from '@/components/layout/Logo';
import { PartnerLogos } from '@/components/layout/PartnerLogos';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ChatWindow } from '@/features/chatbot/components/ChatWindow';
import { useChatbot } from '@/features/chatbot/hooks/useChatbot';
import { useChatbotUiStore } from '@/features/chatbot/store/chatbotUiStore';
import { LandingBenefits } from '@/features/chatbot/components/landing/LandingBenefits';
import { LandingHero, type AssistMode } from '@/features/chatbot/components/landing/LandingHero';
import { LandingStats } from '@/features/chatbot/components/landing/LandingStats';
import { WhatsAppQrCard } from '@/features/chatbot/components/landing/WhatsAppQrCard';
import { VoiceAssistantProvider } from '@/features/voice/components/VoiceAssistantProvider';
import { VoiceStatusStrip } from '@/features/voice/components/VoiceStatusStrip';
import { VoicePageProvider, useVoicePage } from '@/features/voice/context/VoicePageContext';
import { useVoiceComposer } from '@/features/voice/hooks/useVoiceComposer';
import { useVoiceStore } from '@/features/voice/store/voiceStore';

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
 * Before the assistant opens, the page reads as a marketing/trust page —
 * hero, benefits, stats — rather than an administrative portal, and the
 * citizen picks voice-or-text before starting rather than mid-conversation.
 *
 * Voice works here exactly as it does for a signed-in citizen: the backend
 * voice endpoints (`app/modules/voice`) never required a session, so the only
 * thing missing was mounting `VoicePageProvider` + `VoiceAssistantProvider` on
 * this route too, instead of only inside `AppShell`.
 */
export default function PublicLandingPage() {
  return (
    <VoicePageProvider>
      <VoiceAssistantProvider>
        <LandingContent />
      </VoiceAssistantProvider>
    </VoicePageProvider>
  );
}

function LandingContent() {
  useDocumentTitle('MonParcours — Assistant');
  const controller = useChatbot();
  const enableVoiceMode = useVoiceStore((state) => state.enableVoiceMode);
  const disableVoiceMode = useVoiceStore((state) => state.disableVoiceMode);

  const [started, setStarted] = useState(false);
  const [assistMode, setAssistMode] = useState<AssistMode>('text');

  const {
    status: voiceStatus,
    transcript,
    error: voiceError,
    isRecording,
    toggleRecording,
    speakText,
    stopSpeaking,
  } = useVoiceComposer(controller.send);

  // A citizen who picked "Assistant vocal + texte" was promised replies read
  // aloud too — not just a working mic. Text-only visitors get silence.
  const readRepliesAloud = assistMode === 'voice';
  const lastSpokenIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!readRepliesAloud) return;
    const lastMessage = controller.messages[controller.messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant') return;
    if (lastSpokenIdRef.current === lastMessage.id) return;
    lastSpokenIdRef.current = lastMessage.id;
    speakText(lastMessage.content);
  }, [controller.messages, readRepliesAloud, speakText]);

  // A visitor who used voice mode earlier in this browser tab must still
  // explicitly choose it again here — `modeVocal` persists in sessionStorage,
  // so without this reset the assistant would start listening on arrival,
  // before "Commencer ma démarche" was ever clicked on this page.
  useEffect(() => {
    disableVoiceMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useVoicePage({
    readableText:
      "Vous êtes sur la page d'accueil de MonParcours. Choisissez d'être accompagné à l'oral ou par écrit, puis commencez votre démarche pour estimer votre aide au logement.",
    actions: [],
  });

  const handleStart = () => {
    if (assistMode === 'voice') {
      enableVoiceMode();
    } else {
      disableVoiceMode();
    }
    setStarted(true);
  };

  // ── Consume queued questions from the voice assistant ─────────────
  const pendingQuestion = useChatbotUiStore((s) => s.pendingQuestion);
  const consumePendingQuestion = useChatbotUiStore((s) => s.consumePendingQuestion);

  useEffect(() => {
    if (pendingQuestion === null) return;
    const q = consumePendingQuestion();
    if (q) controller.send(q);
  }, [pendingQuestion, consumePendingQuestion, controller]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-header items-center justify-between border-b border-border bg-surface-lowest px-margin-mobile md:px-gutter">
        <div className="flex items-center gap-4">
          <Logo />
          <div className="hidden border-l border-border pl-4 sm:block">
            <PartnerLogos />
          </div>
        </div>
        <Button asChild>
          <Link to={ROUTES.login}>Se connecter</Link>
        </Button>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-container flex-1 flex-col px-margin-mobile py-8 focus:outline-none md:px-gutter"
      >
        {started ? (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-headline-lg text-primary">Comment pouvons-nous vous aider ?</h1>
              <p className="mx-auto mt-2 max-w-form text-body-md text-on-surface-variant">
                Posez vos questions sur votre éligibilité, une démarche ou un document — sans
                avoir besoin de créer de compte.
              </p>
            </div>
            <VoiceStatusStrip
              status={voiceStatus}
              transcript={transcript}
              error={voiceError}
              onStopSpeaking={stopSpeaking}
            />
            <ChatWindow controller={controller} onVoiceInput={toggleRecording} isRecording={isRecording} />
          </>
        ) : (
          <>
            <LandingHero mode={assistMode} onModeChange={setAssistMode} onStart={handleStart} />
            <LandingBenefits />
            <LandingStats />
            <section className="border-t border-border py-10">
              <div className="mx-auto max-w-form">
                <WhatsAppQrCard />
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="border-t border-border py-6 text-center">
        <p className="mb-2 text-label-sm uppercase tracking-wide text-on-surface-variant">
          Powered by
        </p>
        <div className="flex items-center justify-center gap-4">
          <span className="text-label-sm font-semibold text-on-surface">MonParcours</span>
          <span className="text-on-surface-variant">•</span>
          <PartnerLogos />
        </div>
      </footer>
    </div>
  );
}
