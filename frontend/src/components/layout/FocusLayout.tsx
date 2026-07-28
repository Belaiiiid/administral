import { Outlet } from 'react-router-dom';

import { Footer } from '@/components/layout/Footer';
import { Logo } from '@/components/layout/Logo';
import { SkipLink } from '@/components/layout/SkipLink';

/**
 * Distraction-free layout for step-by-step onboarding flows (service selection,
 * accessibility preferences): slim header, centred 800px column, no sidebar.
 */
export function FocusLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SkipLink />

      <header className="sticky top-0 z-30 flex h-header items-center border-b border-border bg-surface-lowest px-margin-mobile md:px-gutter">
        <Logo />
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 flex-col items-center px-margin-mobile py-12 focus:outline-none md:px-gutter"
      >
        <div className="w-full max-w-form">
          <Outlet />
        </div>
      </main>

      <Footer />
    </div>
  );
}
