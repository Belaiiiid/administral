import { BookOpen, Bot, FileUp, Mic, Paperclip, Send, ThumbsDown, ThumbsUp, User } from 'lucide-react';

import { EmptyState, SectionHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/types';

/**
 * Empty until `chatService.getConversation()` exists.
 * `MessageBubble` below stays as the rendering contract for real messages.
 */
const MESSAGES: ChatMessage[] = [];

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <li className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <span
        aria-hidden="true"
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          isUser ? 'bg-surface-container text-on-surface-variant' : 'bg-primary text-primary-foreground',
        )}
      >
        {isUser ? <User className="size-5" /> : <Bot className="size-5" />}
      </span>

      <div className={cn('flex max-w-[80%] flex-col gap-3', isUser && 'items-end')}>
        <div
          className={cn(
            'rounded-xl px-4 py-3 text-body-md',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'border border-border bg-surface-low text-on-surface',
          )}
        >
          <span className="sr-only">{isUser ? 'Vous : ' : 'Assistant : '}</span>
          {message.content}
        </div>

        {message.suggestions && (
          <ul className="flex flex-wrap gap-2">
            {message.suggestions.map((suggestion) => (
              <li key={suggestion}>
                <Button variant="outline" size="sm" className="rounded-full">
                  {suggestion}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {message.recommendation && (
          <div className="w-full rounded-lg border-l-4 border-l-ai bg-ai-surface p-4">
            <p className="mb-1 text-label-md text-ai">{message.recommendation.title}</p>
            <p className="mb-4 text-body-sm text-on-surface">{message.recommendation.body}</p>

            <div className="grid gap-3 sm:grid-cols-2">
              {message.recommendation.actions.map((action) => (
                <Button key={action.id} variant="outline" className="justify-center">
                  {action.icon === 'upload' ? (
                    <FileUp aria-hidden="true" />
                  ) : (
                    <BookOpen aria-hidden="true" />
                  )}
                  {action.label}
                </Button>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-ai/10 pt-3">
              <span className="text-label-sm italic text-on-surface-variant">Est-ce utile ?</span>
              <span className="flex gap-1">
                <Button variant="ghost" size="icon" className="size-9" aria-label="Réponse utile">
                  <ThumbsUp aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label="Réponse non utile"
                >
                  <ThumbsDown aria-hidden="true" />
                </Button>
              </span>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

/** Assistant interface placeholder — no model is called. */
export default function ChatPage() {
  useDocumentTitle('Assistant');

  return (
    <div className="mx-auto grid max-w-container gap-gutter lg:grid-cols-3">
      {/* Conversation */}
      <section className="flex flex-col lg:col-span-2" aria-label="Conversation avec l’assistant">
        <h1 className="sr-only">Assistant</h1>

        {MESSAGES.length > 0 ? (
          <ul className="flex flex-1 flex-col gap-6" aria-live="polite">
            {MESSAGES.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </ul>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={Bot}
              title="Aucune conversation"
              description="Posez une question pour démarrer un échange avec l’assistant."
            />
          </div>
        )}

        {/* Composer */}
        <div className="sticky bottom-0 mt-8 bg-background pt-4">
          <form
            className="flex items-end gap-2 rounded-xl border border-border bg-surface-lowest p-2"
            onSubmit={(event) => event.preventDefault()}
          >
            <Button type="button" variant="ghost" size="icon" aria-label="Joindre un fichier">
              <Paperclip aria-hidden="true" />
            </Button>

            <label htmlFor="chat-input" className="sr-only">
              Votre message
            </label>
            <Textarea
              id="chat-input"
              rows={1}
              placeholder="Posez votre question ici…"
              className="min-h-11 resize-none border-0 focus-visible:ring-0"
            />

            <Button type="button" variant="ghost" size="icon" aria-label="Saisie vocale">
              <Mic aria-hidden="true" />
            </Button>
            <Button type="submit" size="icon" aria-label="Envoyer le message">
              <Send aria-hidden="true" />
            </Button>
          </form>

          <p className="mt-2 text-center text-body-sm text-on-surface-variant">
            L’assistant peut faire des erreurs. Vérifiez les informations importantes.
          </p>
        </div>
      </section>

      {/* Context panel */}
      <aside className="flex flex-col gap-gutter">
        <Card>
          <CardContent className="p-6">
            <SectionHeader title="Statut actuel" as="h2" className="mb-4" />
            <p className="text-body-sm text-on-surface-variant">
              Aucun dossier en cours. Le contexte de votre demande s’affichera ici pour éclairer les
              réponses de l’assistant.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <SectionHeader title="Portail documentation" as="h2" className="mb-4" />
            <p className="text-body-sm text-on-surface-variant">
              Les ressources utiles à votre conversation apparaîtront ici.
            </p>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
