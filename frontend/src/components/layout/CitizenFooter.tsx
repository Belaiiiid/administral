import { ExternalLink, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

import { APP_CONFIG, FOOTER_LINKS } from '@/app/config/app';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/store/sessionStore';

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
 *
 * Signed-out only. Once there is a session the whole band is dropped: the
 * authenticated area is a workspace, and the marketing-style references row
 * plus the legal bar read as chrome there.
 *
 * Gated here rather than at each of the two call sites (`CitizenAppShell`,
 * `PublicLandingPage`) so the rule holds wherever the footer is mounted next.
 *
 * ⚠️ This also removes the only link to « Mentions légales », the
 * accessibility statement, « Données personnelles » and « Gestion des
 * cookies » for a signed-in citizen — all four are mandatory on a French
 * public service, as is the AI Act (Règlement (UE) 2024/1689, art. 50)
 * notice above them. They stay reachable at their own routes, but nothing
 * in the authenticated UI points to them any more; they need a home
 * elsewhere (settings, or a discreet link in the shell).
 */
export function CitizenFooter({ className }: { className?: string }) {
  const user = useSessionStore((state) => state.user);

  if (user) return null;

  return (
    <footer className={cn('bg-ink text-marianne-foreground', className)}>
      <div
        className="h-1 w-full bg-gradient-to-r from-brand via-chart-2 to-chart-3"
        aria-hidden="true"
      />
      {/* No bottom reserve for the floating bubbles: they lift themselves over
          the footer instead (see `useFooterLift` in FloatingActionBubbles). */}
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="space-y-3 border-b border-marianne-foreground/10 pb-6">
          <h5 className="text-label-sm uppercase tracking-widest text-marianne-foreground/60">
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
                  <span className="text-label-md text-marianne-foreground">
                    {r.title}
                  </span>
                  <span className="text-[11px] text-marianne-foreground/50">{r.domain}</span>
                </span>
                <ExternalLink className="size-3.5 shrink-0 text-marianne-foreground/40" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 pt-6 text-center text-xs text-marianne-foreground/50 sm:flex-row sm:text-left">
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 sm:justify-start">
            <span>
              © {new Date().getFullYear()} Administral — {APP_CONFIG.administration}.
            </span>
            {/*
              AI Act (Règlement (UE) 2024/1689, art. 50) transparency notice,
              kept to a single line beside the copyright.
            */}
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="size-3 shrink-0" aria-hidden="true" />
              interfaces générées par intelligence artificielle.
            </span>
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
