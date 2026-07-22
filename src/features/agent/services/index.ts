import { mockAgentCaseService } from '@/features/agent/data/mockAgentCaseService';
import { mockDecisionService } from '@/features/agent/data/mockDecisionService';

import type { AgentCaseService } from './agentCaseService';
import type { AgentDecisionService } from './agentDecisionService';

export type { AgentCaseService, CaseQuery } from './agentCaseService';
export { httpAgentCaseService } from './agentCaseService';
export type { AgentDecisionService } from './agentDecisionService';
export { httpDecisionService, MissingEvidenceError } from './agentDecisionService';

/*
 * `explanationService` is intentionally NOT re-exported here.
 *
 * It is the backend's internal seam — the slot a language model occupies — and
 * the frontend must not be able to reach it. Exporting it from the module every
 * hook imports would make "a component called the explanation generator
 * directly" a one-line mistake instead of an impossible one.
 */

/**
 * The binding every hook imports — and the *only* line that changes when the
 * backend lands.
 *
 * ┌─ today ────────────────────────────────────────────────────────────────┐
 * │  hooks → agentCaseService → mockAgentCaseService → fixtures.ts         │
 * ├─ when the API exists ──────────────────────────────────────────────────┤
 * │  hooks → agentCaseService → httpAgentCaseService → apiClient → REST    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * To cut over: change the right-hand side to `httpAgentCaseService`, implement
 * `apiClient.request()`, then delete `data/`. No page, component or hook is
 * modified — that is the property this indirection exists to guarantee.
 */
export const agentCaseService: AgentCaseService = mockAgentCaseService;

/** Same swap contract as above: replace with `httpDecisionService` at cutover. */
export const agentDecisionService: AgentDecisionService = mockDecisionService;
