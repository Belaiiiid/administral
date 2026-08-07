import { Bell, HelpCircle, Menu, User, UserRound } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import logo from '@/assets/administral-logo.png';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useChatbotUiStore } from '@/features/chatbot/store/chatbotUiStore';
import { cn, getInitials } from '@/lib/utils';
import { useNotificationStore } from '@/store/notificationStore';
import { useSessionStore } from '@/store/sessionStore';

export interface CitizenHeaderProps {
  /**
   * `full` — inside the citizen area, alongside `CitizenSidebar` (which
   * already carries the logo on desktop): notifications, help, account menu.
   * `minimal` — administrations list and CAF services hub, reachable before
   * any account is required: just the Administral mark and a "Se connecter"
   * call to action for a visitor with no session yet.
   */
  variant?: 'full' | 'minimal';
  onOpenMenu?: () => void;
}

/**
 * Administral-styled application header — citizen area only.
 *
 * Structural twin of `components/layout/Header`, restyled with the
 * Administral tokens. Kept separate (rather than a variant of `Header`) so
 * the agent back-office header, which reuses `Header`, is never affected by
 * this redesign.
 */
export function CitizenHeader({ variant = 'full', onOpenMenu }: CitizenHeaderProps) {
  const displayName = useSessionStore((state) => state.displayName);
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated);
  const logout = useSessionStore((state) => state.logout);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const refreshCount = useNotificationStore((state) => state.refreshCount);
  const openAssistant = useChatbotUiStore((state) => state.open);
  const navigate = useNavigate();

  // Keep the badge honest across a reload: fetch the count once the shell mounts.
  useEffect(() => {
    if (isAuthenticated) void refreshCount();
  }, [isAuthenticated, refreshCount]);

  const handleLogout = () => {
    logout();
    navigate(ROUTES.home, { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/90 px-4 backdrop-blur md:px-8">
      {variant === 'full' && onOpenMenu && (
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Ouvrir le menu de navigation"
          className="flex size-10 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-brand-soft hover:text-brand lg:hidden"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
      )}

      {/* On `full`, the sidebar already carries the mark on desktop (lg+) —
          shown here too so it's not missing on mobile, where the sidebar is a
          drawer. On `minimal` there is no sidebar at all, so it always shows. */}
      {/* Toujours vers `home`, jamais vers `portal` : `portal` est le hub CAF,
          et cliquer le logo depuis France Travail y atterrissait sans raison.
          `HomeRoute` renvoie de lui-même un visiteur identifié vers la liste
          des administrations, qui est bien son accueil. */}
      <Link
        to={ROUTES.home}
        // `ml-2` : la marque respire un peu plus loin du bord que les 16px de
        // rembourrage de l'en-tête, comme sur les autres barres.
        className={cn('ml-2 flex items-center gap-2.5', variant === 'full' && 'lg:hidden')}
      >
        <img src={logo} alt="Administral" className="size-9 shrink-0 object-contain" />
        {/* Mot-symbole sur deux lignes, comme l'en-tête public : la signature
            qualifie la marque, elle ne doit pas se lire comme un lien de plus. */}
        <span className="hidden leading-tight sm:block">
          <span className="block font-display text-base font-extrabold tracking-tight text-ink">
            ADMINISTRAL
          </span>
          <span className="mt-0.5 block text-label-sm text-muted-foreground">République 5.0</span>
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-1.5">
        {isAuthenticated ? (
          <>
            <Link
              to={ROUTES.portalNotifications}
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} non lues` : 'Notifications'}
              className="relative flex size-10 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-brand-soft hover:text-brand"
            >
              <Bell className="size-5" aria-hidden="true" />
              {unreadCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute right-2 top-2 size-2 rounded-full border-2 border-background bg-destructive"
                />
              )}
            </Link>

            <button
              type="button"
              onClick={() => openAssistant()}
              aria-label="Aide"
              className="flex size-10 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-brand-soft hover:text-brand"
            >
              <HelpCircle className="size-5" aria-hidden="true" />
            </button>

            <span aria-hidden="true" className="mx-2 hidden h-8 w-px bg-border/60 sm:block" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-3 rounded-full p-1 transition-colors hover:bg-brand-soft"
                  aria-label={displayName ? `Mon espace — ${displayName}` : 'Mon espace'}
                >
                  <span className="hidden text-right sm:block">
                    {displayName ? (
                      <span className="block text-label-md leading-none text-ink">
                        {displayName}
                      </span>
                    ) : (
                      <Skeleton className="mb-1 h-3 w-24" />
                    )}
                  </span>
                  <Avatar className="border-brand/20">
                    <AvatarFallback className="bg-brand-soft text-brand">
                      {displayName ? (
                        getInitials(displayName)
                      ) : (
                        <User className="size-4" aria-hidden="true" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-2xl border-border/60 bg-card p-1.5 shadow-soft">
                <DropdownMenuLabel className="text-muted-foreground">Mon espace</DropdownMenuLabel>
                <DropdownMenuItem asChild className="rounded-xl focus:bg-brand-soft focus:text-brand">
                  <Link to={ROUTES.profile}>Mon profil</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="rounded-xl focus:bg-brand-soft focus:text-brand">
                  <Link to={ROUTES.profileAccessibility}>Accessibilité</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="rounded-xl focus:bg-brand-soft focus:text-brand">
                  <Link to={ROUTES.settings}>Paramètres</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border/60" />
                <DropdownMenuItem destructive onSelect={handleLogout} className="rounded-xl">
                  Déconnexion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <Link
            to={ROUTES.login}
            className="inline-flex items-center gap-2 rounded-md bg-marianne px-5 py-2.5 text-label-md text-marianne-foreground transition-opacity hover:opacity-90"
          >
            <UserRound className="size-4" aria-hidden="true" />
            Se connecter
          </Link>
        )}
      </div>
    </header>
  );
}
