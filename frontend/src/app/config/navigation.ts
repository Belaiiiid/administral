import {
  Bot,
  LayoutGrid,
  LogOut,
  MessageSquareText,
  Plus,
  Route,
  Search,
  Send,
  Sparkles,
  UserRound,
} from 'lucide-react';

import {
  isNavItemActive,
  isSelfOrChild,
  type NavCta,
  type NavItem,
  type NavSections,
} from '@/app/config/nav-item';
import { ROUTES } from '@/app/router/paths';
import { AGENT_NAV, AGENT_SECONDARY_NAV } from '@/features/agent/config/navigation';
import { isAgentPath } from '@/features/agent/paths';

// Re-exported so existing importers (Sidebar) keep their import path.
export { isNavItemActive };
export type { NavCta, NavItem, NavSections };

/**
 * Primary sidebar navigation.
 *
 * "Mes services" is the hub. Once a citizen is on an APL surface, the rail
 * always offers both directions: send a dossier and check one already sent —
 * each renders its own empty state when there is nothing yet to show, rather
 * than being hidden conditionally, so the rail's shape never shifts under the
 * citizen's feet.
 *
 * France Travail is not dossier-shaped (see `features/france-travail`: a
 * stateless job-offer analysis, not a submission tracked over time), so it
 * gets its own single item rather than the "dossier + suivi" pair — an
 * explicit branch on location, not a config table, since there are exactly
 * two concrete shapes today. Add a table if a third, differently-shaped
 * service arrives.
 */
export const PRIMARY_NAV: NavItem[] = [
  {
    id: 'portal',
    label: 'Mes services',
    to: ROUTES.portal,
    icon: LayoutGrid,
    match: (pathname) => pathname === ROUTES.portal,
  },
  {
    id: 'dossier',
    label: 'Envoyer un dossier',
    to: ROUTES.dossier,
    icon: Send,
    match: (pathname) => isSelfOrChild(ROUTES.dossier)(pathname) && pathname !== ROUTES.suivi,
  },
  {
    id: 'suivi',
    label: 'Suivre un dossier déposé',
    to: ROUTES.suivi,
    icon: Route,
    match: (pathname) => pathname === ROUTES.suivi,
  },
  { id: 'chat', label: 'Aide IA', to: ROUTES.chat, icon: Bot },
];

/** Sidebar shown while browsing France Travail — see the note on `PRIMARY_NAV`. */
const FRANCE_TRAVAIL_NAV: NavItem[] = [
  {
    // `administrations`, pas `portal` : depuis France Travail, « Mes services »
    // menait au hub CAF, qui n'a rien à voir avec l'administration en cours.
    // La liste des administrations est le seul endroit d'où l'on peut
    // réellement passer de France Travail à autre chose.
    id: 'administrations',
    label: 'Les administrations',
    to: ROUTES.administrations,
    icon: LayoutGrid,
    match: (pathname) => pathname === ROUTES.administrations,
  },
  {
    id: 'job-match',
    label: 'Analyser une offre',
    to: ROUTES.franceTravail,
    icon: Sparkles,
    // Every other France Travail sub-route lives under this same basePath
    // (`isSelfOrChild` would otherwise match them too) — each addition here
    // needs excluding explicitly, same fix as when Coach CV was added.
    match: (pathname) =>
      isSelfOrChild(ROUTES.franceTravail)(pathname) &&
      pathname !== ROUTES.franceTravailCvCoach &&
      pathname !== ROUTES.franceTravailJobSearch,
  },
  {
    id: 'cv-coach',
    label: 'Coach CV',
    to: ROUTES.franceTravailCvCoach,
    icon: MessageSquareText,
    match: (pathname) => pathname === ROUTES.franceTravailCvCoach,
  },
  {
    id: 'job-search',
    label: 'Rechercher un emploi',
    to: ROUTES.franceTravailJobSearch,
    icon: Search,
    match: (pathname) => pathname === ROUTES.franceTravailJobSearch,
  },
  // Pas d'entrée « Aide IA » ici : elle pointait vers `ROUTES.chat`, l'assistant
  // du dossier CAF (statut de dossier, documentation APL), qui ne sait rien
  // répondre sur l'emploi. L'assistant de cette zone, c'est Coach CV
  // ci-dessus — la même fenêtre de chat, branchée sur le bon backend.
];

/** Footer of the sidebar. */
export const SECONDARY_NAV: NavItem[] = [
  { id: 'profile', label: 'Mon profil', to: ROUTES.profile, icon: UserRound },
];

/** The citizen rail's primary action — opens the unified personalised dossier. */
const CITIZEN_CTA: NavCta = {
  label: 'Envoyer un dossier',
  to: ROUTES.dossier,
  icon: Plus,
};

const FRANCE_TRAVAIL_CTA: NavCta = {
  label: 'Analyser une offre',
  to: ROUTES.franceTravail,
  icon: Sparkles,
};

export const SIGN_OUT_ITEM: NavItem = {
  id: 'logout',
  label: 'Déconnexion',
  to: ROUTES.login,
  icon: LogOut,
};

/**
 * Pick the rail for the current location.
 *
 * Resolving from the pathname — rather than threading nav config through
 * <AppShell /> and <Sidebar /> as props — keeps both components' signatures
 * untouched, so no existing call site had to change when the back-office
 * gained its own rail.
 *
 * The agent branch is keyed on the route, not on `sessionStore.role`: an agent
 * browsing their own citizen space must still see the citizen rail.
 */
export function resolveNavSections(pathname: string): NavSections {
  if (isAgentPath(pathname)) {
    // No CTA: the back-office has no "create" action — agents process work
    // that citizens submit.
    return { primary: AGENT_NAV, secondary: AGENT_SECONDARY_NAV, cta: null };
  }

  if (isSelfOrChild(ROUTES.franceTravail)(pathname)) {
    return { primary: FRANCE_TRAVAIL_NAV, secondary: SECONDARY_NAV, cta: FRANCE_TRAVAIL_CTA };
  }

  return { primary: PRIMARY_NAV, secondary: SECONDARY_NAV, cta: CITIZEN_CTA };
}
