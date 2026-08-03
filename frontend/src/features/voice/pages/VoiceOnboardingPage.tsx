import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Mic, PenLine, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVoiceStore } from '../store/voiceStore';
import { MistralTtsProvider } from '../providers/MistralTtsProvider';
import { MistralSttProvider } from '../providers/MistralSttProvider';
import type { TextToSpeechProvider, SpeechToTextProvider } from '../types';
import { ROUTES } from '@/app/router/paths';

export const VoiceOnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { enableVoiceMode, disableVoiceMode, setHasSeenVoiceOnboarding } = useVoiceStore();
  const [isListening, setIsListening] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const tts = useRef<TextToSpeechProvider | null>(null);
  const stt = useRef<SpeechToTextProvider | null>(null);

  const onboardingText =
    "Bonjour. Bienvenue sur ton assistant citoyen. Je peux t'accompagner par la voix pour remplir ton dossier. Veux-tu activer l'assistant vocal ? Réponds par oui ou par non, ou clique sur l'un des boutons.";

  const handleEnable = () => {
    tts.current?.stop();
    stt.current?.stop();
    enableVoiceMode();
    setHasSeenVoiceOnboarding(true);
    navigate(ROUTES.home);
  };

  const handleDisable = () => {
    tts.current?.stop();
    stt.current?.stop();
    disableVoiceMode();
    setHasSeenVoiceOnboarding(true);
    navigate(ROUTES.home);
  };

  useEffect(() => {
    tts.current = new MistralTtsProvider();
    // Keep streaming on this page, but use longer slices to reduce partial-chunk decode errors
    // Faster response for short "oui/non" without too many partials
    stt.current = new MistralSttProvider({ sliceMs: 2500, minSliceBytes: 40000, coalesceTargetBytes: 120000, coalesceMinSlices: 3, deferUpload: true });

    // Register TTS end handler before speaking, then speak once (guard StrictMode remount).
    let speakTimer: number | null = null;

    tts.current.onEnd(() => {
      if (stt.current && stt.current.isSupported()) {
        setIsListening(true);
        stt.current.start();
        // Auto-stop after ~2.8s to ensure one decodable upload for short replies
        window.setTimeout(() => stt.current?.stop(), 2800);
      }
    });

    // Always speak the onboarding message on this page; start listening on TTS end.
    speakTimer = window.setTimeout(() => {
      tts.current?.speak(onboardingText);
    }, 0);

    stt.current.onTranscript((text) => {
      const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      if (['oui', 'ouais', 'yes', 'activer'].some(word => normalized.includes(word))) {
        handleEnable();
      } else if (['non', 'no', 'continuer sans', 'desactiver'].some(word => normalized.includes(word))) {
        handleDisable();
      } else {
        setStatusMessage(`Reconnu : "${text}". Réponds par oui ou par non.`);
      }
    });

    stt.current.onError(() => {
      setStatusMessage("Reconnaissance vocale non disponible.");
      setIsListening(false);
    });

    return () => {
      if (speakTimer) {
        window.clearTimeout(speakTimer);
      }
      tts.current?.stop();
      stt.current?.stop();
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 py-12">
      <div className="w-full max-w-xl text-center">
        <div className="mx-auto mb-8 flex size-24 items-center justify-center rounded-3xl bg-ai text-white shadow-soft">
          <Mic className="size-10" aria-hidden="true" />
        </div>

        <h1 className="mb-6 text-headline-lg-mobile text-primary md:text-display font-bold leading-tight">
          Assistant Vocal d'Accessibilité
        </h1>
        <p className="mb-10 text-body-lg text-on-surface-variant max-w-md mx-auto">
          Pour t'offrir l'expérience la plus fluide, l'assistant peut te guider oralement à chaque étape.
        </p>

        <div className="mb-10 grid gap-4 text-left sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface-lowest p-5 shadow-soft">
            <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-ai-surface text-ai">
              <FileText className="size-5" aria-hidden="true" />
            </span>
            <h2 className="mb-1 text-headline-md text-on-surface">Lecture de documents</h2>
            <p className="text-body-sm text-on-surface-variant">
              Je peux vous lire les informations de chaque page et expliquer les termes complexes.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-lowest p-5 shadow-soft">
            <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-ai-surface text-ai">
              <PenLine className="size-5" aria-hidden="true" />
            </span>
            <h2 className="mb-1 text-headline-md text-on-surface">Remplissage assisté</h2>
            <p className="text-body-sm text-on-surface-variant">
              Dictez vos informations et je m'occupe de remplir les formulaires pour vous.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center mb-8">
          <Button
            type="button"
            size="lg"
            className="flex items-center justify-center gap-3 h-16 text-body-lg px-8 rounded-2xl shadow-md hover:shadow-lg transition-all"
            onClick={handleEnable}
          >
            <Volume2 className="size-6 animate-pulse" />
            Activer l'assistant vocal
          </Button>

          <Button
            type="button"
            variant="outline"
            size="lg"
            className="flex items-center justify-center gap-3 h-16 text-body-lg px-8 rounded-2xl border-border hover:bg-surface-container transition-all"
            onClick={handleDisable}
          >
            <VolumeX className="size-6" />
            Continuer sans assistant
          </Button>
        </div>

        {/* Listening indicator */}
        <div className="flex flex-col items-center justify-center min-h-16">
          {isListening ? (
            <div className="flex items-center gap-2 text-primary font-medium">
              <span className="relative flex size-3">
                <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
                <span className="relative inline-flex size-3 rounded-full bg-primary" />
              </span>
              <span>Écoute active : réponds "oui" ou "non"...</span>
            </div>
          ) : (
            <p className="text-body-sm text-outline">
              L'écoute automatique démarrera après la fin du message audio.
            </p>
          )}

          {statusMessage && (
            <p className="mt-4 text-body-sm text-on-surface-variant font-medium bg-surface-container rounded-lg px-4 py-2 border border-border">
              {statusMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
