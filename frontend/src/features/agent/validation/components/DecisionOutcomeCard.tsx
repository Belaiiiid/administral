import { CheckCircle2, Quote, XCircle } from 'lucide-react';

import { SectionHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import type { CaseDecision } from '@/types';

export interface DecisionOutcomeCardProps {
  decision: CaseDecision;
}

/**
 * The recorded decision: outcome, the message the citizen will receive, and the
 * evidence that message was built from.
 *
 * Showing the evidence beside the message is the point of this card, not a
 * detail of it. The agent is accountable for the decision, so they must be able
 * to check that every claim made to the citizen in their name traces back to
 * something in the file — and `source` names the exact field, so the check does
 * not rely on trusting the generator.
 *
 * This becomes load-bearing once Mistral writes the message rather than a
 * template: this card is where an unsupported sentence would become visible.
 */
export function DecisionOutcomeCard({ decision }: DecisionOutcomeCardProps) {
  const isApproved = decision.outcome === 'validated';

  return (
    <Card>
      <CardHeader>
        <SectionHeader
          title="Décision enregistrée"
          as="h2"
          action={
            <Badge tone={isApproved ? 'success' : 'error'}>
              {isApproved ? (
                <CheckCircle2 aria-hidden="true" />
              ) : (
                <XCircle aria-hidden="true" />
              )}
              {isApproved ? 'Acceptée' : 'Rejetée'}
            </Badge>
          }
        />
      </CardHeader>

      <CardContent className="space-y-6">
        <div>
          <h3 className="section-title mb-2">Message transmis à l’allocataire</h3>
          <blockquote className="flex gap-3 rounded-lg border-l-4 border-l-primary bg-surface-low p-4">
            <Quote className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-body-md text-on-surface">{decision.explanation}</p>
          </blockquote>
        </div>

        <div>
          <h3 className="section-title mb-2">
            Éléments du dossier justifiant la décision ({decision.evidenceUsed.length})
          </h3>

          {decision.evidenceUsed.length === 0 ? (
            <p className="text-body-sm text-on-surface-variant">
              Aucun élément particulier n’a été cité : le dossier ne présentait pas de réserve.
            </p>
          ) : (
            <ul className="space-y-2">
              {decision.evidenceUsed.map((evidence) => (
                <li key={evidence.source} className="rounded-lg bg-surface-low px-4 py-3">
                  <p className="text-body-md text-on-surface">{evidence.value}</p>
                  <p className="mt-1 text-body-sm text-on-surface-variant">
                    <span className="text-label-sm uppercase tracking-wider">{evidence.field}</span>
                    {' · '}
                    <code className="text-body-sm">{evidence.source}</code>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-body-sm text-on-surface-variant">
          Décision rendue le {formatDate(decision.createdAt)} par {decision.decidedBy}.
        </p>
      </CardContent>
    </Card>
  );
}
