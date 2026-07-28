import { Loader2, PartyPopper, Send, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useProfilageStore } from '@/features/citizen/profiling/store/profilageStore';

/**
 * Assistant de profilage APL — overlay plein écran, dans l'esprit de Claude :
 * - Il recouvre la page (mais l'utilisateur peut le fermer pour revenir au profil).
 * - Historique de la conversation qui défile.
 * - Boutons de propositions cliquables au-dessus du composeur (quand la question
 *   est à choix multiples).
 * - Composeur texte fixe en bas, TOUJOURS disponible, même quand des boutons
 *   de propositions sont affichés — l'utilisateur peut cliquer OU taper.
 */
export function ProfilageOverlay() {
  const {
    questionActuelle,
    profilComplet,
    isLoading,
    erreur,
    historique,
    estOuvert,
    derniereSource,
    fermer,
    demarrer,
    repondre,
  } = useProfilageStore();

  const [saisie, setSaisie] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void demarrer();
  }, [demarrer]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [historique.length, questionActuelle?.question, isLoading]);

  useEffect(() => {
    if (estOuvert && !isLoading && !profilComplet) {
      // Focus discret sur le composeur à l'ouverture / après réponse.
      textareaRef.current?.focus({ preventScroll: true });
    }
  }, [estOuvert, isLoading, profilComplet, questionActuelle?.question]);

  if (!estOuvert) return null;

  const handleEnvoyer = (event: React.FormEvent) => {
    event.preventDefault();
    const valeur = saisie.trim();
    if (!valeur || isLoading || profilComplet) return;
    setSaisie('');
    void repondre(valeur);
  };

  const handleChoix = (valeur: string) => {
    if (isLoading || profilComplet) return;
    void repondre(valeur);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-on-surface/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Assistant de profilage APL"
    >
      <div className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-surface-lowest shadow-soft sm:h-[min(720px,90vh)] sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-surface-low px-5 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-ai" aria-hidden="true" />
            <span className="text-label-md text-on-surface">Assistant APL</span>
            {derniereSource && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-label-sm',
                  derniereSource === 'llm'
                    ? 'bg-ai/10 text-ai'
                    : 'bg-surface-container text-on-surface-variant',
                )}
                title={
                  derniereSource === 'llm'
                    ? 'Réponse générée par Mistral'
                    : 'Réponse générée par les règles déterministes (Mistral non appelé)'
                }
              >
                {derniereSource === 'llm' ? 'Mistral' : 'Règles (sans Mistral)'}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Fermer l’assistant"
            onClick={fermer}
          >
            <X aria-hidden="true" />
          </Button>
        </div>

        {/* Zone conversation */}
        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div className="mx-auto flex max-w-2xl flex-col gap-6">
            {/* Historique */}
            {historique.map((entree, index) => (
              <div key={index} className="flex flex-col gap-3">
                <MessageAssistant contenu={entree.question} />
                <MessageCitoyen contenu={entree.reponse} />
              </div>
            ))}

            {/* Question courante */}
            {!profilComplet && questionActuelle?.question && (
              <MessageAssistant
                contenu={questionActuelle.question}
                regle={questionActuelle.regle_justifiant_la_question}
                enCours
              />
            )}

            {/* Loading avant première question */}
            {!questionActuelle && isLoading && (
              <p className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Connexion à l’assistant…
              </p>
            )}

            {/* Fin de conversation */}
            {profilComplet && (
              <div className="flex gap-3 rounded-lg border-l-4 border-l-success bg-surface-low p-4">
                <PartyPopper
                  className="mt-0.5 size-5 shrink-0 text-success"
                  aria-hidden="true"
                />
                <div>
                  <p className="mb-1 text-label-md text-on-surface">Profil complet</p>
                  <p className="text-body-sm text-on-surface-variant">
                    Vos réponses ont été ajoutées à votre profil. Vous pouvez fermer cette
                    fenêtre.
                  </p>
                </div>
              </div>
            )}

            {erreur && (
              <p
                role="alert"
                className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-body-sm text-error"
              >
                {erreur}
              </p>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Zone propositions + composeur */}
        {!profilComplet && (
          <div className="border-t border-border bg-surface-lowest px-5 pb-4 pt-3">
            <div className="mx-auto flex max-w-2xl flex-col gap-3">
              {/* Boutons de propositions */}
              {questionActuelle?.type_reponse === 'choix_multiple' &&
                questionActuelle.options && (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Propositions">
                    {questionActuelle.options.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => handleChoix(option)}
                        disabled={isLoading}
                        className="rounded-full border border-border bg-surface-lowest px-4 py-2 text-label-md text-on-surface transition-colors hover:border-primary hover:bg-primary-fixed disabled:pointer-events-none disabled:opacity-50"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}

              {/* Composeur texte — toujours visible */}
              <form
                className="flex items-end gap-2 rounded-2xl border border-border bg-surface-lowest px-3 py-2"
                onSubmit={handleEnvoyer}
              >
                <label htmlFor="overlay-composer" className="sr-only">
                  Répondre par écrit
                </label>
                <Textarea
                  id="overlay-composer"
                  ref={textareaRef}
                  rows={1}
                  value={saisie}
                  onChange={(event) => setSaisie(event.target.value)}
                  disabled={isLoading}
                  placeholder="Écrire une réponse…"
                  className="min-h-10 resize-none border-0 bg-transparent px-1 py-1 focus-visible:ring-0"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleEnvoyer(event);
                    }
                  }}
                />
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Envoyer"
                  disabled={isLoading || !saisie.trim()}
                  className="shrink-0"
                >
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send aria-hidden="true" />
                  )}
                </Button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageAssistant({
  contenu,
  regle,
  enCours = false,
}: {
  contenu: string;
  regle?: string | null;
  enCours?: boolean;
}) {
  return (
    <div className={cn('flex gap-3', enCours && 'animate-in fade-in slide-in-from-bottom-2')}>
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ai/10 text-ai"
      >
        <Sparkles className="size-4" />
      </span>
      <div>
        <p className="text-body-md text-on-surface">{contenu}</p>
        {regle && (
          <p className="mt-1 text-label-sm text-on-surface-variant">
            <span aria-hidden="true">↳ </span>
            {regle}
          </p>
        )}
      </div>
    </div>
  );
}

function MessageCitoyen({ contenu }: { contenu: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[75%] rounded-2xl bg-primary px-4 py-2 text-body-md text-primary-foreground">
        {contenu}
      </p>
    </div>
  );
}
