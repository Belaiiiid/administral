import { TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import * as React from 'react';

import { EmptyState } from '@/components/shared';
import { Button } from '@/components/ui/button';
import type { AsyncResource } from '@/features/agent/hooks';

export interface AsyncBoundaryProps<T> {
  resource: AsyncResource<T>;
  /** Rendered while the request is in flight — usually a <Skeleton /> block. */
  fallback: React.ReactNode;
  /** Shown when the resolved value is empty. Omit if the value cannot be empty. */
  empty?: { icon: LucideIcon; title: string; description?: string; actions?: React.ReactNode };
  /** Treats a resolved value as empty. Defaults to "empty array". */
  isEmpty?: (data: T) => boolean;
  children: (data: T) => React.ReactNode;
}

const defaultIsEmpty = (data: unknown): boolean => Array.isArray(data) && data.length === 0;

/**
 * Renders the four states of an async read: loading, error, empty, loaded.
 *
 * Every agent screen needs all four, and hand-rolling them per page is how the
 * error case quietly goes missing on the third screen. Centralising them also
 * means the day `agentCaseService` starts making real network calls, failure is
 * already handled everywhere — the swap surfaces no new UI work.
 */
export function AsyncBoundary<T>({
  resource,
  fallback,
  empty,
  isEmpty = defaultIsEmpty,
  children,
}: AsyncBoundaryProps<T>) {
  const { data, error, isLoading } = resource;

  if (isLoading) {
    return (
      <div aria-busy="true" aria-live="polite">
        {fallback}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Chargement impossible"
        description={error.message}
        actions={
          <Button variant="outline" onClick={resource.reload}>
            Réessayer
          </Button>
        }
      />
    );
  }

  if (data === null) return null;

  if (empty && isEmpty(data)) {
    return (
      <EmptyState
        icon={empty.icon}
        title={empty.title}
        description={empty.description}
        actions={empty.actions}
      />
    );
  }

  return <>{children(data)}</>;
}
