import { Link, Outlet } from 'react-router-dom';

import { APP_CONFIG } from '@/app/config/app';
import { ROUTES } from '@/app/router/paths';
import administralLogo from '@/assets/administral-logo.png';
import { PartnerLogos } from '@/components/layout/PartnerLogos';
import { SkipLink } from '@/components/layout/SkipLink';
import { VoicePageProvider } from '@/features/voice/context/VoicePageContext';
import { VoiceAssistantProvider } from '@/features/voice/components/VoiceAssistantProvider';

/**
 * Centred, chrome-free layout for the entry journey (login, registration).
 * Matches the login mockup: logo above a single ~520px card.
 * Voice providers are included so the assistant can help users fill in
 * their credentials (email only — password is masked and never read aloud).
 */
export function AuthLayout() {
  return (
    <VoicePageProvider>
      <VoiceAssistantProvider>
        <div className="flex min-h-screen flex-col bg-background px-margin-mobile py-12">
          <SkipLink />

          <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col justify-center">
            <div className="mb-8 flex flex-col items-center gap-3 text-center">
              <Link to={ROUTES.home} className="flex items-center gap-3 rounded-lg">
                <img src={administralLogo} alt="Administral" className="h-14 w-14 shrink-0 object-contain" />
                <span className="flex flex-col text-left leading-tight">
                  <span className="text-headline-md text-primary">ADMINISTRAL</span>
                  <span className="text-label-sm uppercase tracking-widest text-on-surface-variant">
                    Service Public
                  </span>
                </span>
              </Link>
              <p className="text-body-md text-on-surface-variant">{APP_CONFIG.tagline}</p>
              <PartnerLogos className="gap-6" logoClassName="h-14" mistralMark="wordmark" />
            </div>

            <main id="main-content" tabIndex={-1} className="focus:outline-none">
              <Outlet />
            </main>
          </div>

          <nav aria-label="Liens utiles" className="mt-8">
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
      </VoiceAssistantProvider>
    </VoicePageProvider>
  );
}
