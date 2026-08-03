import { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { CitizenFooter } from '@/components/layout/CitizenFooter';
import { CitizenHeader } from '@/components/layout/CitizenHeader';
import { CitizenSidebar } from '@/components/layout/CitizenSidebar';
import { SkipLink } from '@/components/layout/SkipLink';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FloatingChatbot } from '@/features/chatbot/components/FloatingChatbot';
import { VoiceAssistantProvider } from '@/features/voice/components/VoiceAssistantProvider';
import { VoicePageProvider } from '@/features/voice/context/VoicePageContext';
import { useVoiceStore } from '@/features/voice/store/voiceStore';
import { cn } from '@/lib/utils';

/**
 * Administral-styled application shell — the citizen area only.
 *
 * Structural twin of `components/layout/AppShell`, restyled with the
 * Administral design tokens (see `.citizen-scope`, src/index.css). Kept as a
 * separate component — rather than a variant of `AppShell` — so the agent
 * back-office shell, which still uses `AppShell` for its own routes, is
 * never affected by this redesign.
 *
 * `variant="minimal"` drops the header and sidebar, for the administrations
 * list and the CAF services hub, reached before any account is required —
 * mirrors `AppShell`'s `hideSidebar`/`hideHeader` props.
 */
export function CitizenAppShell({ variant = 'full' }: { variant?: 'full' | 'minimal' }) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const hasSeenVoiceOnboarding = useVoiceStore((state) => state.hasSeenVoiceOnboarding);
  const location = useLocation();

  if (!hasSeenVoiceOnboarding && location.pathname !== ROUTES.voiceOnboarding) {
    return <Navigate to={ROUTES.voiceOnboarding} replace />;
  }

  const hideChrome = variant === 'minimal';

  return (
    <VoicePageProvider>
      <VoiceAssistantProvider>
        <div className="citizen-scope min-h-screen bg-background font-sans text-foreground">
          <SkipLink />

          {!hideChrome && (
            <>
              <aside className="fixed inset-y-0 left-0 z-40 hidden w-sidebar lg:block">
                <CitizenSidebar />
              </aside>

              <Dialog open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
                <DialogContent
                  className="left-0 top-0 h-full w-[280px] max-w-[85vw] translate-x-0 translate-y-0 rounded-none border-0 p-0 lg:hidden"
                  aria-label="Menu de navigation"
                >
                  <CitizenSidebar onNavigate={() => setIsDrawerOpen(false)} />
                </DialogContent>
              </Dialog>
            </>
          )}

          <div className={cn('flex min-h-screen flex-col', !hideChrome && 'lg:pl-sidebar')}>
            <CitizenHeader
              variant={hideChrome ? 'minimal' : 'full'}
              onOpenMenu={() => setIsDrawerOpen(true)}
            />
            <main
              id="main-content"
              tabIndex={-1}
              className="flex-1 px-4 py-8 focus:outline-none md:px-8"
            >
              <Outlet />
            </main>
            <CitizenFooter />
          </div>

          <FloatingChatbot />
        </div>
      </VoiceAssistantProvider>
    </VoicePageProvider>
  );
}
