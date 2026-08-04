import { ChevronRight, Loader2, PartyPopper, Send, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import { citizenButton } from '@/components/citizen/citizenButton';
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
        className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm"
        aria-label="Assistant de profilage APL"
      >
        <div className="flex gap-3">
          <PartyPopper className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <div>
            <p className="font-display text-sm font-bold text-ink">
              Profil de demande APL complété
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
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
      className="mb-8 overflow-hidden rounded-2xl border border-border/60 bg-brand-soft shadow-sm"
      aria-label="Assistant de profilage APL"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 border-b border-border/60 bg-card px-5 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-white">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <div className="flex-1">
          <p className="font-display text-sm font-bold text-ink">Assistant CAF</p>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
            <span className="size-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
            En ligne
          </p>
        </div>
        {questionActuelle && (
          <div
            className="h-1.5 w-24 overflow-hidden rounded-full bg-border"
            role="progressbar"
            aria-valuenow={nombreTours}
            aria-valuemin={0}
            aria-valuemax={limiteTours}
            aria-label="Progression du profilage"
          >
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${progression}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex gap-4 p-5 sm:p-6">
        <div className="min-w-0 flex-1">
          {questionActuelle ? (
            <>
              <p className="eyebrow">
                Question {nombreTours}/{limiteTours}
              </p>
              <h2 className="mt-1 font-display text-lg font-bold leading-snug text-ink">
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
                      className="flex min-h-11 w-full items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3 text-left text-sm text-ink transition-colors hover:border-brand/40 hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span>{option}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
              className="bg-card"
            />
            <button
              type="submit"
              aria-label="Envoyer votre réponse"
              disabled={isLoading || !saisie.trim() || !questionActuelle}
              className={citizenButton({ variant: 'primary', size: 'icon', className: 'shrink-0' })}
            >
              {isLoading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
            </button>
          </form>

          {erreur && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {erreur}
            </p>
          )}
          {messageAssistant && (
            <p role="status" className="mt-3 rounded-lg bg-card px-3 py-2 text-sm text-muted-foreground">
              {messageAssistant}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
