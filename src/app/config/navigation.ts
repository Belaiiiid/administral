import {
  Bot,
  Calculator,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

import { ROUTES } from '@/app/router/paths';

export interface NavItem {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  /**
   * Decides whether this item is the active one.
   *
   * Plain prefix matching is not enough here: `/apl` and `/apl/simulateur` are
   * sibling entries in the same rail, so a prefix rule would light up both.
   * Defaults to "exact, or a child segment of `to`".
   */
  match?: (pathname: string) => boolean;
}

const isSelfOrChild = (to: string) => (pathname: string) =>
  pathname === to || pathname.startsWith(`${to}/`);

/** Primary sidebar navigation — mirrors the mockups' rail. */
export const PRIMARY_NAV: NavItem[] = [
  {
    id: 'portal',
    label: 'Tableau de bord',
    to: ROUTES.portal,
    icon: LayoutDashboard,
    match: (pathname) => pathname === ROUTES.portal,
  },
  {
    id: 'apl',
    label: 'Mes demandes',
    to: ROUTES.apl,
    icon: FileText,
    // Everything under /apl except the simulator, which has its own entry.
    match: (pathname) =>
      isSelfOrChild(ROUTES.apl)(pathname) && !isSelfOrChild(ROUTES.aplSimulator)(pathname),
  },
  { id: 'documents', label: 'Documents', to: ROUTES.documents, icon: FolderOpen },
  { id: 'simulator', label: 'Simulateur APL', to: ROUTES.aplSimulator, icon: Calculator },
  { id: 'chat', label: 'Aide IA', to: ROUTES.chat, icon: Bot },
];

/** Resolve the active state for a nav item against the current pathname. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return item.match ? item.match(pathname) : isSelfOrChild(item.to)(pathname);
}

/** Footer of the sidebar. */
export const SECONDARY_NAV: NavItem[] = [
  { id: 'profile', label: 'Paramètres', to: ROUTES.profile, icon: Settings },
];

/** Agent-facing navigation — separate rail for the back-office module. */
export const AGENT_NAV: NavItem[] = [
  { id: 'agent', label: 'Supervision', to: ROUTES.agent, icon: ShieldCheck },
];

export const SIGN_OUT_ITEM: NavItem = {
  id: 'logout',
  label: 'Déconnexion',
  to: ROUTES.login,
  icon: LogOut,
};
