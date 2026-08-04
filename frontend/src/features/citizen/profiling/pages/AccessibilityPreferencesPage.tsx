import { APP_CONFIG } from '@/app/config/app';
import { CitizenAlert } from '@/components/citizen/CitizenAlert';
import { CitizenPageHeader } from '@/components/citizen/CitizenPageHeader';
import { ACCESSIBILITY_OPTIONS } from '@/features/citizen/profiling/utils/accessibilityOptions';
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
    <div className="mx-auto max-w-4xl">
      <CitizenPageHeader
        eyebrow="Confort de lecture"
        title="Préférences d’accessibilité"
        description="Personnalisez l’interface selon vos besoins. Ces réglages sont conservés sur cet appareil."
      />

      <CitizenAlert tone="info" title="Déclaration de conformité" className="mb-8">
        {APP_CONFIG.accessibilityStatement} au référentiel RGAA. Pour toute difficulté d’accès,
        appelez le {APP_CONFIG.supportPhone} (numéro gratuit).
      </CitizenAlert>

      <fieldset>
        <legend className="sr-only">Préférences d’accessibilité</legend>

        <div className="grid gap-5 md:grid-cols-2">
          {ACCESSIBILITY_OPTIONS.map((option) => {
            const id = `a11y-pref-${option.key}`;
            return (
              <div
                key={option.key}
                className="flex items-start justify-between gap-4 rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition-all duration-300 hover:border-brand/30 hover:shadow-lg"
              >
                <div className="min-w-0 flex-1">
                  <label htmlFor={id} className="flex cursor-pointer items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                      <option.icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="font-display text-sm font-bold text-ink">{option.label}</span>
                  </label>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {option.description}
                  </p>
                  {!option.affectsRendering && (
                    <p className="mt-2 inline-flex rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                      Disponible prochainement
                    </p>
                  )}
                </div>
                <Switch
                  id={id}
                  checked={accessibility[option.key]}
                  onCheckedChange={(checked) => setPreference(option.key, checked)}
                  className="data-[state=checked]:bg-brand data-[state=unchecked]:bg-border"
                />
              </div>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
