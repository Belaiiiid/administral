import { Bot, ClipboardList, FolderOpen, LayoutDashboard, LogOut, Plus, UserRound } from 'lucide-react';

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
 * Demo-readiness: the APL entries (Mes demandes, Simulateur APL) and the old
 * "Nouvelle demande" target were unbuilt front-end skeletons (no backend), so
 * they are removed from the rail — the dossier is built and tracked under
 * Documents, which is fully wired end to end. The `/apl/*` routes still exist
 * (reachable by URL) but are no longer surfaced.
 */
export const PRIMARY_NAV: NavItem[] = [
  {
    id: 'portal',
    label: 'Tableau de bord',
    to: ROUTES.portal,
    icon: LayoutDashboard,
    match: (pathname) => pathname === ROUTES.portal,
  },
  {
    id: 'dossier',
    label: 'Mon dossier personnalisé',
    to: ROUTES.dossier,
    icon: ClipboardList,
    match: isSelfOrChild(ROUTES.dossier),
  },
  {
    id: 'documents',
    label: 'Mes documents',
    to: ROUTES.documents,
    icon: FolderOpen,
    match: (pathname) =>
      isSelfOrChild(ROUTES.documents)(pathname) || isSelfOrChild(ROUTES.documentsUpload)(pathname),
  },
  { id: 'chat', label: 'Aide IA', to: ROUTES.chat, icon: Bot },
];

/** Footer of the sidebar. */
export const SECONDARY_NAV: NavItem[] = [
  { id: 'profile', label: 'Mon profil', to: ROUTES.profile, icon: UserRound },
];

/** The citizen rail's primary action — opens the unified personalised dossier. */
const CITIZEN_CTA: NavCta = {
  label: 'Déposer un dossier',
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
