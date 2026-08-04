import { APP_CONFIG } from '@/app/config/app';
import logoMark from '@/assets/administral-logo.png';
import { cn } from '@/lib/utils';

export interface LogoProps {
  /** Hide the wordmark, keeping only the mark (collapsed rails). */
  markOnly?: boolean;
  /** Line under the wordmark. Names the area when one lockup serves several. */
  subtitle?: string;
  className?: string;
}

/**
 * The Ad'Ministral lockup: the real mark plus the wordmark.
 *
 * Rendered by the agent rail, the France Travail rail and the administration
 * header — the three back-office interfaces. The citizen area and the auth /
 * focus screens draw their own mark from the same image file, so this carries
 * the placeholder `Landmark` glyph nowhere any more.
 */
export function Logo({ markOnly = false, subtitle = 'Service Public', className }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* Decorative when the wordmark sits beside it — otherwise a screen
          reader announces "Ad'Ministral" twice. */}
      <img
        src={logoMark}
        alt={markOnly ? APP_CONFIG.name : ''}
        aria-hidden={markOnly ? undefined : true}
        className="size-10 shrink-0 object-contain"
      />
      {!markOnly && (
        <span className="flex flex-col leading-tight">
          <span className="text-headline-md text-primary">{APP_CONFIG.name}</span>
          <span className="text-label-sm uppercase tracking-widest text-on-surface-variant">
            {subtitle}
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * The tricolore block of the République Française identity.
 *
 * Vertical bands, blue-white-red left to right — the French flag. Horizontal
 * bands would be the Dutch one; easy to get backwards since both use the same
 * three colours, so it's worth this note.
 */
export function RepublicMark({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className="flex h-4 w-6 flex-row overflow-hidden rounded-sm border border-border"
      >
        <span className="w-1/3 bg-rf-blue" />
        <span className="w-1/3 bg-rf-white" />
        <span className="w-1/3 bg-rf-red" />
      </span>
      <span className="text-label-sm uppercase tracking-tight text-on-surface">
        République Française
      </span>
    </div>
  );
}
