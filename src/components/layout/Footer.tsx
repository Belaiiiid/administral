import { Link } from 'react-router-dom';

import { APP_CONFIG, FOOTER_LINKS } from '@/app/config/app';
import { RepublicMark } from '@/components/layout/Logo';
import { cn } from '@/lib/utils';

export function Footer({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        'border-t border-border bg-surface-lowest px-margin-mobile py-8 md:px-gutter',
        className,
      )}
    >
      <div className="mx-auto flex max-w-container flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <RepublicMark />
          <p className="max-w-sm text-body-sm text-on-surface-variant">
            © {new Date().getFullYear()} {APP_CONFIG.administration} — {APP_CONFIG.legalEntity}.
          </p>
        </div>

        <nav aria-label="Liens de pied de page">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {FOOTER_LINKS.map((link) => (
              <li key={link.id}>
                <Link
                  to={link.href}
                  className="text-body-sm text-on-surface-variant transition-colors hover:text-primary hover:underline"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
