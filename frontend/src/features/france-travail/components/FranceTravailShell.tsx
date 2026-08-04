import type { ReactNode } from 'react';

import { CitizenPageHeader } from '@/components/citizen/CitizenPageHeader';

interface FranceTravailShellProps {
  eyebrow: string;
  title: string;
  description: string;
  /** Encart optionnel à droite du titre (score, chiffre clé, statut…). */
  aside?: ReactNode;
  children: ReactNode;
}

/**
 * Bandeau commun aux pages France Travail, aligné sur la refonte Administral.
 *
 * Remplace l'ancien bandeau dégradé aux couleurs Talan : la zone France
 * Travail ne se distingue plus par une identité de couleur à elle, elle suit
 * le même template que le reste de l'espace citoyen. Ne reste de spécifique
 * que le logo France Travail, sur pastille blanche comme sur la maquette.
 *
 * Le titre passe par `CitizenPageHeader` plutôt que par un balisage maison —
 * même rythme et mêmes tokens que les autres pages citoyennes.
 */
export function FranceTravailShell({
  eyebrow,
  title,
  description,
  aside,
  children,
}: FranceTravailShellProps) {
  return (
    <div className="mx-auto max-w-container">
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-surface px-6 py-8 sm:px-10">
        {/* Halos décoratifs, comme la carte hero de la landing */}
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-brand/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 size-64 rounded-full bg-chart-2/5 blur-3xl" />

        <div className="relative grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-center">
          <div>
            <div className="mb-6 flex items-center gap-4">
              <span className="flex h-14 w-24 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card p-2.5 shadow-sm">
                <img
                  src="/france-travail-logo.svg"
                  alt="France Travail"
                  className="max-h-9 max-w-full object-contain"
                />
              </span>
              <p className="text-xs text-muted-foreground">France Travail — ex-Pôle emploi</p>
            </div>

            <CitizenPageHeader
              eyebrow={eyebrow}
              title={title}
              description={description}
              className="mb-0"
            />
          </div>

          {aside && <div className="lg:justify-self-end">{aside}</div>}
        </div>
      </div>

      <div className="mt-8">{children}</div>
    </div>
  );
}
