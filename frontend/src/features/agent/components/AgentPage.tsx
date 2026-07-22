import * as React from 'react';

import { PageHeader } from '@/components/shared';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ProvisionalNotice } from '@/features/agent/components/ProvisionalNotice';

export interface AgentPageProps {
  title: string;
  description?: string;
  /** Appended to the title in the browser tab. Defaults to `title`. */
  documentTitle?: string;
  actions?: React.ReactNode;
  /** Set `false` once a validated design exists for this screen. */
  provisional?: boolean;
  children: React.ReactNode;
}

/**
 * Layout composition for every Agent Portal page.
 *
 * Deliberately thin: it is not a second application shell. <AppShell /> still
 * provides the rail, header and footer — this only applies the page container,
 * the <h1> block and the provisional-design notice, so those three never drift
 * between agent screens.
 */
export function AgentPage({
  title,
  description,
  documentTitle,
  actions,
  provisional = true,
  children,
}: AgentPageProps) {
  useDocumentTitle(documentTitle ?? title);

  return (
    <div className="mx-auto max-w-container">
      <PageHeader title={title} description={description} actions={actions} />
      {provisional && <ProvisionalNotice />}
      {children}
    </div>
  );
}
