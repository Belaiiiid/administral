import {
  ArrowRight,
  Banknote,
  Building2,
  FileText,
  FolderClock,
  Home,
  LogIn,
  MessagesSquare,
  Upload,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { CAF_SERVICES, type CafServiceId } from '@/app/config/cafServices';
import { getService } from '@/app/config/services';
import { ROUTES } from '@/app/router/paths';
import { CitizenPageHeader } from '@/components/citizen/CitizenPageHeader';
import { ServiceCard } from '@/components/citizen/ServiceCard';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useVoicePage } from '@/features/voice/context/VoicePageContext';
import type { VoicePageAction } from '@/features/voice/types';
import { useSessionStore } from '@/store/sessionStore';

/** One recognisable icon per CAF service, rather than a single generic mark repeated on every card. */
const CAF_SERVICE_ICONS: Record<CafServiceId, LucideIcon> = {
  apl: Home,
  af: Users,
  alf: Building2,
  'prime-activite': Banknote,
};

/** Badge accent per service — mirrors the artwork in `public/caf-services/`. */
const CAF_SERVICE_BADGE: Record<CafServiceId, string> = {
  apl: 'bg-brand',
  af: 'bg-secondary',
  alf: 'bg-chart-3',
  'prime-activite': 'bg-success',
};

interface QuickAction {
  icon: LucideIcon;
  label: string;
  hint: string;
  to: string;
}

/**
 * What a signed-in citizen actually comes back to do. Replaces the band of
 * invented counters ("12 400+ citoyens accompagnés") that used to sit here:
 * nothing computed them, and fabricated numbers have no place on a page that
 * speaks for a public administration.
 */
const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: Upload,
    label: 'Déposer un dossier',
    hint: 'Checklist des pièces et dépôt',
    to: ROUTES.dossier,
  },
  {
    icon: FolderClock,
    label: 'Suivre mon dossier',
    hint: 'Où en est l’instruction',
    to: ROUTES.suivi,
  },
  { icon: FileText, label: 'Mes documents', hint: 'Pièces déjà transmises', to: ROUTES.documents },
  {
    icon: MessagesSquare,
    label: 'Poser une question',
    hint: 'Assistant disponible 24h/24',
    to: ROUTES.chat,
  },
];

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
  const caf = getService('caf');

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
        backTo={ROUTES.administrations}
        eyebrow="Administration CAF"
        title="Mes services"
        description={
          displayName
            ? `Bienvenue ${displayName}, choisissez le service que vous souhaitez utiliser.`
            : 'Choisissez le service que vous souhaitez utiliser.'
        }
      />

      {/* Which administration you are inside. `/portal` is reachable straight
          from a bookmark, where "Mes services" alone says nothing about whose. */}
      {caf && (
        <div className="mb-10 flex items-center gap-4 rounded-sm border border-border/60 bg-card p-5 shadow-soft">
          <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border/60 bg-surface-lowest p-1.5">
            <img src={caf.logoUrl} alt="" aria-hidden="true" className="size-full object-contain" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-lg font-extrabold text-ink">{caf.fullName}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
              {caf.description}
            </p>
          </div>
        </div>
      )}

      {isAuthenticated ? (
        <>
          <h2 className="mb-4 font-display text-lg font-extrabold text-ink">Accès rapide</h2>
          <ul className="mb-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK_ACTIONS.map((action) => (
              <li key={action.to}>
                <Link
                  to={action.to}
                  className="group flex h-full items-center gap-4 rounded-sm border border-border/60 bg-card p-5 shadow-soft transition-all duration-300 hover:border-brand hover:shadow-soft-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-brand-soft text-brand transition-colors duration-300 group-hover:bg-brand group-hover:text-white">
                    <action.icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-label-md text-ink">
                      {action.label}
                    </span>
                    <span className="block text-xs leading-relaxed text-muted-foreground">
                      {action.hint}
                    </span>
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-brand transition-transform duration-300 group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        // Anonymous visitors get the one thing that unlocks the rest, instead of
        // shortcuts to pages that would bounce them straight to the sign-in form.
        <div className="mb-14 flex flex-col gap-4 rounded-sm border border-border/60 bg-brand-soft p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-lg font-extrabold text-ink">
              Connectez-vous pour déposer un dossier
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Vous pouvez parcourir les services librement. La simulation, le dépôt de pièces et le
              suivi demandent un espace personnel.
            </p>
          </div>
          <Link
            to={ROUTES.login}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-sm bg-brand px-6 py-3 text-label-md text-white shadow-soft transition-colors duration-200 hover:bg-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <LogIn className="size-4" aria-hidden="true" />
            Se connecter
          </Link>
        </div>
      )}

      <h2 className="mb-2 font-display text-headline-lg-mobile leading-tight text-ink">
        Les services CAF
      </h2>
      <p className="mb-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Chaque service a ses propres conditions et ses propres pièces justificatives. Ouvrez celui
        qui vous concerne : l’assistant vous guide ensuite pas à pas.
      </p>

      {/* `group/cards` powers the "hovered card steps forward, its siblings
          recede" behaviour shared with `/administrations` — see `ServiceCard`. */}
      <ul className="group/cards grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {CAF_SERVICES.map((service) => (
          <li key={service.id}>
            <ServiceCard
              size="compact"
              name={service.name}
              fullName={service.fullName}
              description={service.description}
              // APL is the one live service; without a session it leads to the
              // public assistant rather than a dossier the visitor cannot open.
              to={service.id === 'apl' && !isAuthenticated ? ROUTES.home : service.basePath}
              available={service.status === 'available'}
              icon={CAF_SERVICE_ICONS[service.id]}
              badgeClassName={CAF_SERVICE_BADGE[service.id]}
              imageUrl={service.photoUrl}
              ctaLabel="Ouvrir le service"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
