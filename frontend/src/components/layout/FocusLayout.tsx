import { Link, Outlet } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import administralLogo from '@/assets/administral-logo.png';
import { Footer } from '@/components/layout/Footer';
import { SkipLink } from '@/components/layout/SkipLink';

/**
 * Distraction-free layout for step-by-step onboarding flows (service selection,
 * accessibility preferences): slim header, centred 800px column, no sidebar.
 *
 * Citizen-only (see `app/router/index.tsx`) — the Administral mark is shown
 * unconditionally, unlike `Sidebar`'s `Logo`, which the agent back-office
 * still renders too.
 */
export function FocusLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SkipLink />

      <header className="sticky top-0 z-30 flex h-header items-center border-b border-border bg-surface-lowest px-margin-mobile md:px-gutter">
        <Link to={ROUTES.portal} className="ml-2 flex items-center gap-2.5">
          <img src={administralLogo} alt="Administral" className="size-9 shrink-0 object-contain" />
          <span className="text-headline-md text-primary">ADMINISTRAL</span>
        </Link>
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
