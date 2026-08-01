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
      <ul className="mx-auto grid max-w-form gap-3 sm:grid-cols-2 sm:max-w-none sm:gap-4">
        {BENEFITS.map((benefit) => (
          <li key={benefit} className="flex items-start gap-3 text-body-md text-on-surface">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success-surface text-success">
              <Check className="size-3.5" aria-hidden="true" />
            </span>
            {benefit}
          </li>
        ))}
      </ul>
    </section>
  );
}
