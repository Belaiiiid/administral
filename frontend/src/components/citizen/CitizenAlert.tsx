import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type CitizenAlertTone = 'info' | 'success' | 'error';

const TONE_STYLE: Record<CitizenAlertTone, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: 'border-brand/20 bg-brand-soft text-ink [&_svg]:text-brand' },
  success: {
    icon: CheckCircle2,
    className: 'border-emerald-200 bg-emerald-50 text-ink [&_svg]:text-emerald-600',
  },
  error: {
    icon: AlertTriangle,
    className: 'border-destructive/20 bg-destructive/5 text-destructive [&_svg]:text-destructive',
  },
};

export interface CitizenAlertProps {
  tone?: CitizenAlertTone;
  title?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Administral inline callout — citizen area only. Structural twin of
 * `components/ui/alert`, restyled with the Administral tokens. Kept separate
 * so the agent back-office, which reuses the original, is never affected.
 */
export function CitizenAlert({ tone = 'info', title, children, className }: CitizenAlertProps) {
  const { icon: Icon, className: toneClass } = TONE_STYLE[tone];

  return (
    <div
      role="status"
      className={cn('flex gap-3 rounded-2xl border p-4 text-sm', toneClass, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-display font-bold">{title}</p>}
        <div className={cn('leading-relaxed', title && 'mt-1')}>{children}</div>
      </div>
    </div>
  );
}
