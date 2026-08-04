import { AlertTriangle, Mail, Share2, Sparkles } from 'lucide-react';

import { CitizenPageHeader } from '@/components/citizen/CitizenPageHeader';
import { CitizenSettingRow } from '@/components/citizen/CitizenSettingRow';
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
    <div className="mx-auto max-w-3xl">
      <CitizenPageHeader title="Paramètres" description="Gérez vos préférences et vos consentements." />

      {error && (
        <div className="mb-8 flex items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-soft">
        <div className="divide-y divide-border/60">
          {isLoading || !settings ? (
            <SettingsSkeleton />
          ) : (
            <>
              <CitizenSettingRow
                icon={Mail}
                label="Notifications par e-mail"
                description="Recevez une copie par e-mail des évènements concernant vos dossiers."
                checked={settings.emailNotifications}
                onCheckedChange={(v) => setToggle('emailNotifications', v)}
                disabled={savingKey === 'emailNotifications'}
              />
              <CitizenSettingRow
                icon={Sparkles}
                label="Assistant IA"
                description="Affichez l’assistant qui vous guide dans votre profil et vos démarches."
                checked={settings.aiAssistance}
                onCheckedChange={(v) => setToggle('aiAssistance', v)}
                disabled={savingKey === 'aiAssistance'}
              />
              <CitizenSettingRow
                icon={Share2}
                label="Partage entre administrations"
                description="Autorisez le partage des informations que vous déclarez avec les administrations concernées, pour éviter de les ressaisir."
                checked={settings.crossAdministrationSharing}
                onCheckedChange={(v) => setToggle('crossAdministrationSharing', v)}
                disabled={savingKey === 'crossAdministrationSharing'}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-start justify-between gap-4 px-6 py-5">
          <div className="flex flex-1 gap-3">
            <Skeleton className="size-9 rounded-lg" />
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
