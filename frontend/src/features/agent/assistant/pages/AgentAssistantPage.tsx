import { BookOpen, FileSearch, Scale, SendHorizonal } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { AgentPage } from '@/features/agent/components';

/**
 * Conversation starters offered on the welcome panel.
 *
 * Phrased as the two jobs this assistant exists for — regulatory lookup and
 * case summarisation — rather than as generic chat prompts: an instructing
 * agent arrives with a file open, not with a blank question.
 */
const SUGGESTIONS = [
  {
    icon: Scale,
    label: 'Rechercher un texte réglementaire',
    detail: 'Article, barème ou condition d’éligibilité applicable à un dossier.',
  },
  {
    icon: FileSearch,
    label: 'Synthétiser un dossier',
    detail: 'Résumé des pièces, incohérences relevées et points d’attention.',
  },
  {
    icon: BookOpen,
    label: 'Expliquer une décision',
    detail: 'Formuler la motivation d’un refus ou d’une validation.',
  },
];

/**
 * Agent-facing assistant — regulatory lookup and case summarisation.
 *
 * Distinct from the citizen `features/chatbot`: different corpus, different
 * tone, different permissions. Sharing the chat transport later is a service
 * concern; the two UIs stay separate.
 *
 * The composer is rendered but inert: no agent conversational service is
 * bound yet (`features/agent/services` has no chat client). It is shown
 * disabled, with the reason stated, rather than hidden — the agent sees the
 * shape of the tool and why it cannot be used, and wiring a service later is
 * a change of handler, not a change of layout.
 */
export default function AgentAssistantPage() {
  return (
    <AgentPage
      title="Assistant IA"
      description="Recherche réglementaire et synthèse de dossiers."
    >
      <Card className="overflow-hidden">
        {/* Chat header: the assistant's identity, carried by the Mistral "M"
            mark the platform uses for all its AI surfaces
            (see components/layout/PartnerLogos). */}
        <div className="flex items-center gap-3 border-b border-border bg-surface-lowest px-6 py-4">
          <img
            src="/mistral-logo.svg"
            alt=""
            aria-hidden="true"
            className="size-9 shrink-0 object-contain"
          />
          <div className="min-w-0">
            <p className="text-label-md text-on-surface">Assistant d’instruction</p>
            <p className="text-label-sm text-on-surface-variant">
              Propulsé par Mistral AI — corpus réglementaire CAF
            </p>
          </div>
        </div>

        <CardContent className="px-0">
          {/* Welcome panel — stands in for the transcript until a service is
              bound, and remains the empty state once one is. */}
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <img
              src="/mistral-logo.svg"
              alt="Assistant Mistral AI"
              className="mb-5 size-24 object-contain"
            />
            <h2 className="text-headline-md text-on-surface">Comment puis-je vous assister ?</h2>
            <p className="mt-2 max-w-prose text-body-sm text-on-surface-variant">
              Posez une question réglementaire ou demandez la synthèse d’un dossier en cours
              d’instruction. Les réponses citent les articles sur lesquels elles s’appuient.
            </p>

            <ul className="mt-8 grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
              {SUGGESTIONS.map((suggestion) => (
                <li key={suggestion.label}>
                  {/* Not buttons: with no service bound there is nothing to
                      send. They document the assistant's scope instead of
                      offering an action that cannot run. */}
                  <div className="h-full border border-border bg-surface-lowest p-4">
                    <suggestion.icon
                      className="mb-3 size-5 text-primary"
                      aria-hidden="true"
                    />
                    <p className="text-label-md text-on-surface">{suggestion.label}</p>
                    <p className="mt-1 text-label-sm text-on-surface-variant">
                      {suggestion.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-border px-6 py-4">
            <Alert tone="info" className="mb-4">
              <AlertTitle>Assistant non connecté</AlertTitle>
              <AlertDescription>
                Aucun service conversationnel agent n’est encore branché. La saisie est
                désactivée tant que ce service n’est pas disponible.
              </AlertDescription>
            </Alert>

            <div className="flex items-end gap-3">
              <Textarea
                rows={2}
                disabled
                aria-label="Votre question à l’assistant"
                placeholder="Poser une question réglementaire ou demander une synthèse…"
                className="flex-1 resize-none"
              />
              <Button disabled aria-label="Envoyer la question">
                <SendHorizonal aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Envoyer</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </AgentPage>
  );
}
