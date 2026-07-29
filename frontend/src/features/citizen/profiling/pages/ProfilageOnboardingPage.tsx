import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ProfilageAssistantPanel } from '@/features/citizen/profiling/components/ProfilageAssistantPanel';
import {
  citizenProfileService,
  profilingAnswersToPayload,
} from '@/features/citizen/profiling/services/citizenProfileService';
import { useProfilageStore } from '@/features/citizen/profiling/store/profilageStore';

/**
 * Signup-first profiling — the guided step a new citizen lands on straight after
 * registration, before the dashboard.
 *
 * Soft gate: the assistant runs to completion, then "Continuer" persists the
 * answers and opens the dashboard. "Compléter plus tard" is always available and
 * saves whatever has been answered so far — nothing the citizen typed is lost,
 * and they can finish from their profile page. Existing accounts are never
 * forced here; this page is only the post-registration destination.
 *
 * The assistant's answers live in the in-memory session store until this point;
 * saving here is what first commits them to the citizen's `citizens` row.
 *
 * Reached from two places now: straight after registration (no `from` state,
 * so "Continuer" opens the hub), or from `RequireApplProfile` when a citizen
 * opens a service that needs profiling first (`from` set to that service, so
 * "Continuer" returns them there instead of back to the hub they already left).
 */
export default function ProfilageOnboardingPage() {
  useDocumentTitle('Personnalisons votre parcours');
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;

  const profilPartiel = useProfilageStore((state) => state.profilPartiel);
  const profilComplet = useProfilageStore((state) => state.profilComplet);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const goToDashboard = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const payload = profilingAnswersToPayload(profilPartiel);
      if (Object.keys(payload).length > 0) {
        await citizenProfileService.mettreAJour(payload);
      }
      navigate(from ?? ROUTES.portal, { replace: true });
    } catch (cause) {
      // Persistence failed (e.g. the API is down). Rather than trap the citizen
      // on the onboarding step, surface the error and let them proceed — their
      // answers remain in the session and can be saved later from the profile.
      setSaveError(
        cause instanceof Error
          ? `Vos réponses n’ont pas pu être enregistrées (${cause.message}). Vous pourrez les sauvegarder depuis votre profil.`
          : 'Vos réponses n’ont pas pu être enregistrées. Vous pourrez les sauvegarder depuis votre profil.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <span className="mb-6 inline-flex items-center gap-2 rounded-full bg-ai-surface px-3 py-1 text-label-sm text-ai">
        <Sparkles className="size-4" aria-hidden="true" />
        Étape de personnalisation
      </span>
      <h1 className="mb-4 text-headline-lg-mobile text-primary md:text-display">
        Personnalisons votre parcours
      </h1>
      <p className="mb-10 text-body-lg text-on-surface-variant">
        Quelques questions suffisent à cerner votre situation et à préparer votre demande d’aide au
        logement. Répondez avec vos propres mots ou choisissez une réponse proposée — vous pourrez
        tout modifier plus tard.
      </p>

      <ProfilageAssistantPanel />

      {saveError && (
        <p role="alert" className="mb-6 rounded-lg bg-destructive-surface px-4 py-3 text-body-sm text-destructive">
          {saveError}
        </p>
      )}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={goToDashboard}
          disabled={isSaving}
        >
          Compléter plus tard
        </Button>

        <Button type="button" size="lg" onClick={goToDashboard} disabled={isSaving || !profilComplet}>
          {isSaving ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Enregistrement…
            </>
          ) : (
            <>
              Continuer vers mon espace
              <ArrowRight aria-hidden="true" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
