import { useEffect, useRef, useState } from 'react';
import { FileText, Mic, PenLine, Volume2, VolumeX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useVoiceStore } from '../store/voiceStore';
import { MistralTtsProvider } from '../providers/MistralTtsProvider';
import { MistralSttProvider } from '../providers/MistralSttProvider';
import type { TextToSpeechProvider, SpeechToTextProvider } from '../types';

const ONBOARDING_TEXT =
  "Bonjour. Bienvenue sur ton assistant citoyen. Je peux t'accompagner par la voix pour remplir ton dossier. Veux-tu activer l'assistant vocal ? Réponds par oui ou par non, ou clique sur l'un des boutons.";

/**
 * The voice-or-not choice, now a glass popup over the landing page instead of
 * a full-page redirect (see `HomeRoute` / `PublicLandingPage`) — the visitor
 * sees the real page, softened behind it, rather than a blank interstitial.
 * Any way of dismissing (Escape, backdrop click, the close button) counts as
 * "continue without assistant" so the choice can never trap the visitor.
 */
export function VoiceOnboardingDialog() {
  const hasSeenVoiceOnboarding = useVoiceStore((state) => state.hasSeenVoiceOnboarding);
  const { enableVoiceMode, disableVoiceMode, setHasSeenVoiceOnboarding } = useVoiceStore();
  const open = !hasSeenVoiceOnboarding;

  const [isListening, setIsListening] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const tts = useRef<TextToSpeechProvider | null>(null);
  const stt = useRef<SpeechToTextProvider | null>(null);

  const handleEnable = () => {
    tts.current?.stop();
    stt.current?.stop();
    enableVoiceMode();
    setHasSeenVoiceOnboarding(true);
  };

  const handleDisable = () => {
    tts.current?.stop();
    stt.current?.stop();
    disableVoiceMode();
    setHasSeenVoiceOnboarding(true);
  };

  useEffect(() => {
    if (!open) return;

    tts.current = new MistralTtsProvider();
    stt.current = new MistralSttProvider({
      sliceMs: 2500,
      minSliceBytes: 40000,
      coalesceTargetBytes: 120000,
      coalesceMinSlices: 3,
      deferUpload: true,
    });

    let speakTimer: number | null = null;

    tts.current.onEnd(() => {
      if (stt.current && stt.current.isSupported()) {
        setIsListening(true);
        stt.current.start();
        window.setTimeout(() => stt.current?.stop(), 2800);
      }
    });

    speakTimer = window.setTimeout(() => {
      tts.current?.speak(ONBOARDING_TEXT);
    }, 0);

    stt.current.onTranscript((text) => {
      const normalized = text
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .trim();
      if (['oui', 'ouais', 'yes', 'activer'].some((word) => normalized.includes(word))) {
        handleEnable();
      } else if (['non', 'no', 'continuer sans', 'desactiver'].some((word) => normalized.includes(word))) {
        handleDisable();
      } else {
        setStatusMessage(`Reconnu : "${text}". Réponds par oui ou par non.`);
      }
    });

    stt.current.onError(() => {
      setStatusMessage('Reconnaissance vocale non disponible.');
      setIsListening(false);
    });

    return () => {
      if (speakTimer) window.clearTimeout(speakTimer);
      tts.current?.stop();
      stt.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleDisable(); }}>
      <DialogContent
        overlayClassName="backdrop-blur-md bg-ink/30"
        className="max-w-lg overflow-hidden rounded-sm border-brand/20 bg-white/95 p-8 text-center shadow-soft backdrop-blur-sm duration-300 data-[state=open]:slide-in-from-bottom-2"
      >
        <div className="pointer-events-none absolute -right-14 -top-14 size-48 rounded-full bg-brand/10 blur-3xl animate-pulse [animation-duration:4s]" />
        <div className="pointer-events-none absolute -bottom-16 -left-12 size-40 rounded-full bg-chart-2/10 blur-3xl animate-pulse [animation-duration:5s]" />

        <div className="relative">
          <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-sm bg-ai text-white shadow-soft">
            <Mic className="size-9" aria-hidden="true" />
          </div>

          <DialogTitle className="mb-3 font-display text-headline-lg-mobile text-ink">
            Assistant Vocal d'Accessibilité
          </DialogTitle>
          <DialogDescription className="mb-8 text-sm leading-relaxed text-muted-foreground">
            Pour t'offrir l'expérience la plus fluide, l'assistant peut te guider oralement à
            chaque étape.
          </DialogDescription>

          <div className="mb-8 grid gap-3 text-left sm:grid-cols-2">
            <div className="rounded-sm border border-border bg-surface-lowest p-4 shadow-soft">
              <span className="mb-2 flex size-9 items-center justify-center rounded-sm bg-ai-surface text-ai">
                <FileText className="size-4" aria-hidden="true" />
              </span>
              <p className="text-body-sm font-semibold text-on-surface">Lecture de documents</p>
            </div>
            <div className="rounded-sm border border-border bg-surface-lowest p-4 shadow-soft">
              <span className="mb-2 flex size-9 items-center justify-center rounded-sm bg-ai-surface text-ai">
                <PenLine className="size-4" aria-hidden="true" />
              </span>
              <p className="text-body-sm font-semibold text-on-surface">Remplissage assisté</p>
            </div>
          </div>

          <div className="mb-6 flex flex-col gap-3">
            <Button
              type="button"
              size="lg"
              className="flex h-14 items-center justify-center gap-2 rounded-sm px-6 text-body-md shadow-soft transition-all hover:shadow-soft-hover"
              onClick={handleEnable}
            >
              <Volume2 className="size-5 animate-pulse" />
              Activer l'assistant vocal
            </Button>

            <Button
              type="button"
              variant="outline"
              size="lg"
              className="flex h-14 items-center justify-center gap-2 rounded-sm border-border px-6 text-body-md transition-all hover:bg-surface-container"
              onClick={handleDisable}
            >
              <VolumeX className="size-5" />
              Continuer sans assistant
            </Button>
          </div>

          <div className="flex min-h-10 flex-col items-center justify-center">
            {isListening ? (
              <div className="flex items-center gap-2 text-label-md text-primary">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
                </span>
                <span>Écoute active : réponds "oui" ou "non"...</span>
              </div>
            ) : (
              <p className="text-body-sm text-outline">
                L'écoute automatique démarrera après la fin du message audio.
              </p>
            )}

            {statusMessage && (
              <p className="mt-3 rounded-sm border border-border bg-surface-container px-4 py-2 text-body-sm font-medium text-on-surface-variant">
                {statusMessage}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
