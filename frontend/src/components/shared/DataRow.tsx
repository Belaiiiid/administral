import { cn } from '@/lib/utils';

export interface DataRowProps {
  label: string;
  /**
   * Omit (or pass `null`) while the value is unknown: the row keeps its height
   * and renders a neutral placeholder instead of collapsing the layout.
   */
  value?: React.ReactNode;
  /**
   * `divided` — bottom border (dashboard widgets).
   * `filled` — tinted band (profile detail cards).
   */
  variant?: 'divided' | 'filled';
  className?: string;
}

/** Label/value pair — the atom of every summary widget in the mockups. */
export function DataRow({ label, value, variant = 'divided', className }: DataRowProps) {
  const isEmpty = value === undefined || value === null || value === '';

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4',
        variant === 'divided' && 'border-b border-border py-2 last:border-b-0',
        variant === 'filled' && 'rounded-lg bg-surface-low px-4 py-3',
        className,
      )}
    >
      <span className="text-body-sm text-on-surface-variant">{label}</span>
      {isEmpty ? (
        <span className="text-label-md text-outline">
          <span aria-hidden="true">—</span>
          <span className="sr-only">Non renseigné</span>
        </span>
      ) : (
        <span className="text-label-md text-on-surface">{value}</span>
      )}
    </div>
  );
}
