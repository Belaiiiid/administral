import { cn } from '@/lib/utils';

export interface CircularProgressProps {
  /** 0–100, or `null` while the value is unknown (renders an empty track). */
  value: number | null;
  label?: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Tailwind `stroke-*` AND `text-*` classes together (e.g.
   *  `"stroke-[#1D1D4B] text-[#1D1D4B]"`) for the filled arc and value text —
   *  each element picks the class family that applies to it, so pass both.
   *  Override when a feature needs its own accent (e.g. a partner brand
   *  color) instead of the app's default `primary`. */
  progressClassName?: string;
}

/** The SVG gauge from the APL dashboard status card. */
export function CircularProgress({
  value,
  label = 'Analysé',
  size = 160,
  strokeWidth = 12,
  className,
  progressClassName = 'stroke-primary text-primary',
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const isEmpty = value === null;
  const offset = isEmpty
    ? circumference
    : circumference * (1 - Math.min(Math.max(value, 0), 100) / 100);

  return (
    <div
      className={cn('relative flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={isEmpty ? `${label} — donnée non disponible` : `${value}% — ${label}`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          strokeWidth={strokeWidth}
          className="stroke-surface-container"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn(progressClassName, 'transition-[stroke-dashoffset] duration-700 ease-standard')}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={cn('text-headline-lg', isEmpty ? 'text-outline' : progressClassName)}>
          {isEmpty ? '—' : `${value}%`}
        </span>
        <span className="text-label-sm text-on-surface-variant">{label}</span>
      </div>
    </div>
  );
}
