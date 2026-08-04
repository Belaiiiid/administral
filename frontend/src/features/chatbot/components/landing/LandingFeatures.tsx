import { MessagesSquare, Mic } from 'lucide-react';

import { APP_CONFIG } from '@/app/config/app';

interface LandingFeaturesProps {
  onStartChat: () => void;
  onStartVoice: () => void;
}

/**
 * "Canaux intelligents" — structural twin of the reference design-to-code
 * channels section, wired to this app's real behaviour: the chat and voice
 * cards start the embedded assistant in place (see `PublicLandingPage`);
 * WhatsApp opens the real bot number.
 */
export function LandingFeatures({ onStartChat, onStartVoice }: LandingFeaturesProps) {
  return (
    <section id="fonctionnalites" className="bg-white py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Fonctionnalités intelligentes</p>
          <h2 className="mt-4 text-3xl font-extrabold leading-tight text-ink sm:text-4xl">
            Un accompagnement à votre image, par la voix, le chat ou WhatsApp
          </h2>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <button
            type="button"
            onClick={onStartChat}
            className="rounded-2xl border border-border/60 bg-card p-8 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand/30 hover:shadow-lg"
          >
            <span className="flex size-16 items-center justify-center rounded-2xl bg-blue-50 text-brand">
              <MessagesSquare className="size-8" aria-hidden="true" />
            </span>
            <p className="mt-6 font-display text-2xl font-bold text-ink">Chatbot IA</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Discutez avec notre assistant intelligent 24h/24 et 7j/7. Obtenez des réponses
              immédiates sur vos démarches CAF, France Travail et Assurance Maladie.
            </p>
          </button>

          <button
            type="button"
            onClick={onStartVoice}
            className="rounded-2xl border border-border/60 bg-card p-8 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand/30 hover:shadow-lg"
          >
            <span className="flex size-16 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
              <Mic className="size-8" aria-hidden="true" />
            </span>
            <p className="mt-6 font-display text-2xl font-bold text-ink">Assistant vocal</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Parlez naturellement avec notre assistant vocal pour effectuer vos démarches les
              mains libres.
            </p>
          </button>

          <a
            href={APP_CONFIG.whatsappBotUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border border-border/60 bg-card p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand/30 hover:shadow-lg"
          >
            <span className="flex size-16 items-center justify-center rounded-2xl border border-border/60 bg-white">
              <img src="/whatsapp-logo.svg" alt="" aria-hidden="true" className="size-9 object-contain" />
            </span>
            <p className="mt-6 font-display text-2xl font-bold text-ink">WhatsApp</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Accédez à vos services depuis WhatsApp. Simple, rapide et pratique au quotidien.
            </p>
          </a>
        </div>
      </div>
    </section>
  );
}
