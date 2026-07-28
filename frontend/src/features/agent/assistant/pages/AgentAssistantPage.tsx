import { Bot } from 'lucide-react';

import { EmptyState } from '@/components/shared';
import { Card, CardContent } from '@/components/ui/card';
import { AgentPage } from '@/features/agent/components';

/**
 * Agent-facing assistant — regulatory lookup and case summarisation.
 *
 * Distinct from the citizen `features/chatbot`: different corpus, different
 * tone, different permissions. Sharing the chat transport later is a service
 * concern; the two UIs stay separate.
 */
export default function AgentAssistantPage() {
  return (
    <AgentPage
      title="Assistant IA"
      description="Recherche réglementaire et synthèse de dossiers."
    >
      <Card>
        <CardContent className="px-0">
          <EmptyState
            icon={Bot}
            title="Assistant indisponible"
            description="Aucun service conversationnel agent n’est encore branché."
          />
        </CardContent>
      </Card>
    </AgentPage>
  );
}
