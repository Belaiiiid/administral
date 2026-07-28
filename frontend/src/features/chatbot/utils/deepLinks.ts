import { ROUTES } from '@/app/router/paths';

/**
 * A suggested in-app destination derived from what the citizen asked.
 *
 * This is a *navigation* aid layered on top of the assistant, not a change to how
 * it answers: the RAG pipeline still composes the reply from its sources
 * untouched. Here we only read the citizen's question and, when it clearly points
 * at a place in the app, offer a button to go there — so "où déposer mes
 * documents ?" gets an answer *and* a shortcut, rather than an answer alone.
 */
export interface DeepLinkSuggestion {
  label: string;
  to: string;
}

interface Rule {
  /** Matched case-insensitively against the citizen's message. */
  pattern: RegExp;
  suggestion: DeepLinkSuggestion;
}

// Order matters: the first matching rule wins, so the more specific intents
// (documents, profile) are listed before the broad dossier catch-all.
const RULES: Rule[] = [
  {
    pattern: /d[ée]pos|t[ée]l[ée]vers|upload|pi[èe]ce|justificatif|document/i,
    suggestion: { label: 'Déposer mes documents', to: ROUTES.documentsUpload },
  },
  {
    pattern: /profil|mes informations|date de naissance|s[ée]curit[ée] sociale|mon nom|mon adresse/i,
    suggestion: { label: 'Modifier mon profil', to: ROUTES.profile },
  },
  {
    pattern: /notification|alerte/i,
    suggestion: { label: 'Voir mes notifications', to: ROUTES.portalNotifications },
  },
  {
    pattern: /param[èe]tre|r[ée]glage|pr[ée]f[ée]rence|confidentialit[ée]|consentement/i,
    suggestion: { label: 'Ouvrir les paramètres', to: ROUTES.settings },
  },
  {
    pattern: /dossier|statut|suivi|avancement|instruction|o[ùu] en est|d[ée]cision|demande/i,
    suggestion: { label: 'Voir mon dossier', to: ROUTES.documentsUpload },
  },
];

/**
 * The first destination the message points at, or `null` when it is a purely
 * informational question (which stays in the conversation).
 */
export function detectDeepLink(message: string | undefined | null): DeepLinkSuggestion | null {
  if (!message) return null;
  for (const rule of RULES) {
    if (rule.pattern.test(message)) return rule.suggestion;
  }
  return null;
}
