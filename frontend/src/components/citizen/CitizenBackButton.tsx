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
  label?: string;
  className?: string;
}

/** True when React Router has a previous entry in this tab's history stack. */
function hasHistory(): boolean {
  const state = window.history.state as { idx?: number } | null;
  return (state?.idx ?? 0) > 0;
}

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
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-muted-foreground transition-colors hover:text-brand',
        className,
      )}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}
