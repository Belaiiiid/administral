import type { DecisionEvidence, DecisionOutcome } from '@/types';
import type {
  ExplanationService,
  GeneratedExplanation,
} from '@/features/agent/services/explanationService';

/**
 * Fixture-stage stand-in for the backend's explanation step.
 *
 * ## What it simulates
 *
 * The production flow is: backend extracts evidence → Mistral formulates →
 * message returned. This module occupies the middle slot with deterministic
 * templates instead of a model.
 *
 * ## Why templates are the right mock
 *
 * A template engine cannot invent, so it demonstrates the *guarantee* the real
 * integration must preserve rather than merely imitating its output shape. The
 * invariant it establishes and that Mistral must not weaken:
 *
 *   **every claim in `message` comes from an item in `evidenceUsed`**
 *
 * Here that holds structurally — the message is fixed template text with
 * evidence values concatenated verbatim, so there is no path by which an
 * unsupported sentence could appear. When a model replaces this, the invariant
 * stops being structural and becomes a prompt constraint that has to be tested:
 * the model is given the same closed evidence list and instructed to rephrase
 * it and nothing else. `evidenceUsed` is echoed unchanged either way, so the
 * message can always be checked against its justification.
 */

const LATENCY_MS = 420;

const delay = <T>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));

/** « a », « a et b », « a, b et c » — French list conjunction. */
const joinFrench = (parts: string[]): string => {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;
};

export const mockExplanationService: ExplanationService = {
  generateExplanation: (
    decision: DecisionOutcome,
    evidence: DecisionEvidence[],
  ): Promise<GeneratedExplanation> => {
    /*
     * Defence in depth. `mockDecisionService` already refuses an unsupported
     * rejection with a MissingEvidenceError, but the rule is restated at the
     * point of composition so no future caller can route around it and obtain
     * a rejection message with nothing behind it.
     */
    if (decision === 'rejected' && evidence.length === 0) {
      throw new Error(
        'Un rejet ne peut pas être expliqué sans élément justificatif issu du dossier.',
      );
    }

    const facts = evidence.map((item) => item.value);

    if (decision === 'rejected') {
      const citesDocuments = evidence.some((item) => item.field === 'documents');
      const message =
        `Votre demande n’a pas pu être acceptée car ${joinFrench(facts)}.` +
        (citesDocuments
          ? ' Vous pouvez transmettre les pièces concernées depuis votre espace personnel.'
          : '');

      return delay({ message, evidenceUsed: evidence });
    }

    const message =
      'Votre demande a été acceptée.' +
      (facts.length > 0
        ? ` Cette décision s’appuie sur les éléments suivants : ${joinFrench(facts)}.`
        : '');

    return delay({ message, evidenceUsed: evidence });
  },
};
