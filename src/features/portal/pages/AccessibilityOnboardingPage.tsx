import { ArrowRight, Info } from 'lucide-react';
import { Link } from 'react-router-dom';

import { APP_CONFIG } from '@/app/config/app';
import { ROUTES } from '@/app/router/paths';
import { ACCESSIBILITY_OPTIONS } from '@/features/profile/accessibilityOptions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUiStore } from '@/store/uiStore';

/**
 * Accessibility preferences are offered *before* the citizen enters the app —
 * a deliberate RGAA-friendly choice carried over from the mockups.
 */
export default function AccessibilityOnboardingPage() {
  useDocumentTitle('Préférences d’accessibilité');
  const accessibility = useUiStore((state) => state.accessibility);
  const setPreference = useUiStore((state) => state.setAccessibilityPreference);

  return (
    <div>
      <h1 className="mb-4 text-headline-lg-mobile text-primary md:text-display">
        Bienvenue sur votre espace
      </h1>
      <p className="mb-10 text-body-lg text-on-surface-variant">
        Pour vous offrir l’expérience la plus fluide et accessible, personnalisez vos préférences
        d’interface. Ces réglages peuvent être modifiés à tout moment.
      </p>

      <fieldset className="mb-10">
        <legend className="sr-only">Préférences d’accessibilité</legend>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {ACCESSIBILITY_OPTIONS.map((option) => (
            <div
              key={option.key}
              className="flex gap-4 rounded-xl border border-border bg-surface-lowest p-6"
            >
              <div className="flex-1">
                <label
                  htmlFor={`a11y-${option.key}`}
                  className="mb-2 flex cursor-pointer items-center gap-2 text-label-md text-on-surface"
                >
                  <option.icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
                  {option.label}
                </label>
                <p className="text-body-sm text-on-surface-variant">{option.description}</p>
              </div>
              <Checkbox
                id={`a11y-${option.key}`}
                checked={accessibility[option.key]}
                onCheckedChange={(checked) => setPreference(option.key, checked === true)}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col items-center justify-between gap-4 rounded-xl bg-primary-fixed/60 p-6 md:flex-row">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-lowest text-primary">
            <Info className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-label-md text-on-surface">Besoin d’aide ?</p>
            <p className="text-body-sm text-on-surface-variant">
              Appelez le {APP_CONFIG.supportPhone} (numéro gratuit).
            </p>
          </div>
        </div>

        <Button asChild size="lg">
          <Link to={ROUTES.portal}>
            Continuer vers mon espace
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
