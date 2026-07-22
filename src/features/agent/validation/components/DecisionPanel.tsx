import { Check, TriangleAlert, X } from 'lucide-react';

import { SectionHeader } from '@/components/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { CaseDecisionController } from '@/features/agent/hooks';

export interface DecisionPanelProps {
  controller: CaseDecisionController;
}

/**
 * The agent's two actions.
 *
 * Holds no decision logic: each button forwards to the hook and nothing else.
 * The panel does not know what makes a rejection valid, does not inspect the
 * case, and never sees the explanation being composed — it only reflects
 * whatever the service returned.
 *
 * Hidden once a decision exists: a decision is a one-way transition, and a
 * still-clickable "Rejeter" beside a recorded approval invites a mistake the
 * backend would have to refuse anyway.
 */
export function DecisionPanel({ controller }: DecisionPanelProps) {
  const { approve, reject, isSubmitting, error, decision } = controller;

  if (decision) return null;

  return (
    <Card>
      <CardHeader>
        <SectionHeader title="Décision" as="h2" />
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-body-md text-on-surface-variant">
          L’instruction de ce dossier est terminée. La décision vous revient : elle sera notifiée à
          l’allocataire avec le motif correspondant.
        </p>

        {error && (
          <Alert tone="warning">
            <TriangleAlert aria-hidden="true" />
            <div>
              <AlertTitle>Décision impossible</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </div>
          </Alert>
        )}

        <div className="flex flex-wrap gap-4">
          <Button onClick={approve} disabled={isSubmitting}>
            <Check aria-hidden="true" />
            Accepter
          </Button>
          <Button variant="destructive" onClick={reject} disabled={isSubmitting}>
            <X aria-hidden="true" />
            Rejeter
          </Button>
        </div>

        <p aria-live="polite" className="text-body-sm text-on-surface-variant">
          {isSubmitting ? 'Enregistrement de la décision…' : ''}
        </p>
      </CardContent>
    </Card>
  );
}
