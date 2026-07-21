import { Plus, X } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

import {
  isNavItemActive,
  PRIMARY_NAV,
  SECONDARY_NAV,
  SIGN_OUT_ITEM,
  type NavItem,
} from '@/app/config/navigation';
import { ROUTES } from '@/app/router/paths';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';

function SidebarLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  // NavLink's own isActive is prefix-based; our rail needs the custom rules
  // declared alongside each item (see app/config/navigation.ts).
  const isActive = isNavItemActive(item, pathname);

  return (
    <li>
      <NavLink
        to={item.to}
        onClick={onNavigate}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex min-h-11 items-center gap-3 rounded-lg px-4 py-3 text-label-md transition-colors',
          isActive
            ? 'bg-primary-fixed font-bold text-primary'
            : 'text-on-surface-variant hover:bg-surface-high',
        )}
      >
        <item.icon className="size-5 shrink-0" aria-hidden="true" />
        <span>{item.label}</span>
      </NavLink>
    </li>
  );
}

/**
 * Fixed 256px rail on desktop; slide-over drawer below `lg`.
 * The drawer variant is rendered by <AppShell /> inside a focus-trapping overlay.
 */
export function Sidebar({ inDrawer = false }: { inDrawer?: boolean }) {
  const closeSidebar = useUiStore((state) => state.closeSidebar);
  const onNavigate = inDrawer ? closeSidebar : undefined;

  return (
    <div className="flex h-full flex-col border-r border-border bg-surface-low px-4 py-6">
      <div className="mb-8 flex items-center justify-between gap-2 px-2">
        <Logo />
        {inDrawer && (
          <Button variant="ghost" size="icon" onClick={closeSidebar} aria-label="Fermer le menu">
            <X aria-hidden="true" />
          </Button>
        )}
      </div>

      <nav aria-label="Navigation principale" className="flex-1">
        <ul className="flex flex-col gap-1">
          {PRIMARY_NAV.map((item) => (
            <SidebarLink key={item.id} item={item} onNavigate={onNavigate} />
          ))}
        </ul>
      </nav>

      <Button asChild block className="mt-6">
        <NavLink to={ROUTES.aplApplication} onClick={onNavigate}>
          <Plus aria-hidden="true" />
          Nouvelle demande
        </NavLink>
      </Button>

      <div className="mt-6 border-t border-border pt-6">
        <ul className="flex flex-col gap-1">
          {SECONDARY_NAV.map((item) => (
            <SidebarLink key={item.id} item={item} onNavigate={onNavigate} />
          ))}
          <li>
            <NavLink
              to={SIGN_OUT_ITEM.to}
              onClick={onNavigate}
              className="flex min-h-11 items-center gap-3 rounded-lg px-4 py-3 text-label-md text-destructive transition-colors hover:bg-destructive-surface"
            >
              <SIGN_OUT_ITEM.icon className="size-5 shrink-0" aria-hidden="true" />
              {SIGN_OUT_ITEM.label}
            </NavLink>
          </li>
        </ul>
      </div>
    </div>
  );
}
