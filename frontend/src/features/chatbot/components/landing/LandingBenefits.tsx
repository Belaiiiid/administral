import { Check } from 'lucide-react';

const BENEFITS = [
  'Estimation APL en quelques minutes',
  'Assistance 24h/24',
  'Accompagnement personnalisé',
  'Aucune donnée personnelle demandée au départ',
] as const;

export function LandingBenefits() {
  return (
    <section className="border-t border-border py-10">
      <h2 className="mb-6 text-center text-headline-md text-on-surface">
        Pourquoi utiliser MonParcours ?
      </h2>
      <ul className="mx-auto grid max-w-container gap-4 sm:grid-cols-2">
        {BENEFITS.map((benefit, index) => (
          <li
            key={benefit}
            className={
              index === 0
                ? 'flex items-center gap-3 rounded-3xl bg-ai-surface p-6 text-body-md text-on-surface shadow-soft'
                : 'flex items-center gap-3 rounded-3xl border border-border bg-surface-lowest p-6 text-body-md text-on-surface shadow-soft'
            }
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success-surface text-success">
              <Check className="size-4" aria-hidden="true" />
            </span>
            {benefit}
          </li>
        ))}
      </ul>
    </section>
  );
}
