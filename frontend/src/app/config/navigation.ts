import { Bot, LayoutGrid, LogOut, Plus, Route, Send, UserRound } from 'lucide-react';

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
 * "Mes services" is the hub (all CAF services — only APL is wired). Once a
 * citizen is on an APL surface, the rail always offers both directions: send
 * a dossier and check one already sent — each renders its own empty state
 * when there is nothing yet to show, rather than being hidden conditionally,
 * so the rail's shape never shifts under the citizen's feet.
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

  return { primary: PRIMARY_NAV, secondary: SECONDARY_NAV, cta: CITIZEN_CTA };
}
