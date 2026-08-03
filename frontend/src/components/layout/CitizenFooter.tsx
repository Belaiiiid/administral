import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

import { APP_CONFIG, FOOTER_LINKS } from '@/app/config/app';
import { cn } from '@/lib/utils';

const ADMIN_REFS = [
  { title: 'CAF', domain: 'caf.fr', href: 'https://www.caf.fr' },
  { title: 'France Travail', domain: 'francetravail.fr', href: 'https://www.francetravail.fr' },
  { title: 'Assurance Maladie', domain: 'ameli.fr', href: 'https://www.ameli.fr' },
  { title: 'Impôts', domain: 'impots.gouv.fr', href: 'https://www.impots.gouv.fr' },
];

/**
 * Administral-styled footer — citizen area only. Structural twin of
 * `components/layout/Footer`, restyled with the Administral tokens (dark
 * `bg-ink` band, matching the reference design-to-code footer).
 */
export function CitizenFooter({ className }: { className?: string }) {
  return (
    <footer className={cn('bg-ink text-marianne-foreground', className)}>
      <div
        className="h-1 w-full bg-gradient-to-r from-brand via-chart-2 to-violet-600"
        aria-hidden="true"
      />
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="space-y-4 border-b border-marianne-foreground/10 pb-8">
          <h5 className="text-xs font-bold uppercase tracking-widest text-marianne-foreground/60">
            Références administratives
          </h5>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ADMIN_REFS.map((r) => (
              <a
                key={r.title}
                href={r.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-2 rounded-xl border border-marianne-foreground/10 bg-marianne-foreground/5 px-4 py-3 transition-colors hover:bg-marianne-foreground/10"
              >
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-marianne-foreground">
                    {r.title}
                  </span>
                  <span className="text-[11px] text-marianne-foreground/50">{r.domain}</span>
                </span>
                <ExternalLink className="size-3.5 shrink-0 text-marianne-foreground/40" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 pt-8 text-center text-xs text-marianne-foreground/50 sm:flex-row sm:text-left">
          <p>
            © {new Date().getFullYear()} Administral — {APP_CONFIG.administration}.
          </p>
          <nav aria-label="Liens de pied de page" className="flex flex-wrap items-center justify-center gap-6">
            {FOOTER_LINKS.map((link) => (
              <Link key={link.id} to={link.href} className="transition-colors hover:text-white">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
