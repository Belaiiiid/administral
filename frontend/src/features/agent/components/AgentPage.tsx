import * as React from 'react';

import { PageHeader } from '@/components/shared';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export interface AgentPageProps {
  title: string;
  description?: string;
  /** Appended to the title in the browser tab. Defaults to `title`. */
  documentTitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Layout composition for every Agent Portal page.
 *
 * Deliberately thin: it is not a second application shell. <AppShell /> still
 * provides the rail, header and footer — this only applies the page container
 * and the <h1> block, so the two never drift between agent screens.
 */
export function AgentPage({
  title,
  description,
  documentTitle,
  actions,
  children,
}: AgentPageProps) {
  useDocumentTitle(documentTitle ?? title);

  return (
    <div className="mx-auto max-w-container">
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </div>
  );
}
