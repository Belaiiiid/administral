import { ArrowRight, MessagesSquare, Mic } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { APP_CONFIG } from '@/app/config/app';
import { Reveal } from '@/features/chatbot/components/landing/Reveal';
import { cn } from '@/lib/utils';

interface LandingFeaturesProps {
  onStartChat: () => void;
  onStartVoice: () => void;
}

interface ChannelCardProps {
  icon?: LucideIcon;
  /** Image mark used instead of a lucide icon (WhatsApp). */
  imageSrc?: string;
  chipClass: string;
  title: string;
  text: string;
  /** Short reassurance line under the description — gives each card a base. */
  meta: string;
  cta: string;
}

const CARD_CLASS =
  'group flex h-full w-full flex-col items-start rounded-sm border border-border/60 bg-card p-8 text-left shadow-soft transition-all duration-300 hover:-translate-y-1.5 hover:border-brand/40 hover:shadow-soft-hover hover:shadow-brand/10';

function CardBody({ icon: Icon, imageSrc, chipClass, title, text, meta, cta }: ChannelCardProps) {
  return (
    <>
      <span
        className={cn(
          'flex size-16 items-center justify-center rounded-sm transition-transform duration-300 group-hover:scale-110',
          chipClass,
        )}
      >
        {imageSrc ? (
          <img src={imageSrc} alt="" aria-hidden="true" className="size-9 object-contain" />
        ) : (
          Icon && <Icon className="size-8" aria-hidden="true" />
        )}
      </span>

      <p className="mt-6 font-display text-headline-lg-mobile text-ink">{title}</p>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">{text}</p>

      <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-label-md text-muted-foreground">
        {meta}
      </span>

      {/* Pushed to the bottom so all three cards line their CTA up. */}
      <span className="mt-auto flex items-center gap-2 pt-6 text-base font-semibold text-brand">
        {cta}
        <ArrowRight
          className="size-4 transition-transform duration-300 group-hover:translate-x-1.5"
          aria-hidden="true"
        />
      </span>
    </>
  );
}

/**
 * "Canaux intelligents" — structural twin of the reference design-to-code
 * channels section, wired to this app's real behaviour: the chat and voice
 * cards start the embedded assistant in place (see `PublicLandingPage`);
 * WhatsApp opens the real bot number.
 */
export function LandingFeatures({ onStartChat, onStartVoice }: LandingFeaturesProps) {
  return (
    <section id="fonctionnalites" className="relative overflow-hidden bg-surface-lowest py-24">
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-border to-transparent"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow text-sm">Fonctionnalités intelligentes</p>
            <h2 className="mt-4 font-display text-3xl font-extrabold leading-tight text-ink sm:text-4xl">
              Un accompagnement à votre image, par la voix, le chat ou WhatsApp
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Trois façons d’obtenir la même aide — choisissez celle qui vous convient, changez
              quand vous voulez.
            </p>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          <Reveal delayMs={0} className="h-full">
            <button type="button" onClick={onStartChat} className={CARD_CLASS}>
              <CardBody
                icon={MessagesSquare}
                chipClass="bg-brand-soft text-brand"
                title="Chatbot IA"
                text="Discutez avec notre assistant intelligent 24h/24 et 7j/7. Obtenez des réponses immédiates sur vos démarches CAF, France Travail et Assurance Maladie."
                meta="Réponse immédiate"
                cta="Démarrer une conversation"
              />
            </button>
          </Reveal>

          <Reveal delayMs={90} className="h-full">
            <button type="button" onClick={onStartVoice} className={CARD_CLASS}>
              <CardBody
                icon={Mic}
                chipClass="bg-chart-3/10 text-chart-3"
                title="Assistant vocal"
                text="Parlez naturellement avec notre assistant vocal pour effectuer vos démarches les mains libres."
                meta="Sans lecture ni saisie"
                cta="Parler à l’assistant"
              />
            </button>
          </Reveal>

          <Reveal delayMs={180} className="h-full">
            <a
              href={APP_CONFIG.whatsappBotUrl}
              target="_blank"
              rel="noreferrer"
              className={CARD_CLASS}
            >
              <CardBody
                imageSrc="/whatsapp-logo.svg"
                chipClass="border border-border/60 bg-surface-lowest"
                title="WhatsApp"
                text="Accédez à vos services depuis WhatsApp. Simple, rapide et pratique au quotidien."
                meta="Depuis votre téléphone"
                cta="Ouvrir WhatsApp"
              />
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
