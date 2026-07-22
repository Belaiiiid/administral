import { BarChart3, Bot, FileCheck, FolderOpen, LayoutDashboard, Settings, ShieldCheck } from 'lucide-react';

import { type NavItem } from '@/app/config/nav-item';
import { AGENT_ROUTES } from '@/features/agent/paths';

/**
 * The back-office rail. Owned by the feature, consumed by the host's
 * `resolveNavSections()` — so extracting the portal takes its navigation with it.
 */
export const AGENT_NAV: NavItem[] = [
  {
    id: 'agent-dashboard',
    label: 'Supervision',
    to: AGENT_ROUTES.root,
    icon: LayoutDashboard,
    // Exact only: every other entry is a child of `/agent`.
    match: (pathname) => pathname === AGENT_ROUTES.root,
  },
  { id: 'agent-cases', label: 'Dossiers', to: AGENT_ROUTES.cases, icon: FolderOpen },
  { id: 'agent-documents', label: 'Pièces justificatives', to: AGENT_ROUTES.documents, icon: FileCheck },
  { id: 'agent-validation', label: 'Validation', to: AGENT_ROUTES.validation, icon: ShieldCheck },
  { id: 'agent-reports', label: 'Statistiques', to: AGENT_ROUTES.reports, icon: BarChart3 },
  { id: 'agent-assistant', label: 'Assistant IA', to: AGENT_ROUTES.assistant, icon: Bot },
];

export const AGENT_SECONDARY_NAV: NavItem[] = [
  { id: 'agent-settings', label: 'Paramètres', to: AGENT_ROUTES.settings, icon: Settings },
];
