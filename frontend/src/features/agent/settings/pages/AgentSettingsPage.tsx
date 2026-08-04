import { Mail } from 'lucide-react';

import { SettingRow } from '@/components/settings/SettingRow';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AgentPage } from '@/features/agent/components';
import { useUserSettings } from '@/hooks/useUserSettings';

/**
 * Back-office settings — real, backend-wired.
 *
 * The same `/settings` endpoint as the citizen, scoped to this account. An agent
 * only sees the preference that applies to them: an e-mail copy when a new
 * dossier lands in the queue. Accessibility preferences are deliberately NOT
 * duplicated here — they are a cross-cutting `uiStore` concern set once.
 */
export default function AgentSettingsPage() {
  const { settings, isLoading, error, savingKey, setToggle } = useUserSettings();

  return (
    <AgentPage title="Paramètres" description="Préférences de l’espace agent.">
      {error && (
        <Alert tone="error" className="mb-gutter">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="overflow-hidden">
        <CardContent className="divide-y divide-border p-0">
          {isLoading || !settings ? (
            <div className="flex items-start justify-between gap-4 px-5 py-4">
              <div className="flex flex-1 gap-3">
                <Skeleton className="size-5 rounded" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-2 h-3 w-64" />
                </div>
              </div>
              <Skeleton className="h-6 w-11 rounded-full" />
            </div>
          ) : (
            <SettingRow
              icon={Mail}
              label="Alertes par e-mail"
              description="Recevez une copie par e-mail lorsqu’un nouveau dossier arrive dans la file d’instruction."
              checked={settings.emailNotifications}
              onCheckedChange={(v) => setToggle('emailNotifications', v)}
              disabled={savingKey === 'emailNotifications'}
            />
          )}
        </CardContent>
      </Card>
    </AgentPage>
  );
}
