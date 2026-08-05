import { Menu, UserRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import logo from '@/assets/administral-logo.png';

/** La marque compacte prise une fois la page défilée — cf. `LandingHeader`. */
const SCROLLED_LOGO = '/erasebg-transformed.png';
import { cn } from '@/lib/utils';

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
  const [scrolled, setScrolled] = useState(false);

  // Sticky over a photo hero with no separation, the bar previously let content
  // slide under it with nothing to anchor it. It stays plain at the top and
  // gains a frosted background once the page moves — sans filet de séparation :
  // sur le fond clair du contenu il se lisait comme une ligne blanche parasite,
  // l'ombre portée suffit à détacher la barre.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-background/85 shadow-soft backdrop-blur-md'
          : 'bg-background',
      )}
    >
      <div
        className={cn(
          'mx-auto flex max-w-7xl items-center justify-between px-6 transition-all duration-300',
          scrolled ? 'h-14' : 'h-16',
        )}
      >
        <Link to={ROUTES.home} className="flex items-center gap-3">
          <img
            src={scrolled ? SCROLLED_LOGO : logo}
            alt="Administral"
            className={cn(
              'shrink-0 object-contain transition-all duration-300',
              scrolled ? 'size-9' : 'size-11',
            )}
          />
          <span className="text-center leading-none">
            <span className="block font-display text-lg font-extrabold leading-tight tracking-tight text-ink">
              ADMINISTRAL
            </span>
            <span className="mt-0.5 block text-sm leading-tight text-muted-foreground">
              République 5.0
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-2 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="group relative rounded-sm px-3 py-2 text-label-md text-foreground/70 transition-colors hover:text-brand"
            >
              {link.label}
              {/* Underline grows from the centre — gives the links a hover state
                  beyond a colour change, matching the rest of the page. */}
              <span
                className="absolute inset-x-3 bottom-1 h-0.5 origin-center scale-x-0 rounded-full bg-brand transition-transform duration-300 group-hover:scale-x-100"
                aria-hidden="true"
              />
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to={ROUTES.login}
            className="hidden items-center gap-2 rounded-sm bg-marianne px-5 py-2.5 text-label-md text-marianne-foreground shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft-hover sm:inline-flex"
          >
            <UserRound className="size-4" aria-hidden="true" />
            Se connecter
          </Link>
          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-sm border border-border/60 text-ink lg:hidden"
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
              className="rounded-sm px-4 py-3 text-label-md text-foreground/80 transition-colors hover:bg-brand-soft hover:text-brand"
            >
              {link.label}
            </a>
          ))}
          <Link
            to={ROUTES.login}
            onClick={() => setMenuOpen(false)}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-sm bg-marianne px-5 py-3 text-label-md text-marianne-foreground sm:hidden"
          >
            <UserRound className="size-4" aria-hidden="true" />
            Se connecter
          </Link>
        </nav>
      )}
    </header>
  );
}
