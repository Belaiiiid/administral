import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

import { AGENT_ROUTES, relativeTo } from '@/features/agent/paths';

/*
 * Every page is code-split, so the Agent Portal contributes nothing to the
 * citizen initial bundle — only this route table, which is metadata.
 */
const AgentDashboardPage = lazy(() => import('@/features/agent/dashboard/pages/AgentDashboardPage'));
const CaseListPage = lazy(() => import('@/features/agent/cases/pages/CaseListPage'));
const CaseDetailPage = lazy(() => import('@/features/agent/cases/pages/CaseDetailPage'));
const DocumentReviewPage = lazy(
  () => import('@/features/agent/documents/pages/DocumentReviewPage'),
);
const ValidationQueuePage = lazy(
  () => import('@/features/agent/validation/pages/ValidationQueuePage'),
);
const ValidationDetailPage = lazy(
  () => import('@/features/agent/validation/pages/ValidationDetailPage'),
);
const ReportsPage = lazy(() => import('@/features/agent/reports/pages/ReportsPage'));
const AgentAssistantPage = lazy(() => import('@/features/agent/assistant/pages/AgentAssistantPage'));
const AgentSettingsPage = lazy(() => import('@/features/agent/settings/pages/AgentSettingsPage'));

/**
 * The Agent Portal's own route table.
 *
 * The host mounts this as the children of `ROUTES.agent`, so paths are declared
 * relative to `/agent` — `relativeTo()` derives them from the same absolute
 * constants the navigation rail links to, keeping one source of truth.
 */
export const agentRoutes: RouteObject[] = [
  { index: true, element: <AgentDashboardPage /> },

  { path: relativeTo(AGENT_ROUTES.cases), element: <CaseListPage /> },
  { path: relativeTo(AGENT_ROUTES.caseDetail()), element: <CaseDetailPage /> },

  { path: relativeTo(AGENT_ROUTES.documents), element: <DocumentReviewPage /> },

  { path: relativeTo(AGENT_ROUTES.validation), element: <ValidationQueuePage /> },
  { path: relativeTo(AGENT_ROUTES.validationDetail()), element: <ValidationDetailPage /> },

  { path: relativeTo(AGENT_ROUTES.reports), element: <ReportsPage /> },
  { path: relativeTo(AGENT_ROUTES.assistant), element: <AgentAssistantPage /> },
  { path: relativeTo(AGENT_ROUTES.settings), element: <AgentSettingsPage /> },
];
