import { Bell, HelpCircle, Menu, User } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

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
import { Skeleton } from '@/components/ui/skeleton';
import { AGENT_ROUTES } from '@/features/agent';
import { useChatbotUiStore } from '@/features/chatbot/store/chatbotUiStore';
import { getInitials } from '@/lib/utils';
import { useNotificationStore } from '@/store/notificationStore';
import { useSessionStore } from '@/store/sessionStore';
import { useUiStore } from '@/store/uiStore';

/** Sticky 64px application header. */
export function Header() {
  const openSidebar = useUiStore((state) => state.openSidebar);
  const displayName = useSessionStore((state) => state.displayName);
  const role = useSessionStore((state) => state.role);
  const logout = useSessionStore((state) => state.logout);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const refreshCount = useNotificationStore((state) => state.refreshCount);
  const openAssistant = useChatbotUiStore((state) => state.open);
  const navigate = useNavigate();

  // Keep the badge honest across a reload: fetch the count once the shell mounts.
  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  const handleLogout = () => {
    logout();
    // Not `ROUTES.login`: a citizen who signs out lands back among the public,
    // exactly like anyone else who has not signed in — the assistant first,
    // "Se connecter" second (see `HomeRoute`), never dropped straight on a form.
    navigate(ROUTES.home, { replace: true });
  };

  // Role-aware: an agent has no citizen profiling profile, so "Mon profil" must
  // land them on the back-office account page, never on the profiling form.
  // Accessibility preferences are a citizen-profile concern — not shown here for
  // agents, keeping their account view minimal (name / e-mail / role).
  const isAgent = role === 'agent';
  const profileTo = isAgent ? AGENT_ROUTES.profile : ROUTES.profile;
  const notificationsTo = isAgent ? AGENT_ROUTES.notifications : ROUTES.portalNotifications;
  const settingsTo = isAgent ? AGENT_ROUTES.settings : ROUTES.settings;

  // Help opens the assistant: the citizen's floating panel, or the agent's own
  // Assistant IA page. Never a dead button.
  const handleHelp = () => {
    if (isAgent) {
      navigate(AGENT_ROUTES.assistant);
    } else {
      openAssistant();
    }
  };

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

      {/* Real logos, not decoration: Mistral (mistral.ai) and Talan
          (talan.com), matching the marks used on the France Travail page. */}
      <div className="hidden items-center gap-4 sm:flex">
        <span className="flex items-center gap-1.5 text-label-sm text-on-surface-variant">
          <img src="/mistral-logo.svg" alt="" aria-hidden="true" className="h-3.5 w-auto" />
          Powered by Mistral
        </span>
        <span aria-hidden="true" className="h-4 w-px bg-border" />
        <span className="flex items-center gap-1.5 text-label-sm text-on-surface-variant">
          Partenaire
          <img src="/talan-logo.svg" alt="Talan" className="h-3.5 w-auto" />
        </span>
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
          <Link to={notificationsTo}>
            <Bell aria-hidden="true" />
            {unreadCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute right-2.5 top-2.5 size-2 rounded-full border-2 border-surface bg-destructive"
              />
            )}
          </Link>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Aide"
          onClick={handleHelp}
        >
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
              <Link to={profileTo}>Mon profil</Link>
            </DropdownMenuItem>
            {!isAgent && (
              <DropdownMenuItem asChild>
                <Link to={ROUTES.profileAccessibility}>Accessibilité</Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link to={settingsTo}>Paramètres</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={handleLogout}>
              Déconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
