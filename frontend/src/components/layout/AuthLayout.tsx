import { Landmark } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';

import { APP_CONFIG } from '@/app/config/app';
import { ROUTES } from '@/app/router/paths';
import { PartnerLogos } from '@/components/layout/PartnerLogos';
import { SkipLink } from '@/components/layout/SkipLink';
import { VoicePageProvider } from '@/features/voice/context/VoicePageContext';
import { VoiceAssistantProvider } from '@/features/voice/components/VoiceAssistantProvider';

/**
 * Centred, chrome-free layout for the entry journey (login, registration).
 * Matches the "Ad'Ministral Core" reference: fixed brand header, a single
 * centred card over a soft decorative backdrop, partner attribution pinned
 * to the bottom. Voice providers are included so the assistant can help
 * users fill in their credentials (email only — password is masked and
 * never read aloud).
 */
export function AuthLayout() {
  return (
    <VoicePageProvider>
      <VoiceAssistantProvider>
        <div className="relative flex min-h-screen flex-col bg-background">
          <SkipLink />

          {/* Decorative backdrop — soft brand-tinted blobs, purely visual. */}
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-20"
          >
            <div className="absolute -right-[10%] -top-[10%] size-[600px] rounded-full bg-primary-fixed blur-[120px]" />
            <div className="absolute -bottom-[10%] -left-[10%] size-[500px] rounded-full bg-secondary-fixed blur-[100px]" />
          </div>

          <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-center bg-transparent px-margin-mobile md:px-margin-desktop">
            <Link to={ROUTES.home} className="flex items-center gap-2 rounded-lg">
              <Landmark className="size-6 text-ai" aria-hidden="true" />
              <span className="text-headline-md font-bold tracking-tight text-primary">
                {APP_CONFIG.name}
              </span>
            </Link>
          </header>

          <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center px-margin-mobile pb-32 pt-24">
            <main id="main-content" tabIndex={-1} className="focus:outline-none">
              <Outlet />
            </main>

            <nav aria-label="Liens utiles" className="mt-6">
              <ul className="flex flex-wrap justify-center gap-6">
                <li>
                  <Link to="/accessibilite" className="text-body-sm text-on-surface-variant hover:underline">
                    Accessibilité
                  </Link>
                </li>
                <li>
                  <Link to="/mentions-legales" className="text-body-sm text-on-surface-variant hover:underline">
                    Mentions légales
                  </Link>
                </li>
                <li>
                  <Link to={ROUTES.chat} className="text-body-sm text-on-surface-variant hover:underline">
                    Besoin d'aide ?
                  </Link>
                </li>
              </ul>
            </nav>
          </div>

          <footer className="fixed bottom-0 z-40 flex w-full flex-col items-center gap-3 border-t border-border bg-white/80 p-gutter backdrop-blur-sm md:flex-row md:justify-center md:gap-16">
            <p className="text-label-sm text-outline">Une initiative propulsée par</p>
            <PartnerLogos />
          </footer>
        </div>
      </VoiceAssistantProvider>
    </VoicePageProvider>
  );
}
