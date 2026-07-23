import type { AgentCaseService } from './agentCaseService';
import type { AgentDecisionService } from './agentDecisionService';
import { httpAgentCaseService } from './agentCaseService';
import { httpDecisionService } from './agentDecisionService';

export type { AgentCaseService, CaseQuery } from './agentCaseService';
export { httpAgentCaseService } from './agentCaseService';
export type { AgentDecisionService } from './agentDecisionService';
export { httpDecisionService, MissingEvidenceError } from './agentDecisionService';

/**
 * The bindings every hook imports.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │  hooks → agentCaseService → httpAgentCaseService → apiClient → REST    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * The fixture adapters that used to sit here are gone: evidence extraction,
 * explanation generation and the case store all moved server-side, where they
 * belonged. No page, component or hook changed at cutover — which is the
 * property this indirection existed to guarantee, now demonstrated rather than
 * asserted.
 *
 * To point at a different backend, set `VITE_API_BASE_URL`. To stub one in a
 * test, assign a fake to these bindings; nothing else needs to know.
 */
export const agentCaseService: AgentCaseService = httpAgentCaseService;

export const agentDecisionService: AgentDecisionService = httpDecisionService;

/*
 * `explanationService` is intentionally NOT re-exported here — and now has no
 * frontend implementation at all. Composing a citizen-facing explanation is a
 * server responsibility, sitting between the decision endpoint and the model.
 * Exporting a route to it from the module every hook imports would make "a
 * component generated its own explanation" a one-line mistake instead of an
 * impossible one.
 */
