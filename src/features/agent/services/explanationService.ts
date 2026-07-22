import type { DecisionEvidence, DecisionOutcome } from '@/types';

/**
 * Explanation generation contract — the seam a language model sits behind.
 *
 * ## Scope, and what is deliberately outside it
 *
 * This service performs **formulation only**. It receives a decision that has
 * already been made and evidence that has already been extracted, and turns
 * them into a sentence a citizen can read. It may not:
 *
 *   - choose between approval and rejection — the agent does that;
 *   - assess eligibility or compute rights — the pipeline did that;
 *   - infer or apply CAF rules;
 *   - state anything not present in the `evidence` it was given.
 *
 * That last constraint is the reason the signature takes `evidence` rather than
 * a `Case`. Handed a whole case, a model could reason about it — about incomes,
 * thresholds, entitlements — and produce fluent, plausible, unsupported claims.
 * Handed a closed list of extracted facts, the worst it can do is rephrase
 * them. The narrow input *is* the safety mechanism.
 *
 * ## Where this runs
 *
 * In production, nowhere near the browser. The backend extracts evidence, calls
 * the model, and returns the finished message inside the decision response. The
 * interface is declared here so the mock has a contract to honour and so the
 * frontend's expectations are written down — not so a component can call it.
 * No page or component imports this module.
 */
export interface ExplanationService {
  generateExplanation(
    decision: DecisionOutcome,
    evidence: DecisionEvidence[],
  ): Promise<GeneratedExplanation>;
}

export interface GeneratedExplanation {
  /** The citizen-facing message. */
  message: string;
  /**
   * The evidence the message was built from — echoed back, not re-derived.
   *
   * Returning it alongside the text is what makes the result auditable: the
   * message and its justification travel together, so a reviewer can check
   * every claim against the case without re-running anything.
   */
  evidenceUsed: DecisionEvidence[];
}
