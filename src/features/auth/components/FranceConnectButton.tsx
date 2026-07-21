import { cn } from '@/lib/utils';

/**
 * FranceConnect entry point.
 *
 * Rendered with the official RF blue. No OIDC flow is wired — the auth module
 * will attach the redirect. Kept as its own component because FranceConnect has
 * strict brand rules that must not leak into the generic Button variants.
 */
export function FranceConnectButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={cn(
        'flex min-h-11 w-full items-center justify-center gap-3 rounded-lg bg-rf-blue px-4 py-3 text-label-md text-white transition-opacity hover:opacity-90',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-6 items-center justify-center rounded bg-white/90 text-[10px] font-bold text-rf-blue"
      >
        FC
      </span>
      S’identifier avec FranceConnect
    </button>
  );
}
