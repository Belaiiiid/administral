import type { ReactNode } from 'react';

/**
 * Talan's real brand colors — read directly from the `fill` values in their
 * own official logo (`public/talan-logo.svg`, fetched from talan.com), not
 * guessed. Scoped to the France Travail zone only — the rest of the portal
 * keeps MonParcours' own identity; this is what visually marks the
 * difference from APL rather than reusing the same grey shell.
 */
const TALAN_BLUE = '#5480BA';
const TALAN_PURPLE = '#6B367D';
const TALAN_PINK = '#E04580';
const TALAN_OLIVE = '#8F9424';

/**
 * Partnership hero banner — background gradient built from Talan's own logo
 * colors. The France Travail mark is their "Logo FT" variant (no République
 * Française bloc marque) — just their own name, not the government
 * signature block — sitting on a white chip so it stays crisp on the
 * gradient.
 */
function PartnerBanner() {
  return (
    <div
      className="mb-6 flex flex-wrap items-center gap-6 rounded-xl border-b-4 px-6 py-8 sm:px-10"
      style={{
        background: `linear-gradient(135deg, ${TALAN_BLUE} 0%, ${TALAN_PURPLE} 55%, ${TALAN_PINK} 100%)`,
        borderBottomColor: TALAN_OLIVE,
      }}
    >
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center rounded-lg bg-white p-3 shadow-soft">
          <img src="/france-travail-logo.svg" alt="France Travail" className="h-10 w-auto sm:h-12" />
        </div>
        <div className="leading-tight">
          <p className="text-headline-sm text-white">Accompagnement à la candidature</p>
          <p className="text-body-sm text-white/80">Propulsé par MonParcours</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Shared shell for every France Travail page — the partner banner plus a
 * colored backdrop (light tints of Talan's colors, so a plain grey page
 * doesn't look identical to APL's, which is exactly what this exists to
 * avoid). Extracted once a second France Travail page (the CV coach) needed
 * the same treatment; both now read as the same zone.
 */
export function FranceTravailShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-container">
      <div
        className="rounded-2xl p-4 sm:p-6"
        style={{
          background: `linear-gradient(160deg, ${TALAN_BLUE}1F 0%, ${TALAN_PURPLE}17 50%, ${TALAN_PINK}1F 100%)`,
        }}
      >
        <PartnerBanner />
        {children}
      </div>
    </div>
  );
}
