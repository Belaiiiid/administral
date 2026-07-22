import { Link, Outlet } from 'react-router-dom';

import { APP_CONFIG } from '@/app/config/app';
import { ROUTES } from '@/app/router/paths';
import { Logo } from '@/components/layout/Logo';
import { SkipLink } from '@/components/layout/SkipLink';

/**
 * Centred, chrome-free layout for the entry journey (login, registration).
 * Matches the login mockup: logo above a single ~520px card.
 */
export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background px-margin-mobile py-12">
      <SkipLink />

      <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col justify-center">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Link to={ROUTES.home} className="rounded-lg">
            <Logo />
          </Link>
          <p className="text-body-md text-on-surface-variant">{APP_CONFIG.tagline}</p>
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
              Besoin d’aide ?
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
