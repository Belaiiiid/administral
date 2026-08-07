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
export function FranceConnectButton({
  className,
  variant = 'brand',
}: {
  className?: string;
  /**
   * `brand` — bleu France officiel, l'aspect historique, gardé partout ailleurs.
   * `muted` — traitement gris « à venir » de l'écran de connexion : le bouton
   * étant inerte tant que l'OIDC n'est pas branché, l'écran de connexion assume
   * de ne pas le faire ressembler à l'action principale.
   */
  variant?: 'brand' | 'muted';
}) {
  // No OIDC flow yet — disabled rather than silently inert, so it reads as
  // "coming soon" instead of a broken button. Registration/login use the
  // e-mail + password form below it.
  const muted = variant === 'muted';

  return (
    <button
      type="button"
      disabled
      title="Bientôt disponible"
      aria-label="S’identifier avec FranceConnect (bientôt disponible)"
      className={cn(
        'flex min-h-11 w-full items-center justify-center gap-3 rounded-lg px-4 py-3 text-label-md transition-opacity',
        'disabled:cursor-not-allowed',
        muted
          ? 'bg-[var(--login-muted-surface)] text-[var(--login-muted-text)]'
          : 'bg-rf-blue text-white disabled:opacity-50',
        className,
      )}
    >
      {muted ? (
        // La marque officielle n'a pas à être délavée : on la sort du bleu
        // France et on la pose dans un carré gris neutre, plutôt que d'appliquer
        // une opacité à un logo institutionnel.
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--login-muted-mark)]">
          <img src="/franceconnect-icon.svg" alt="" aria-hidden="true" className="size-5" />
        </span>
      ) : (
        <img src="/franceconnect-icon.svg" alt="" aria-hidden="true" className="size-7 shrink-0" />
      )}
      S’identifier avec FranceConnect
      {muted ? (
        <span className="rounded-full bg-[var(--login-muted-mark)] px-2.5 py-0.5 text-label-sm text-[var(--login-muted-text)]">
          Bientôt
        </span>
      ) : (
        <span className="text-label-sm opacity-80">(bientôt)</span>
      )}
    </button>
  );
}
