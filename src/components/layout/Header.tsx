import { Bell, HelpCircle, Menu, Search, User } from 'lucide-react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { getInitials } from '@/lib/utils';
import { useSessionStore } from '@/store/sessionStore';
import { useUiStore } from '@/store/uiStore';

export interface HeaderProps {
  /** Placeholder for the search field. */
  searchPlaceholder?: string;
  /** Unread notification count — drives the indicator dot. */
  unreadCount?: number;
}

/** Sticky 64px application header. */
export function Header({
  searchPlaceholder = 'Rechercher une demande, un document…',
  unreadCount = 0,
}: HeaderProps) {
  const openSidebar = useUiStore((state) => state.openSidebar);
  const displayName = useSessionStore((state) => state.displayName);

  return (
    <header className="sticky top-0 z-30 flex h-header items-center gap-4 border-b border-border bg-surface px-margin-mobile md:px-gutter">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={openSidebar}
        aria-label="Ouvrir le menu de navigation"
      >
        <Menu aria-hidden="true" />
      </Button>

      <div className="hidden w-full max-w-md sm:block">
        <label htmlFor="global-search" className="sr-only">
          Rechercher
        </label>
        <Input
          id="global-search"
          type="search"
          placeholder={searchPlaceholder}
          startIcon={<Search />}
          className="border-transparent bg-surface-low"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} non lues`
              : 'Notifications'
          }
        >
          <Link to={ROUTES.portalNotifications}>
            <Bell aria-hidden="true" />
            {unreadCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute right-2.5 top-2.5 size-2 rounded-full border-2 border-surface bg-destructive"
              />
            )}
          </Link>
        </Button>

        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Aide">
          <HelpCircle aria-hidden="true" />
        </Button>

        <span aria-hidden="true" className="mx-2 hidden h-8 w-px bg-border sm:block" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-3 rounded-lg p-1 transition-colors hover:bg-surface-container"
              aria-label={displayName ? `Mon espace — ${displayName}` : 'Mon espace'}
            >
              <span className="hidden text-right sm:block">
                {displayName ? (
                  <span className="block text-label-md leading-none text-on-surface">
                    {displayName}
                  </span>
                ) : (
                  <Skeleton className="mb-1 h-3 w-24" />
                )}
                <span className="block text-label-sm text-on-surface-variant">Mon compte</span>
              </span>
              <Avatar>
                <AvatarFallback>
                  {displayName ? (
                    getInitials(displayName)
                  ) : (
                    <User className="size-4" aria-hidden="true" />
                  )}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Mon espace</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link to={ROUTES.profile}>Mon profil</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={ROUTES.profileAccessibility}>Accessibilité</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive asChild>
              <Link to={ROUTES.login}>Déconnexion</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
