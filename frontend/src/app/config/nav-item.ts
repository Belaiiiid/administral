import { type LucideIcon } from 'lucide-react';

/**
 * The navigation vocabulary, extracted from `navigation.ts` so that feature
 * modules can declare their own rail without importing the citizen one.
 *
 * `app/config/navigation.ts` imports AGENT_NAV from `@/features/agent`; if the
 * feature imported `NavItem` back from that same file the graph would cycle.
 * Both sides depend on this leaf instead.
 */
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
  /** When true, only users with the ADMIN role see this item. */
  adminOnly?: boolean;
}

/** A call-to-action button pinned under the primary rail. */
export interface NavCta {
  label: string;
  to: string;
  icon: LucideIcon;
}

/** One rail: what a given audience sees in the sidebar. */
export interface NavSections {
  primary: NavItem[];
  secondary: NavItem[];
  /** `null` when the audience has no primary action. */
  cta: NavCta | null;
}

export const isSelfOrChild = (to: string) => (pathname: string) =>
  pathname === to || pathname.startsWith(`${to}/`);

/** Resolve the active state for a nav item against the current pathname. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return item.match ? item.match(pathname) : isSelfOrChild(item.to)(pathname);
}
