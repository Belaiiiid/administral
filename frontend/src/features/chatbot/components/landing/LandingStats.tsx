import { Bot, Clock, Leaf } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface StatItem {
  icon: LucideIcon;
  value: string;
  label: string;
}

// Indicative figures — not yet computed from real usage data.
const STATS: StatItem[] = [
  { icon: Clock, value: '18 minutes', label: 'Temps économisé' },
  { icon: Leaf, value: '2 feuilles papier', label: 'Empreinte carbone évitée' },
  { icon: Bot, value: '1 240 aujourd’hui', label: 'Démarches accompagnées' },
];

export function LandingStats() {
  return (
    <section className="border-t border-border py-10">
      <dl className="mx-auto grid max-w-container gap-4 sm:grid-cols-3">
        {STATS.map(({ icon: Icon, value, label }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface-lowest p-6 text-center shadow-soft"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-ai-surface text-ai">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <dd className="text-headline-md text-on-surface">{value}</dd>
            <dt className="text-body-sm text-on-surface-variant">{label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
