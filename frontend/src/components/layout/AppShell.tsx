import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { Footer } from '@/components/layout/Footer';
import { ROUTES } from '@/app/router/paths';
import { useVoiceStore } from '@/features/voice/store/voiceStore';
import { Header } from '@/components/layout/Header';
import { SkipLink } from '@/components/layout/SkipLink';
import { Sidebar } from '@/components/layout/Sidebar';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FloatingChatbot } from '@/features/chatbot/components/FloatingChatbot';
import { VoicePageProvider } from '@/features/voice/context/VoicePageContext';
import { VoiceAssistantProvider } from '@/features/voice/components/VoiceAssistantProvider';
import { VoiceAssistantPanel } from '@/features/voice/components/VoiceAssistantPanel';
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
 */
export function AppShell({ hideSidebar = false }: { hideSidebar?: boolean } = {}) {
  const isSidebarOpen = useUiStore((state) => state.isSidebarOpen);
  const closeSidebar = useUiStore((state) => state.closeSidebar);
  // The assistant is a citizen feature only — the agent portal shares this shell
  // but has its own Assistant IA page, so the launcher is never mounted there.
  const role = useSessionStore((state) => state.role);
  const hasSeenVoiceOnboarding = useVoiceStore((state) => state.hasSeenVoiceOnboarding);
  const location = useLocation();

  // Voice onboarding guard: redirect if citizen hasn't seen the voice onboarding
  if (role === 'citizen' && !hasSeenVoiceOnboarding && location.pathname !== ROUTES.voiceOnboarding) {
    return <Navigate to={ROUTES.voiceOnboarding} replace />;
  }

  return (
    <VoicePageProvider>
      <VoiceAssistantProvider>
        <div className="min-h-screen bg-background">
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
        <Header />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-margin-mobile py-8 focus:outline-none md:px-gutter"
        >
          <Outlet />
        </main>
        <Footer />
      </div>

      {role === 'citizen' && <FloatingChatbot />}
      <VoiceAssistantPanel />
    </div>
      </VoiceAssistantProvider>
    </VoicePageProvider>
  );
}
