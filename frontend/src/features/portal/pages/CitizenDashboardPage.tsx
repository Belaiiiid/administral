import { ArrowRight, Banknote, Bot, Building2, Clock, FileCheck2, Home, Lock, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { CAF_SERVICES, type CafServiceId } from '@/app/config/cafServices';
import { ROUTES } from '@/app/router/paths';
import { CitizenPageHeader } from '@/components/citizen/CitizenPageHeader';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useVoicePage } from '@/features/voice/context/VoicePageContext';
import type { VoicePageAction } from '@/features/voice/types';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/store/sessionStore';

interface DashboardStat {
  icon: LucideIcon;
  value: string;
  label: string;
}

/**
 * Indicative figures, presented the same way as the public landing page's
 * stats band — no citizen-facing analytics endpoint exists yet, so these are
 * illustrative placeholders, not live-computed counts.
 */
const DASHBOARD_STATS: DashboardStat[] = [
  { icon: Users, value: '12 400+', label: 'Citoyens accompagnés' },
  { icon: FileCheck2, value: '8 900+', label: 'Dossiers traités' },
  { icon: Clock, value: '< 2 min', label: 'Temps moyen de réponse' },
  { icon: Bot, value: '24h/24, 7j/7', label: 'Disponibilité de l’assistant IA' },
];

/** One recognisable icon per CAF service, rather than a single generic mark repeated on every card. */
const CAF_SERVICE_ICONS: Record<CafServiceId, LucideIcon> = {
  apl: Home,
  af: Users,
  alf: Building2,
  'prime-activite': Banknote,
};

/** Icon-chip and CTA colour per service — mirrors the Administral reference's CAF services section. */
const CAF_SERVICE_TONE: Record<CafServiceId, { chip: string; cta: string; featured: boolean }> = {
  apl: { chip: 'bg-brand text-marianne-foreground', cta: 'bg-brand text-marianne-foreground hover:opacity-90', featured: true },
  af: { chip: 'bg-pink-600 text-white', cta: 'border border-border hover:bg-brand-soft', featured: false },
  alf: { chip: 'bg-purple-600 text-white', cta: 'border border-border hover:bg-brand-soft', featured: false },
  'prime-activite': { chip: 'bg-emerald-600 text-white', cta: 'border border-border hover:bg-brand-soft', featured: false },
};

/**
 * "Mes services" — CAF's own services, reached once CAF has been chosen on
 * `/administrations`. No profile gate here any more: the questions to ask
 * depend on *which* service is opened, so profiling now happens per service,
 * on entering it (see `RequireApplProfile`), not once globally before this
 * hub even shows.
 *
 * Only `apl` is wired to a real backend; the rest render as locked tiles
 * rather than pretending to be functional. Reachable without an account
 * (see `ROUTES.administrations`) — opening APL à l'Aide while unauthenticated
 * sends the citizen to the public chatbot (`ROUTES.home`) instead of the real
 * dossier, exactly like following any other link into the citizen area would.
 */
export default function CitizenDashboardPage() {
  useDocumentTitle('Mes services');
  const { displayName, isAuthenticated } = useSessionStore();
  const navigate = useNavigate();

  const aplAction: VoicePageAction = {
    id: 'select_apl',
    label: 'APL à l’Aide',
    description: 'Ouvrir le service APL à l’Aide',
    intent: { type: 'click_action', actionId: 'select_apl' },
  };

  useVoicePage({
    readableText:
      'Page des services CAF. Seule l’APL à l’Aide est disponible pour le moment, les autres services arriveront bientôt.',
    actions: [aplAction],
    actionCallbacks: {
      select_apl: () => navigate(isAuthenticated ? ROUTES.dossier : ROUTES.home),
    },
  });

  return (
    <div className="mx-auto max-w-7xl">
      <CitizenPageHeader
        eyebrow="Espace citoyen"
        title="Mes services"
        description={
          displayName
            ? `Bienvenue ${displayName}, choisissez le service que vous souhaitez utiliser.`
            : 'Choisissez le service que vous souhaitez utiliser.'
        }
      />

      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {DASHBOARD_STATS.map((stat) => (
          <li key={stat.label}>
            <div className="flex h-full items-center gap-4 rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition-all duration-300 hover:border-brand/30 hover:shadow-lg">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <stat.icon className="size-6" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </p>
                <p className="font-display text-xl font-extrabold text-ink">{stat.value}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <p className="eyebrow mb-3 mt-14">Administration CAF</p>
      <h2 className="mb-8 font-display text-2xl font-extrabold leading-tight text-ink">
        Les services CAF
      </h2>

      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {CAF_SERVICES.map((service) => {
          const isAvailable = service.status === 'available';
          const target = service.id === 'apl' && !isAuthenticated ? ROUTES.home : service.basePath;
          const Icon = CAF_SERVICE_ICONS[service.id];
          const tone = CAF_SERVICE_TONE[service.id];

          const content = (
            <article
              className={cn(
                'relative flex h-full flex-col justify-between rounded-2xl p-6 shadow-sm transition-all duration-300',
                tone.featured
                  ? 'border-2 border-brand bg-surface'
                  : 'border border-border/60 bg-surface hover:border-brand/30 hover:shadow-lg',
                !isAvailable && 'opacity-60',
              )}
            >
              {tone.featured && (
                <span className="absolute right-0 top-0 rounded-bl-xl rounded-tr-2xl bg-brand px-3 py-1 text-[9px] font-extrabold uppercase text-marianne-foreground">
                  {service.id}
                </span>
              )}
              <div>
                <div className="flex items-start justify-between gap-3">
                  <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', tone.chip)}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  {!isAvailable && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-[11px] font-semibold text-brand">
                      <Lock className="size-3" aria-hidden="true" />
                      Bientôt
                    </span>
                  )}
                </div>
                <p className="mt-4 font-display text-lg font-extrabold text-ink">{service.name}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{service.description}</p>
              </div>
              <span
                className={cn(
                  'mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all',
                  isAvailable ? tone.cta : 'invisible',
                )}
                aria-hidden={!isAvailable}
              >
                Ouvrir
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </span>
            </article>
          );

          return (
            <li key={service.id}>
              {isAvailable ? (
                <Link to={target} aria-label={`Ouvrir ${service.name}`}>
                  {content}
                </Link>
              ) : (
                <div aria-disabled="true">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
