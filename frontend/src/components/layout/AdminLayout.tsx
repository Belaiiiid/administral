import { LogOut, Users } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/layout/Logo';
import { PartnerLogos } from '@/components/layout/PartnerLogos';
import { SkipLink } from '@/components/layout/SkipLink';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/store/sessionStore';

const ADMIN_NAV = [
  { id: 'admin-dashboard', label: 'Utilisateurs', to: ROUTES.admin, icon: Users },
];

export function AdminLayout() {
  const logout = useSessionStore((state) => state.logout);
  const { pathname } = useLocation();

  const isActive = (to: string) =>
    to === ROUTES.admin ? pathname === to : pathname.startsWith(to);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SkipLink />

      <header className="sticky top-0 z-40 flex h-16 items-center border-b border-border bg-surface-low px-margin-mobile lg:px-margin-desktop">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="rounded bg-primary px-2 py-0.5 text-label-sm text-on-primary">
            Administration
          </span>
        </div>

        <nav aria-label="Navigation administration" className="ml-10 flex items-center gap-1">
          {ADMIN_NAV.map((item) => (
            <NavLink
              key={item.id}
              to={item.to}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2 text-label-md transition-colors',
                isActive(item.to)
                  ? 'bg-primary-fixed font-bold text-primary'
                  : 'text-on-surface-variant hover:bg-surface-high',
              )}
            >
              <item.icon className="size-5" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <PartnerLogos className="hidden sm:flex" />
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="mr-2 size-4" aria-hidden="true" />
            Déconnexion
          </Button>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-margin-mobile py-8 lg:px-margin-desktop focus:outline-none">
        <Outlet />
      </main>
    </div>
  );
}
