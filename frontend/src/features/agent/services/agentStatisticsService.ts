import { apiClient } from '@/services/apiClient';
import type { AdministrationId } from '@/types';

/**
 * Case volume for one administration.
 *
 * `serviceId` is the administration the case targets. It is typed loosely as
 * `string` rather than `AdministrationId`: the value comes off the case row,
 * and a service added server-side must widen a chart, never break the page.
 */
export interface ServiceBreakdown {
  serviceId: string;
  label: string;
  count: number;
}

/** Submissions in one calendar month, keyed `YYYY-MM`. */
export interface MonthlyVolume {
  month: string;
  count: number;
}

/** Case counts per lifecycle status. Every status present, zero included. */
export interface CaseStatusBreakdown {
  submitted: number;
  awaitingDocuments: number;
  underReview: number;
  readyForDecision: number;
  validated: number;
  rejected: number;
}

/**
 * Service-level indicators for the statistics page.
 *
 * The three averages are nullable and must be rendered as "—", never as `0`:
 * `null` means nothing has been decided / checked / scored yet, which is a
 * different statement from an average of zero.
 */
export interface AgentStatistics {
  citizensTotal: number;
  citizensWithCases: number;
  casesTotal: number;
  byStatus: CaseStatusBreakdown;
  byService: ServiceBreakdown[];
  monthlySubmissions: MonthlyVolume[];
  averageProcessingDays: number | null;
  averageCompletionRate: number | null;
  averageScore: number | null;
}

/**
 * Agent-side statistics contract.
 *
 * Read-only by construction: there is no write method and there must not be
 * one. Every figure is an aggregate computed server-side — the UI never counts
 * rows itself, because `/agent/cases` is filtered and will be paginated, so a
 * client-side tally would describe the current page rather than the service.
 */
export interface AgentStatisticsService {
  /** Pilot indicators. Endpoint: `GET /agent/stats/overview`. */
  getOverview(): Promise<AgentStatistics>;
}

export const httpAgentStatisticsService: AgentStatisticsService = {
  getOverview: () => apiClient.get<AgentStatistics>('/agent/stats/overview'),
};

/**
 * The administrations the portal covers, in the order the statistics page
 * lists them.
 *
 * Declared here rather than derived from the response: an administration with
 * no case yet is absent from the aggregate, and the page must still show it —
 * "Impôts: 0" is a fact about the service, while a missing row reads as an
 * oversight. `planned` marks the ones not yet integrated.
 */
export const STATISTICS_SERVICES: ReadonlyArray<{
  id: AdministrationId;
  label: string;
  planned?: boolean;
}> = [
  { id: 'caf', label: 'CAF' },
  { id: 'france-travail', label: 'France Travail' },
  { id: 'assurance-maladie', label: 'Assurance Maladie' },
  { id: 'impots', label: 'Impôts', planned: true },
];
