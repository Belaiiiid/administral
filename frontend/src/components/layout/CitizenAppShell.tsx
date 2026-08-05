import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { CitizenFooter } from '@/components/layout/CitizenFooter';
import { CitizenHeader } from '@/components/layout/CitizenHeader';
import { CitizenSidebar } from '@/components/layout/CitizenSidebar';
import { SkipLink } from '@/components/layout/SkipLink';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FloatingActionBubbles } from '@/features/chatbot/components/FloatingActionBubbles';
import { FloatingChatbot } from '@/features/chatbot/components/FloatingChatbot';
import { VoiceAssistantProvider } from '@/features/voice/components/VoiceAssistantProvider';
import { VoicePageProvider } from '@/features/voice/context/VoicePageContext';
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
  const location = useLocation();

  const hideChrome = variant === 'minimal';
  /*
   * L'assistant est une surface de conversation, pas un document : la page y
   * tient exactement dans l'écran, et le seul ascenseur est celui du fil de
   * messages. La coque doit donc cesser de faire défiler le document — sinon
   * deux barres de défilement se superposent et le composeur se promène.
   *
   * Le pied de page disparaît avec le défilement : il n'a plus de place où
   * s'afficher, et le retenir rognerait la conversation sur chaque écran.
   */
  const isConversationRoute = location.pathname === ROUTES.chat;

  return (
    <VoicePageProvider>
      <VoiceAssistantProvider>
        <div
          className={cn(
            'citizen-scope bg-background font-sans text-foreground',
            isConversationRoute ? 'h-[100dvh] overflow-hidden' : 'min-h-screen',
          )}
        >
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

          <div
            className={cn(
              'flex flex-col',
              isConversationRoute ? 'h-full min-h-0' : 'min-h-screen',
              !hideChrome && 'lg:pl-sidebar',
            )}
          >
            <CitizenHeader
              variant={hideChrome ? 'minimal' : 'full'}
              onOpenMenu={() => setIsDrawerOpen(true)}
            />
            <main
              id="main-content"
              tabIndex={-1}
              className={cn(
                'flex-1 px-4 focus:outline-none md:px-8',
                isConversationRoute ? 'min-h-0 overflow-hidden py-4' : 'py-8',
              )}
            >
              <Outlet />
            </main>
            {!isConversationRoute && <CitizenFooter />}
          </div>

          <FloatingChatbot />
          <FloatingActionBubbles />
        </div>
      </VoiceAssistantProvider>
    </VoicePageProvider>
  );
}
