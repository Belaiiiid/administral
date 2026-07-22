import type { Case, DecisionEvidence } from '@/types';

/**
 * Reads verifiable facts out of a `Case`.
 *
 * ## Why this is extraction and not analysis
 *
 * Every function here *reads* a field the pipeline already wrote and restates
 * it in citizen-readable French. Nothing is inferred, computed or judged: a
 * document is missing because `received === false`, not because this file
 * decided it matters. That distinction is what keeps the Agent Portal a
 * consumer of processed cases rather than a second decision engine.
 *
 * In production this runs server-side, between the decision endpoint and the
 * model. It lives under `data/` because it is part of the mocked backend, not
 * part of the frontend — no hook or component imports it.
 *
 * ## The phrasing rule
 *
 * `value` is written as a sentence fragment that can be concatenated after
 * « car … » without alteration. Explanations are built by joining these
 * verbatim, so the citizen-facing wording is decided *here*, next to the field
 * it came from — never by a downstream paraphrase that could drift from it.
 *
 * Constructions avoid French gender agreement (« le document « X » n'a pas été
 * fourni » rather than « X est absent·e ») so a new document label cannot
 * produce a grammatically wrong sentence.
 */

/**
 * Grounds for rejection: what is missing, unusable or inconsistent.
 *
 * An empty result means the case presents no verifiable defect — which is
 * precisely the situation in which a rejection must be refused.
 */
export function extractBlockingEvidence(caseRecord: Case): DecisionEvidence[] {
  const evidence: DecisionEvidence[] = [];

  /*
   * A document that was uploaded but rejected also shows as "not received" on
   * the completeness checklist. Reporting both would cite the same defect
   * twice, so the more specific finding wins and the checklist entry is
   * skipped for that requirement.
   */
  const unusableRequirements = new Set(
    caseRecord.documents.filter((doc) => doc.status === 'rejected').map((doc) => doc.requirementId),
  );

  for (const doc of caseRecord.documents) {
    if (doc.status !== 'rejected') continue;
    evidence.push({
      field: 'documents',
      value:
        `le document « ${doc.requirementLabel} » transmis n’a pas pu être exploité` +
        (doc.errorMessage ? ` (${lowerFirst(stripTrailingPeriod(doc.errorMessage))})` : ''),
      source: `Case.documents[${doc.id}]`,
    });
  }

  for (const item of caseRecord.completenessReport?.items ?? []) {
    if (item.received || !item.required) continue;
    if (unusableRequirements.has(item.id)) continue;
    evidence.push({
      field: 'documents',
      value: `le document « ${item.label} » n’a pas été fourni`,
      source: `Case.completenessReport.items[${item.id}]`,
    });
  }

  for (const anomaly of caseRecord.coherenceReport?.anomalies ?? []) {
    // `info` anomalies are observations, not defects — they justify nothing.
    if (anomaly.severity === 'info') continue;
    evidence.push({
      field: 'coherenceReport',
      value:
        `l’information « ${anomaly.field} » que vous avez déclarée (${anomaly.declaredValue}) ` +
        `ne correspond pas à la pièce fournie (${anomaly.observedValue})`,
      source: `Case.coherenceReport.anomalies[${anomaly.id}]`,
    });
  }

  return evidence;
}

/**
 * Grounds for approval: which checks the case satisfied.
 *
 * The AI score is deliberately excluded. It is an internal instruction aid, not
 * a justification owed to a citizen, and quoting a model's number back to
 * someone as the reason for a decision about them is not a defensible
 * explanation. Approval may also carry no evidence at all — an agent can
 * approve a case that has reservations, and the business rules require evidence
 * only for rejections.
 */
export function extractSupportingEvidence(caseRecord: Case): DecisionEvidence[] {
  const evidence: DecisionEvidence[] = [];

  if (caseRecord.completenessReport?.outcome === 'passed') {
    evidence.push({
      field: 'completenessReport',
      value: 'l’ensemble des pièces justificatives requises a été fourni',
      source: 'Case.completenessReport.outcome',
    });
  }

  if (caseRecord.coherenceReport?.outcome === 'passed') {
    evidence.push({
      field: 'coherenceReport',
      value: 'les informations déclarées correspondent aux pièces fournies',
      source: 'Case.coherenceReport.outcome',
    });
  }

  return evidence;
}

const stripTrailingPeriod = (text: string): string => text.replace(/\.\s*$/, '');

const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);
