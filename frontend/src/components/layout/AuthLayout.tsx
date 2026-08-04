import { Link, Outlet, useLocation } from 'react-router-dom';

import { APP_CONFIG } from '@/app/config/app';
import { ROUTES } from '@/app/router/paths';
import administralLogo from '@/assets/administral-logo.png';
import { CitizenBackButton } from '@/components/citizen/CitizenBackButton';
import { PartnerLogos } from '@/components/layout/PartnerLogos';
import { SkipLink } from '@/components/layout/SkipLink';
import { cn } from '@/lib/utils';
import { VoicePageProvider } from '@/features/voice/context/VoicePageContext';
import { VoiceAssistantProvider } from '@/features/voice/components/VoiceAssistantProvider';

/**
 * Centred, chrome-free layout for the entry journey (login, registration).
 * Matches the login mockup: logo above a single ~520px card.
 * Voice providers are included so the assistant can help users fill in
 * their credentials (email only — password is masked and never read aloud).
 *
 * Login is the exception: its card carries its own header (CAF mark, heading,
 * tagline) to match the reference design, so this shell's header is skipped
 * for that one route rather than doubling up. The other entry pages —
 * register, forgotten/reset password, e-mail verification — are unchanged.
 */
export function AuthLayout() {
  const { pathname } = useLocation();
  const isLogin = pathname === ROUTES.login;

  return (
    <VoicePageProvider>
      <VoiceAssistantProvider>
        <div className="relative flex min-h-screen flex-col bg-background px-margin-mobile py-12">
        <div
          className={cn(
            'flex min-h-screen flex-col px-margin-mobile py-12',
            isLogin ? 'bg-[#f3f4f9]' : 'bg-background',
          )}
        >
          <SkipLink />

          {/*
            Pinned to the page corner rather than stacked above the card: in the
            flow it pushed the whole centred entry journey down and read as part
            of it. Leaving here goes back to wherever they came from, or to the
            public landing page for someone who opened /login directly.
          */}
          <CitizenBackButton
            fallbackTo={ROUTES.home}
            className="absolute left-4 top-6 md:left-8 md:top-8"
          />

          <div
            className={cn(
              'mx-auto flex w-full flex-1 flex-col justify-center',
              isLogin ? 'max-w-[470px]' : 'max-w-[520px]',
            )}
          >
            {!isLogin && (
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
            )}

            <main id="main-content" tabIndex={-1} className="focus:outline-none">
              <Outlet />
            </main>
          </div>

          {/* Dropped on the login screen for a cleaner card. Kept on every
              other entry page: « Mentions légales » and the accessibility
              statement are legally required on a French public service site,
              so they must stay reachable somewhere in the entry journey. */}
          {!isLogin && (
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
          )}
        </div>
      </VoiceAssistantProvider>
    </VoicePageProvider>
  );
}
