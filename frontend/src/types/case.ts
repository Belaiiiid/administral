import type { AdministrationId } from './common';
import type { CitizenDocument } from './document';
import type { HouseholdComposition, HousingDetails } from './profile';

/**
 * The `Case` aggregate — a citizen application *after* the platform pipeline
 * has processed it.
 *
 * This is the single object the future backend stores and returns. It lives in
 * `src/types` rather than under `features/agent` because both portals describe
 * the same reality: the Citizen Portal owns the application while it is being
 * built, the Agent Portal consumes it once processed. Duplicating the shape on
 * either side is what this file exists to prevent.
 *
 * Pipeline that produces it, in order:
 *   application → documents → completeness → coherence → scoring → Case
 *
 * The Agent Portal is a *read model consumer*. Every derived value below
 * (`score`, both reports, `status`) arrives already computed. Nothing in the
 * agent UI may recalculate them — see docs/agent-portal-implementation-plan.md.
 */
export interface Case {
  id: string;
  /** Human-readable reference shown to citizen and agent alike, e.g. « 2026-APL-8821 ». */
  applicationNumber: string;
  /** Identity of the applicant, as captured at submission. */
  citizen: CaseCitizen;
  submittedAt: string;
  /** Which administration's service the application targets. */
  service: CaseService;
  /** Absent until the scoring stage has run. */
  score?: CaseScore;
  status: CaseStatus;
  /** Household and housing situation *frozen at submission time*. */
  profile: CaseProfileSnapshot;
  documents: CaseDocument[];
  /** Absent until the completeness stage has run. */
  completenessReport?: CompletenessReport;
  /** Absent until the coherence stage has run. */
  coherenceReport?: CoherenceReport;
  /** Set once an agent has recorded a decision. */
  decision?: CaseDecision;
}

/**
 * Row projection for the instruction queue.
 *
 * `GET /agent/cases` returns these, not full `Case` objects: the queue needs
 * six fields and a list endpoint should not ship every document of every case.
 * Kept as a structural subset of `Case` so one fixture set feeds both views.
 */
export interface CaseSummary {
  id: string;
  applicationNumber: string;
  citizen: CaseCitizen;
  submittedAt: string;
  service: CaseService;
  score?: CaseScore;
  status: CaseStatus;
  /** Days elapsed since submission — computed server-side, never in the UI. */
  waitingDays: number;
}

/**
 * Applicant identity as denormalised onto the case.
 *
 * Deliberately *not* `CitizenIdentity`: an agent reading a case needs the
 * identity as it stood at submission, not the citizen's live profile record.
 */
export interface CaseCitizen {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  birthDate: string;
  /** NIR, pre-masked by the backend. The frontend never receives the full number. */
  maskedSocialSecurityNumber: string;
}

export interface CaseService {
  id: AdministrationId;
  /** Public-facing service name, e.g. « Aide personnalisée au logement ». */
  label: string;
}

/** Household + housing situation captured with the application. */
export interface CaseProfileSnapshot {
  household: HouseholdComposition;
  housing: HousingDetails;
  /** Declared annual income in euros. */
  annualIncome: number;
  capturedAt: string;
}

/**
 * A supporting document attached to the case.
 *
 * Extends the citizen-side `CitizenDocument` with the agent-facing fields the
 * pipeline adds. Extension rather than redefinition keeps one document shape.
 */
export interface CaseDocument extends CitizenDocument {
  /** Which checklist requirement this file satisfies, e.g. `proof_of_address`. */
  requirementId: string;
  /** Label of that requirement, e.g. « Justificatif de domicile ». */
  requirementLabel: string;
  /** Present once the extraction stage has read the file. */
  extractedAt?: string;
  /**
   * Overall document-authenticity level from the C4 metadata forensics — the
   * badge value. `FAIBLE` when nothing was flagged, otherwise the risk level.
   * Computed by the pipeline before the case reaches the agent.
   */
  fraudRisk?: string;
  /** Full C4 forensic result — signals and the optional LLM verdict. */
  fraudAnalysis?: FraudAnalysis;
}

/** One layer of the C4 forensic verdict — the optional Mistral analysis. */
export interface FraudLlmAnalysis {
  niveauRisque: string;
  verdict: string;
  signauxLlm: string[];
  analyseLlm: string;
  recommandation: string;
}

/** A localised ELA anomaly and the image page on which it was found. */
export interface FraudRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  confidencePct: number;
}

export interface FraudVisual {
  pageNumber: number;
  isSuspicious: boolean;
  regions: FraudRegion[];
  /** Annotated document page with red bounding boxes, sent by the API. */
  markedImageBase64: string;
  metrics: { anomalyScore: number; maxBrightness: number };
}

export interface DocumentIntegrity {
  contentHash: string;
  exactDuplicateInDossier: boolean;
  qrCodesDetected: number;
  mrzDetected: boolean;
  mrzChecksumValid?: boolean | null;
  pdfSignatureState: string;
  issuerVerificationStatus: string;
}

export interface VisionModelAnalysis {
  provider: string;
  status: string;
  score?: number | null;
  message: string;
  device?: string | null;
  pages: FraudVisual[];
}

