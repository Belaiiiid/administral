import { cn } from '@/lib/utils';

/**
 * FranceConnect entry point.
 *
 * Rendered with the official RF blue (`rf-blue` = `#000091`, the real DSFR
 * "Bleu France" — extracted from `systeme-de-design.gouv.fr`'s own
 * `dsfr.min.css`, not guessed) and the real FranceConnect mark
 * (`public/franceconnect-icon.svg`, decoded from that same official CSS's
 * `.fr-connect:before` background — the actual icon their button uses, not a
 * placeholder). No OIDC flow is wired — the auth module will attach the
 * redirect. Kept as its own component because FranceConnect has strict brand
 * rules that must not leak into the generic Button variants.
 */
export function FranceConnectButton({ className }: { className?: string }) {
  // No OIDC flow yet — disabled rather than silently inert, so it reads as
  // "coming soon" instead of a broken button. Registration/login use the
  // e-mail + password form below it.
  return (
    <button
      type="button"
      disabled
      title="Bientôt disponible"
      aria-label="S’identifier avec FranceConnect (bientôt disponible)"
      className={cn(
        'flex min-h-11 w-full items-center justify-center gap-3 rounded-lg bg-rf-blue px-4 py-3 text-label-md text-white transition-opacity',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      <img src="/franceconnect-icon.svg" alt="" aria-hidden="true" className="size-7 shrink-0" />
      S’identifier avec FranceConnect
      <span className="text-label-sm opacity-80">(bientôt)</span>
    </button>
  );
}
