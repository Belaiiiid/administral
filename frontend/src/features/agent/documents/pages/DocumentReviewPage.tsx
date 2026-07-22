import { FileCheck } from 'lucide-react';

import { EmptyState } from '@/components/shared';
import { Card, CardContent } from '@/components/ui/card';
import { AgentPage } from '@/features/agent/components';

/**
 * Supporting-document review.
 *
 * Note the deliberate naming distance from the citizen `features/documents`
 * module: that one is "my documents", this one is "documents awaiting a
 * verification decision". They share no code.
 */
export default function DocumentReviewPage() {
  return (
    <AgentPage
      title="Pièces justificatives"
      description="Vérification des pièces déposées par les allocataires."
    >
      <Card>
        <CardContent className="px-0">
          <EmptyState
            icon={FileCheck}
            title="Aucune pièce à vérifier"
            description="La file de vérification sera alimentée par agentDocumentService."
          />
        </CardContent>
      </Card>
    </AgentPage>
  );
}
