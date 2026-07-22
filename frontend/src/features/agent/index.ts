/**
 * Agent Portal — public API.
 *
 * This is the ONLY module the host application may import from. Everything
 * else under `features/agent/` is internal, which is what keeps the portal
 * extractable into a standalone app later (see
 * docs/agent-portal-implementation-plan.md §6).
 *
 * Conversely, the portal never imports from a sibling feature — only from
 * `components/`, `lib/`, `hooks/`, `types/common` and the two global stores.
 */
export { agentRoutes } from '@/features/agent/routes';
export { AGENT_NAV, AGENT_SECONDARY_NAV } from '@/features/agent/config/navigation';
export { AGENT_ROUTES, isAgentPath } from '@/features/agent/paths';
