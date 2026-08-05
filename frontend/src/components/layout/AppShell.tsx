import { Outlet } from 'react-router-dom';

import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { SkipLink } from '@/components/layout/SkipLink';
import { Sidebar } from '@/components/layout/Sidebar';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { isAgentPath } from '@/features/agent/paths';
import { FloatingActionBubbles } from '@/features/chatbot/components/FloatingActionBubbles';
import { FloatingChatbot } from '@/features/chatbot/components/FloatingChatbot';
import { VoicePageProvider } from '@/features/voice/context/VoicePageContext';
import { VoiceAssistantProvider } from '@/features/voice/components/VoiceAssistantProvider';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/store/sessionStore';
import { useUiStore } from '@/store/uiStore';

/**
 * The authenticated application shell.
 *
 * Desktop  (≥1024px): fixed 256px rail + offset content column.
 * Tablet / mobile:    rail becomes a focus-trapped drawer (Radix Dialog).
 *
 * `hideSidebar` drops the desktop rail — for the services hub, reached before
 * a citizen has picked a service, where a sidebar would have nothing of its
 * own to navigate (it would just show whichever service's rail happened to be
 * last). The mobile drawer stays available either way: on a small screen the
 * rail is never persistent regardless, so there is nothing to hide there.
 *
 * `hideHeader` drops the top bar (notifications, account menu) — for the
 * administrations list and the CAF services hub, reached before any account
 * is required: there is no session-specific state to show there yet, and the
 * page is reachable by a visitor with no account at all.
 */
export function AppShell({
  hideSidebar = false,
  hideHeader = false,
}: { hideSidebar?: boolean; hideHeader?: boolean } = {}) {
  const isSidebarOpen = useUiStore((state) => state.isSidebarOpen);
  const closeSidebar = useUiStore((state) => state.closeSidebar);
  // The assistant is a citizen feature only — the agent portal shares this shell
  // but has its own Assistant IA page, so the launcher is never mounted there.
  const role = useSessionStore((state) => state.role);

  return (
    <VoicePageProvider>
      <VoiceAssistantProvider>
        {/*
          No scope class: the agent back-office and France Travail both wear
          the institutional theme — navy, Inter / Manrope, the standard radius
          scale. See docs/design-system.md §1, which names this shell as the
          institutional side of the platform.
        */}
        {/* Squared corners for the back-office only; France Travail shares
            this shell and keeps the charter's rounded scale. */}
        <div
          className={cn('min-h-screen bg-background', isAgentPath(location.pathname) && 'agent-scope')}
        >
          <SkipLink />

      {/* Desktop rail */}
      {!hideSidebar && (
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-sidebar lg:block">
          <Sidebar />
        </aside>
      )}

      {/* Mobile drawer */}
      <Dialog open={isSidebarOpen} onOpenChange={(open) => !open && closeSidebar()}>
        <DialogContent
          className="left-0 top-0 h-full w-[280px] max-w-[85vw] translate-x-0 translate-y-0 rounded-none border-0 p-0 lg:hidden"
          aria-label="Menu de navigation"
        >
          <Sidebar inDrawer />
        </DialogContent>
      </Dialog>

      <div className={cn('flex min-h-screen flex-col', !hideSidebar && 'lg:pl-sidebar')}>
        {!hideHeader && <Header />}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-margin-mobile py-8 focus:outline-none md:px-gutter"
        >
          <Outlet />
        </main>
        {/* The institutional footer. `CitizenFooter` is drawn against the
            Administral tokens and would need `.citizen-scope` to render here —
            which docs/design-system.md §9 confines to the citizen area. */}
        <Footer />
      </div>

      {role === 'citizen' && (
        <>
          <FloatingChatbot />
          <FloatingActionBubbles />
        </>
      )}
    </div>
      </VoiceAssistantProvider>
    </VoicePageProvider>
  );
}
