import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { cn } from '@/lib/utils';

export interface CitizenBackButtonProps {
  /**
   * Where to go when there is no history to pop — a citizen who opened this
   * URL directly (bookmark, new tab, link from an e-mail) has nothing behind
   * them, and `navigate(-1)` would take them out of the app entirely.
   */
  fallbackTo: string;
  /**
   * Jamais affiché : le bouton ne montre que la flèche. Le libellé reste dans
   * le DOM en `sr-only` — c'est le nom accessible du contrôle, et une flèche
   * seule laisserait un bouton anonyme au lecteur d'écran.
   */
  label?: string;
  className?: string;
}

/** True when React Router has a previous entry in this tab's history stack. */
function hasHistory(): boolean {
  const state = window.history.state as { idx?: number } | null;
  return (state?.idx ?? 0) > 0;
}

/**
 * Pastille « Retour » : pastille ronde de 40px, bordure fine, fond carte, ombre
 * douce, flèche seule — le traitement des écrans de connexion et d'inscription,
 * désormais celui de toutes les interfaces.
 *
 * Les teintes viennent des tokens du thème (`border`, `card`, `brand`) et non
 * des variables `--login-*` : celles-ci ne sont déclarées que dans
 * `.login-scope`, alors que ce bouton doit tenir partout — `.citizen-scope`,
 * France Travail, back-office agent.
 */
const PILL = [
  'inline-flex size-10 items-center justify-center rounded-full',
  'border border-border bg-card text-muted-foreground shadow-soft',
  'transition-colors hover:border-brand/30 hover:bg-brand-soft hover:text-brand',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
].join(' ');

/** "Retour" control for the citizen area — Administral-styled. */
export function CitizenBackButton({
  fallbackTo,
  label = 'Retour',
  className,
}: CitizenBackButtonProps) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => (hasHistory() ? navigate(-1) : navigate(fallbackTo))}
      className={cn(PILL, className)}
    >
      <ArrowLeft className="size-[18px]" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </button>
  );
}
