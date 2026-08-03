import { Menu, UserRound, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import logo from '@/assets/administral-logo.png';

const NAV_LINKS = [
  { href: '#services', label: 'Services' },
  { href: '#fonctionnalites', label: 'Fonctionnalités' },
  { href: '#ia', label: 'IA générative' },
  { href: '#aide', label: 'Aide' },
] as const;

/**
 * Administral-styled public header — structural twin of the reference
 * design-to-code `Header`, adapted to `react-router-dom` and to a real "Se
 * connecter" destination.
 */
export function LandingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
        <Link to={ROUTES.home} className="flex items-center gap-3">
          <img src={logo} alt="Administral" className="h-16 w-16 shrink-0 object-contain" />
          <span className="leading-tight">
            <span className="block font-display text-xl font-extrabold tracking-tight text-ink">
              ADMINISTRAL
            </span>
            <span className="block text-[11px] text-muted-foreground">
              L’administration à vos côtés
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-foreground/80 transition-colors hover:text-brand"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to={ROUTES.login}
            className="hidden items-center gap-2 rounded-md bg-marianne px-5 py-3 text-sm font-semibold text-marianne-foreground transition-opacity hover:opacity-90 sm:inline-flex"
          >
            <UserRound className="size-4" aria-hidden="true" />
            Se connecter
          </Link>
          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-lg border border-border/60 text-ink lg:hidden"
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
            aria-controls="landing-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav
          id="landing-nav"
          aria-label="Navigation principale"
          className="flex flex-col gap-1 border-t border-border/60 bg-background p-4 lg:hidden"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="rounded-lg px-4 py-3 text-sm font-semibold text-foreground/80 transition-colors hover:bg-brand-soft hover:text-brand"
            >
              {link.label}
            </a>
          ))}
          <Link
            to={ROUTES.login}
            onClick={() => setMenuOpen(false)}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-md bg-marianne px-5 py-3 text-sm font-semibold text-marianne-foreground sm:hidden"
          >
            <UserRound className="size-4" aria-hidden="true" />
            Se connecter
          </Link>
        </nav>
      )}
    </header>
  );
}
