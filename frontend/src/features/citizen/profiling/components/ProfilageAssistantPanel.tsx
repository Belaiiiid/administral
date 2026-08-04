import { ChevronRight, Loader2, PartyPopper, Send, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProfilageStore } from '@/features/citizen/profiling/store/profilageStore';

/**
 * Panneau de conversation ancré à la page Profil.
 *
 * Il ne possède aucun scénario local : question, compteur, suggestions et
 * profil rempli proviennent tous du tour A3 conservé dans le store.
 */
export function ProfilageAssistantPanel() {
  const {
    questionActuelle,
    nombreTours,
    limiteTours,
    profilComplet,
    isLoading,
    erreur,
    messageAssistant,
    demarrer,
    repondre,
  } = useProfilageStore();
  const [saisie, setSaisie] = useState('');

  useEffect(() => {
    void demarrer();
  }, [demarrer]);

  const envoyer = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const valeur = saisie.trim();
    if (!valeur || isLoading || profilComplet) return;
    setSaisie('');
    void repondre(valeur);
  };

  const choisir = (valeur: string) => {
    if (!isLoading && !profilComplet) void repondre(valeur);
  };

  if (profilComplet) {
    return (
      <section
        className="mb-8 rounded-xl border border-success/30 border-l-4 border-l-success bg-success-surface p-5 shadow-soft"
        aria-label="Assistant de profilage APL"
      >
        <div className="flex gap-3">
          <PartyPopper className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          <div>
            <p className="text-label-md text-on-surface">Profil de demande APL complété</p>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              Vos réponses ont été ajoutées à votre profil.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const progression = limiteTours > 0 ? Math.min(100, (nombreTours / limiteTours) * 100) : 0;

  return (
    <section
      className="mb-8 overflow-hidden rounded-2xl border border-ai/15 bg-ai-surface shadow-soft"
      aria-label="Assistant de profilage APL"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 border-b border-ai/10 bg-surface-lowest px-5 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ai text-primary-foreground">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <div className="flex-1">
          <p className="text-label-md text-on-surface">Assistant CAF</p>
          <p className="flex items-center gap-1.5 text-label-sm text-success">
            <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
            En ligne
          </p>
        </div>
        {questionActuelle && (
          <div
            className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-container"
            role="progressbar"
            aria-valuenow={nombreTours}
            aria-valuemin={0}
            aria-valuemax={limiteTours}
            aria-label="Progression du profilage"
          >
            <div
              className="h-full rounded-full bg-ai transition-all"
              style={{ width: `${progression}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex gap-4 p-5 sm:p-6">
        <div className="min-w-0 flex-1">
          {questionActuelle ? (
            <>
              <p className="text-label-sm uppercase tracking-wider text-ai">
                Question {nombreTours}/{limiteTours}
              </p>
              <h2 className="mt-1 text-headline-md text-on-surface">
                {questionActuelle.question}
              </h2>

              {questionActuelle.options && questionActuelle.options.length > 0 && (
                <div className="mt-4 flex flex-col gap-2" role="group" aria-label="Réponses suggérées">
                  {questionActuelle.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      disabled={isLoading}
                      onClick={() => choisir(option)}
                      className="flex min-h-11 w-full items-center justify-between rounded-xl border border-border bg-surface-lowest px-4 py-3 text-left text-body-sm text-on-surface transition-colors hover:border-ai hover:bg-primary-fixed disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span>{option}</span>
                      <ChevronRight className="size-4 shrink-0 text-on-surface-variant" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-body-sm text-on-surface-variant">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Préparation de votre parcours personnalisé…
            </div>
          )}

          <form className="mt-4 flex gap-2" onSubmit={envoyer}>
            <label htmlFor="profile-assistant-answer" className="sr-only">
              Répondre avec vos propres mots
            </label>
            <Input
              id="profile-assistant-answer"
              value={saisie}
              onChange={(event) => setSaisie(event.target.value)}
              disabled={isLoading || !questionActuelle}
              placeholder="Ou répondez avec vos propres mots…"
              className="bg-surface-lowest"
            />
            <Button
              type="submit"
              size="icon"
              aria-label="Envoyer votre réponse"
              disabled={isLoading || !saisie.trim() || !questionActuelle}
              className="shrink-0 bg-ai hover:bg-ai/90"
            >
              {isLoading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
            </Button>
          </form>

          {erreur && (
            <p role="alert" className="mt-3 text-body-sm text-destructive">
              {erreur}
            </p>
          )}
          {messageAssistant && (
            <p role="status" className="mt-3 rounded-lg bg-surface-lowest px-3 py-2 text-body-sm text-on-surface-variant">
              {messageAssistant}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
