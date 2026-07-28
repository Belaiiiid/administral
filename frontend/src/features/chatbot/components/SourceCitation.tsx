import { BookOpen, FileText, Scale, HelpCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { ChatbotSource, ChatbotSourceCategory } from '@/features/chatbot/types/chatbot';

/**
 * The documents an answer was drawn from.
 *
 * Shown on every grounded answer, not folded behind a disclosure. An assistant
 * answering questions about someone's benefits has to be checkable: the citizen
 * must be able to see what the answer rests on and go read it. Hiding the
 * citations makes the assistant sound more authoritative than it is.
 */

const CATEGORY_LABEL: Record<ChatbotSourceCategory, string> = {
  demarche: 'Démarche',
  reglementation: 'Réglementation',
  document: 'Document',
  faq: 'Question fréquente',
};

const CATEGORY_ICON: Record<ChatbotSourceCategory, LucideIcon> = {
  demarche: BookOpen,
  reglementation: Scale,
  document: FileText,
  faq: HelpCircle,
};

export interface SourceCitationProps {
  sources: ChatbotSource[];
}

export function SourceCitation({ sources }: SourceCitationProps) {
  // An ungrounded answer renders nothing rather than an empty "Sources" heading.
  if (sources.length === 0) return null;

  return (
    <div className="w-full rounded-lg border border-border bg-surface-low p-3">
      <p className="mb-2 text-label-sm uppercase tracking-wider text-on-surface-variant">
        {sources.length > 1 ? 'Sources' : 'Source'}
      </p>

      <ul className="flex flex-col gap-2">
        {sources.map((source) => {
          const Icon = CATEGORY_ICON[source.category];

          return (
            <li key={`${source.category}-${source.title}`} className="flex items-start gap-2">
              <Icon className="mt-0.5 size-4 shrink-0 text-on-surface-variant" aria-hidden="true" />
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-body-sm text-on-surface">{source.title}</span>
                <Badge tone="neutral">{CATEGORY_LABEL[source.category]}</Badge>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
