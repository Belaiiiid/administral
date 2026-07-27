import { Outlet } from 'react-router-dom';

import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { SkipLink } from '@/components/layout/SkipLink';
import { Sidebar } from '@/components/layout/Sidebar';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FloatingChatbot } from '@/features/chatbot/components/FloatingChatbot';
import { useSessionStore } from '@/store/sessionStore';
import { useUiStore } from '@/store/uiStore';

/**
 * The authenticated application shell.
 *
 * Desktop  (≥1024px): fixed 256px rail + offset content column.
 * Tablet / mobile:    rail becomes a focus-trapped drawer (Radix Dialog).
 */
export function AppShell() {
  const isSidebarOpen = useUiStore((state) => state.isSidebarOpen);
  const closeSidebar = useUiStore((state) => state.closeSidebar);
  // The assistant is a citizen feature only — the agent portal shares this shell
  // but has its own Assistant IA page, so the launcher is never mounted there.
  const isCitizen = useSessionStore((state) => state.role === 'citizen');

  return (
    <div className="min-h-screen bg-background">
      <SkipLink />

      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-sidebar lg:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      <Dialog open={isSidebarOpen} onOpenChange={(open) => !open && closeSidebar()}>
        <DialogContent
          className="left-0 top-0 h-full w-[280px] max-w-[85vw] translate-x-0 translate-y-0 rounded-none border-0 p-0 lg:hidden"
          aria-label="Menu de navigation"
        >
          <Sidebar inDrawer />
        </DialogContent>
      </Dialog>

      <div className="flex min-h-screen flex-col lg:pl-sidebar">
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

      {isCitizen && <FloatingChatbot />}
    </div>
  );
}
