import { Bot, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useUiStore } from '@/store/uiStore';

/**
 * Floating assistant bubble + panel, as seen on the guided declaration flow.
 * Presentation only — messaging is handled by the chatbot module.
 */
export function AssistantWidget() {
  const isOpen = useUiStore((state) => state.isAssistantOpen);
  const toggle = useUiStore((state) => state.toggleAssistant);

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-4">
      {isOpen && (
        <div
          role="complementary"
          aria-label="Assistant"
          className="w-[min(360px,calc(100vw-3rem))] overflow-hidden rounded-xl border border-border bg-surface-lowest shadow-soft"
        >
          <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
            <span className="flex items-center gap-2 text-label-md">
              <Bot className="size-5" aria-hidden="true" />
              Assistant
            </span>
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="size-2 rounded-full bg-success" />
              <span className="sr-only">En ligne</span>
            </span>
          </div>

          <div className="p-4">
            <div className="rounded-lg border-l-4 border-l-ai bg-ai-surface p-4">
              <p className="text-body-sm text-on-surface">
                L’assistant vous accompagnera pendant votre démarche dès qu’il sera disponible.
              </p>
            </div>
          </div>
        </div>
      )}

      <Button
        size="icon"
        className="size-14 rounded-full shadow-soft"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Fermer l’assistant' : 'Ouvrir l’assistant'}
      >
        {isOpen ? <X aria-hidden="true" /> : <Bot aria-hidden="true" />}
      </Button>
    </div>
  );
}
