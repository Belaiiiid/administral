import { Info } from 'lucide-react';

import { APP_CONFIG } from '@/app/config/app';
import { PageHeader } from '@/components/shared';
import { ACCESSIBILITY_OPTIONS } from '@/features/profile/accessibilityOptions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUiStore } from '@/store/uiStore';

/**
 * Full accessibility preferences. Unlike most pages in this skeleton, these
 * toggles are functional — they drive the `a11y-*` classes on <html>.
 */
export default function AccessibilityPreferencesPage() {
  useDocumentTitle('Préférences d’accessibilité');
  const accessibility = useUiStore((state) => state.accessibility);
  const setPreference = useUiStore((state) => state.setAccessibilityPreference);

  return (
    <div className="mx-auto max-w-container">
      <PageHeader
        title="Préférences d’accessibilité"
        description="Personnalisez l’interface selon vos besoins. Ces réglages sont conservés sur cet appareil."
      />

      <Alert tone="info" className="mb-8">
        <Info aria-hidden="true" />
        <div>
          <AlertTitle>Déclaration de conformité</AlertTitle>
          <AlertDescription>
            {APP_CONFIG.accessibilityStatement} au référentiel RGAA. Pour toute difficulté d’accès,
            appelez le {APP_CONFIG.supportPhone} (numéro gratuit).
          </AlertDescription>
        </div>
      </Alert>

      <fieldset>
        <legend className="sr-only">Préférences d’accessibilité</legend>

        <div className="grid gap-4 md:grid-cols-2">
          {ACCESSIBILITY_OPTIONS.map((option) => (
            <Card key={option.key}>
              <CardContent className="flex items-start justify-between gap-4 p-6">
                <div className="flex-1">
                  <Label
                    htmlFor={`a11y-pref-${option.key}`}
                    className="mb-2 flex cursor-pointer items-center gap-2"
                  >
                    <option.icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
                    {option.label}
                  </Label>
                  <p className="text-body-sm text-on-surface-variant">{option.description}</p>
                  {!option.affectsRendering && (
                    <p className="mt-2 text-label-sm text-on-surface-variant">
                      Disponible prochainement
                    </p>
                  )}
                </div>
                <Switch
                  id={`a11y-pref-${option.key}`}
                  checked={accessibility[option.key]}
                  onCheckedChange={(checked) => setPreference(option.key, checked)}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
