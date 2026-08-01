import { Clock, MessageSquare } from 'lucide-react';

import { EmptyState } from '@/components/shared';
import { cn } from '@/lib/utils';
import type { ChatbotMessage } from '@/features/chatbot/types/chatbot';

/**
 * "Historique des conversations" for the merged chatbot widget.
 *
 * The backend keeps one continuous, session-less thread per citizen
 * (`chatbot_messages`, ordered only by `created_at` — see
 * `app/modules/chatbot/history.py`), not separate conversations. Rather than
 * fabricate a conversation/session concept the API does not have, this groups
 * the *real* persisted messages by calendar day: each day the citizen actually
 * talked to the assistant becomes one entry, titled from their first question
 * that day. Clicking an entry resumes the single thread scrolled back to that
 * day — an honest reflection of the real data model, not an invented one.
 */

export interface ConversationDayGroup {
  key: string;
  label: string;
  title: string;
  messageCount: number;
  /** id of the first message of the day — the scroll anchor to resume on. */
  firstMessageId: string;
}

function dateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function labelFor(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (dateKey(iso) === dateKey(today.toISOString())) return "Aujourd'hui";
  if (dateKey(iso) === dateKey(yesterday.toISOString())) return 'Hier';

  const formatted = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function truncate(text: string, max = 64): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed;
}

/** Groups a thread by calendar day, most recent day first. */
export function groupByDay(messages: ChatbotMessage[]): ConversationDayGroup[] {
  const groups = new Map<string, ChatbotMessage[]>();

  for (const message of messages) {
    const key = dateKey(message.createdAt);
    const bucket = groups.get(key);
    if (bucket) bucket.push(message);
    else groups.set(key, [message]);
  }

  return Array.from(groups.entries())
    .map(([key, groupMessages]) => {
      const firstUser = groupMessages.find((m) => m.role === 'user');
      return {
        key,
        label: labelFor(groupMessages[0].createdAt),
        title: firstUser ? truncate(firstUser.content) : 'Conversation',
        messageCount: groupMessages.length,
        firstMessageId: groupMessages[0].id,
      };
    })
    .reverse();
}

export interface ConversationHistoryProps {
  messages: ChatbotMessage[];
  onResume: (firstMessageId: string) => void;
}

export function ConversationHistory({ messages, onResume }: ConversationHistoryProps) {
  const groups = groupByDay(messages);

  if (groups.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <EmptyState
          icon={Clock}
          title="Aucun historique"
          description="Vos échanges avec l’assistant apparaîtront ici, classés par jour."
          size="compact"
        />
      </div>
    );
  }

  return (
    <ul className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-2" aria-label="Historique des conversations">
      {groups.map((group) => (
        <li key={group.key}>
          <button
            type="button"
            onClick={() => onResume(group.firstMessageId)}
            className={cn(
              'flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors',
              'hover:bg-surface-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai',
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-label-sm font-medium text-on-surface">{group.label}</span>
              <span className="flex items-center gap-1 text-body-sm text-on-surface-variant">
                <MessageSquare className="size-3.5" aria-hidden="true" />
                {group.messageCount}
              </span>
            </span>
            <span className="truncate text-body-sm text-on-surface-variant">{group.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
