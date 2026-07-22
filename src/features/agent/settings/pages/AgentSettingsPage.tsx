import { Settings } from 'lucide-react';

import { EmptyState } from '@/components/shared';
import { Card, CardContent } from '@/components/ui/card';
import { AgentPage } from '@/features/agent/components';

/**
 * Back-office preferences: queue defaults, notifications, delegation.
 *
 * Accessibility preferences are deliberately NOT duplicated here — they are a
 * cross-cutting concern owned by `uiStore` and configured once in the citizen
 * profile, for the same human.
 */
export default function AgentSettingsPage() {
  return (
    <AgentPage
      title="Paramètres"
      description="Préférences de l’espace agent."
    >
      <Card>
        <CardContent className="px-0">
          <EmptyState
            icon={Settings}
            title="Aucun paramètre disponible"
            description="Les préférences agent seront persistées côté serveur."
          />
        </CardContent>
      </Card>
    </AgentPage>
  );
}