/**
 * Document metadata forensics (Agent C4).
 *
 * Produced upstream, consumed by the Agent Portal — never recomputed here. The
 * deterministic signals are always present; `analyseLlm` is the optional
 * model verdict.
 */
export interface FraudAnalysis {
  fichier: string;
  typeFichier?: string;
  dateCreation?: string;
  dateModification?: string;
  logiciel?: string;
  auteurDeclare?: string;
  signauxAVerifier: string[];
  analyseLlm?: FraudLlmAnalysis;
  niveauRisque: string;
  aDesSignaux: boolean;
  elaVisuals: FraudVisual[];
  integrity?: DocumentIntegrity;
  visionModel?: VisionModelAnalysis;
  erreur?: string;
}

export type CaseStatus =
  | 'submitted'
  | 'awaiting_documents'
  | 'under_review'
  | 'ready_for_decision'
  | 'validated'
  | 'rejected';

/**
 * AI eligibility score, produced before the case reaches the Agent Portal.
 *
 * `band` is supplied by the backend rather than derived from `value` in the UI:
 * the thresholds are a business rule owned by the scoring service, and an agent
 * screen must never be the second place they are written down.
 */
export interface CaseScore {
  /** 0–100. */
  value: number;
  band: CaseScoreBand;
  computedAt: string;
  /** Identifier of the scoring model, for auditability. */
  model: string;
}

export type CaseScoreBand = 'high' | 'medium' | 'low';

export type ReportOutcome = 'passed' | 'warning' | 'failed';

/** Result of the "are all required documents present?" stage. */
export interface CompletenessReport {
  outcome: ReportOutcome;
  checkedAt: string;
  /** 0–100, computed by the pipeline. */
  completionRate: number;
  items: CompletenessItem[];
}

export interface CompletenessItem {
  id: string;
  label: string;
  received: boolean;
  /** Whether the file is mandatory for this service. */
  required: boolean;
}

/** Result of the "do the declared data and the documents agree?" stage. */
export interface CoherenceReport {
  outcome: ReportOutcome;
  checkedAt: string;
  /** Overall 0–100 coherence score; absent on legacy reports. */
  coherenceScore?: number | null;
  /** The analyser's natural-language summary; absent on legacy reports. */
  aiExplanation?: string | null;
  anomalies: CoherenceAnomaly[];
}

export interface CoherenceAnomaly {
  id: string;
  severity: 'info' | 'warning' | 'error';
  /** Human-readable name of the field in conflict, e.g. « Loyer mensuel ». */
  field: string;
  /** What the citizen declared. */
  declaredValue: string;
  /** What the pipeline read from the supporting document. */
  observedValue: string;
  message: string;
}

/**
 * Workload counters for the dashboard tiles.
 *
 * Aggregated server-side and returned whole. The agent UI must not count rows
 * itself: the queue endpoint is paginated and filtered, so a client-side tally
 * would report the size of the current page, not the size of the workload.
 */
export interface CaseQueueStats {
  /** Cases awaiting any agent action. */
  pending: number;
  /** Cases flagged for review today. */
  toReviewToday: number;
  /** Distinct citizens with at least one open case. */
  citizensTracked: number;
}

/**
 * Outcome of an agent's decision.
 *
 * Uses the same vocabulary as `CaseStatus` rather than a parallel
 * APPROVED/REJECTED enum: a decision *is* the status transition, so one
 * vocabulary means no translation table between them. The uppercase form the
 * REST contract uses is a wire concern, mapped in `httpDecisionService`.
 */
export type DecisionOutcome = 'validated' | 'rejected';

/**
 * A single verifiable fact drawn from the case, cited by a decision.
 *
 * This is the anti-hallucination primitive of the whole workflow. An
 * explanation may only be composed from evidence items, and each item carries
 * a `source` pointing back into the `Case` object it was read from — so any
 * sentence shown to a citizen can be traced to the record that justifies it.
 */
export interface DecisionEvidence {
  /** Which part of the case this fact came from, e.g. `documents`. */
  field: string;
  /**
   * The fact itself, already phrased for a citizen — e.g. « l'attestation de
   * revenus demandée est absente de votre dossier ». Explanations are built by
   * concatenating these verbatim, never by paraphrasing them.
   */
  value: string;
  /** Pointer into the Case, for audit — e.g. `Case.completenessReport.items[rib]`. */
  source: string;
}

/**
 * An agent's formal decision on a case.
 *
 * Produced by the decision service, never assembled in a component. The
 * `explanation` is derived *from* `evidenceUsed` — that ordering is the
 * guarantee: no explanation can assert something no evidence item states.
 */
export interface CaseDecision {
  id: string;
  caseId: string;
  outcome: DecisionOutcome;
  /** Citizen-facing message, composed exclusively from `evidenceUsed`. */
  explanation: string;
  /** Non-empty whenever `outcome` is `rejected` — see business rules. */
  evidenceUsed: DecisionEvidence[];
  createdAt: string;
  /** Display name of the deciding agent. */
  decidedBy: string;
}
