import { Mail, Share2, Sparkles } from 'lucide-react';

import { SettingRow } from '@/components/settings/SettingRow';
import { PageHeader } from '@/components/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUserSettings } from '@/hooks/useUserSettings';

/**
 * Citizen settings — real, backend-wired.
 *
 * Each toggle persists on change (`PATCH /settings`). These are the citizen's
 * own preferences: notification delivery, assistant availability, and the
 * cross-administration data-sharing consent (off by default — consent is opt-in).
 */
export default function CitizenSettingsPage() {
  useDocumentTitle('Paramètres');
  const { settings, isLoading, error, savingKey, setToggle } = useUserSettings();

  return (
    <div className="mx-auto max-w-container">
      <PageHeader title="Paramètres" description="Gérez vos préférences et vos consentements." />

      {error && (
        <Alert tone="error" className="mb-gutter">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="overflow-hidden">
        <CardContent className="divide-y divide-border p-0">
          {isLoading || !settings ? (
            <SettingsSkeleton />
          ) : (
            <>
              <SettingRow
                icon={Mail}
                label="Notifications par e-mail"
                description="Recevez une copie par e-mail des évènements concernant vos dossiers."
                checked={settings.emailNotifications}
                onCheckedChange={(v) => setToggle('emailNotifications', v)}
                disabled={savingKey === 'emailNotifications'}
              />
              <SettingRow
                icon={Sparkles}
                label="Assistant IA"
                description="Affichez l’assistant qui vous guide dans votre profil et vos démarches."
                checked={settings.aiAssistance}
                onCheckedChange={(v) => setToggle('aiAssistance', v)}
                disabled={savingKey === 'aiAssistance'}
              />
              <SettingRow
                icon={Share2}
                label="Partage entre administrations"
                description="Autorisez le partage des informations que vous déclarez avec les administrations concernées, pour éviter de les ressaisir."
                checked={settings.crossAdministrationSharing}
                onCheckedChange={(v) => setToggle('crossAdministrationSharing', v)}
                disabled={savingKey === 'crossAdministrationSharing'}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-start justify-between gap-4 px-5 py-4">
          <div className="flex flex-1 gap-3">
            <Skeleton className="size-5 rounded" />
            <div className="flex-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-64" />
            </div>
          </div>
          <Skeleton className="h-6 w-11 rounded-full" />
        </div>
      ))}
    </>
  );
}
