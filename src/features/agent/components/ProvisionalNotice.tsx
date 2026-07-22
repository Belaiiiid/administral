import { TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * Standing warning that an agent screen has no design behind it.
 *
 * No mockup exists for the back-office (docs/design-analysis.md §1.4), so every
 * page here is composed from existing primitives and must be revalidated when
 * the agent-facing designs arrive. Extracted from the original dashboard so the
 * wording stays identical across the portal — and so removing it once designs
 * land is a one-file change.
 */
export function ProvisionalNotice() {
  return (
    <Alert tone="warning" className="mb-8">
      <TriangleAlert aria-hidden="true" />
      <div>
        <AlertTitle>Écran provisoire</AlertTitle>
        <AlertDescription>
          Aucune maquette de référence n’existe pour l’espace agent. Cette page est un squelette
          construit à partir des composants existants et devra être revalidée.
        </AlertDescription>
      </div>
    </Alert>
  );
}
