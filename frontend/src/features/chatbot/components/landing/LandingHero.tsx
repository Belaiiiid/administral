import { MessageCircle, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';

export type AssistMode = 'voice' | 'text';

interface LandingHeroProps {
  mode: AssistMode;
  onModeChange: (mode: AssistMode) => void;
  onStart: () => void;
}

export function LandingHero({ mode, onModeChange, onStart }: LandingHeroProps) {
  return (
    <section className="flex flex-col items-center gap-8 py-10 text-center">
      <span className="inline-flex items-center gap-2 rounded-full bg-secondary-fixed px-4 py-1.5 text-label-sm text-secondary-on-fixed">
        <ShieldCheck className="size-4" aria-hidden="true" />
        Plateforme officielle de l&rsquo;État français
      </span>

      <div className="flex size-20 items-center justify-center rounded-2xl bg-ai-surface text-ai">
        <MessageCircle className="size-10" aria-hidden="true" />
      </div>

      <div>
        <h1 className="text-display text-primary">
          Simplifiez vos démarches administratives grâce à l&rsquo;IA
        </h1>
        <p className="mx-auto mt-3 max-w-form text-body-lg text-on-surface-variant">
          Estimez votre aide au logement et obtenez un accompagnement personnalisé avant même de
          créer un compte.
        </p>
      </div>

      <div className="flex w-full max-w-form flex-col gap-3 text-left">
        <p className="text-label-md text-on-surface-variant">Comment souhaitez-vous être accompagné ?</p>
        <RadioGroup
          value={mode}
          onValueChange={(value) => onModeChange(value as AssistMode)}
          className="gap-3"
        >
          <RadioCard
            id="assist-mode-voice"
            value="voice"
            label="Assistant vocal + texte"
            description="Parlez à l'assistant, il vous répond aussi à l'oral."
          />
          <RadioCard
            id="assist-mode-text"
            value="text"
            label="Texte uniquement"
            description="Échangez par écrit, comme dans une messagerie."
          />
        </RadioGroup>
      </div>

      <Button size="lg" onClick={onStart}>
        Commencer ma démarche
      </Button>
    </section>
  );
}
