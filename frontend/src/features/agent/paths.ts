/**
 * Agent Portal route table.
 *
 * Every path derives from a single `BASE` constant so the whole portal can be
 * remounted under a different prefix — or extracted into a standalone app where
 * `BASE` becomes `''` — without touching a single page.
 *
 * The host mounts this tree at `ROUTES.agent`; keep the two in sync.
 */
const BASE = '/agent';

export const AGENT_ROUTES = {
  root: BASE,
  cases: `${BASE}/dossiers`,
  caseDetail: (id = ':caseId') => `${BASE}/dossiers/${id}`,
  documents: `${BASE}/pieces`,
  validation: `${BASE}/validation`,
  validationDetail: (id = ':caseId') => `${BASE}/validation/${id}`,
  reports: `${BASE}/statistiques`,
  assistant: `${BASE}/assistant`,
  settings: `${BASE}/parametres`,
} as const;

/** True when a pathname belongs to the Agent Portal. Used to pick the rail. */
export const isAgentPath = (pathname: string) =>
  pathname === BASE || pathname.startsWith(`${BASE}/`);

/**
 * Route paths as declared to react-router. The router mounts `agentRoutes`
 * under `ROUTES.agent`, so children must be relative to it.
 */
export const relativeTo = (absolutePath: string) =>
  absolutePath.slice(BASE.length).replace(/^\//, '');
