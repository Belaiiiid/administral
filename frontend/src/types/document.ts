export type DocumentAnalysisStatus = 'uploading' | 'analysing' | 'validated' | 'rejected';

/**
 * How the AI pipeline classified an uploaded document against the checklist.
 *
 * Contract for the completeness feature (from the `MonParcours-Completude`
 * work). The classifier decides which expected document, if any, an upload
 * satisfies — and, crucially, refuses to guess: `insufficient` and
 * `not_expected` are first-class outcomes, so an unrecognised or blank scan is
 * never silently counted as a valid piece.
 */
export interface DocumentClassification {
  decision: 'match' | 'not_expected' | 'example_or_template' | 'insufficient';
  /** Which checklist entry this upload satisfies, or `null` if none. */
  matched_checklist_document_id: string | null;
  /** 0–1. */
  confidence: number;
  /** Verbatim excerpts justifying the decision. */
  evidence: string[];
  reason: string;
}

export interface CitizenDocument {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  status: DocumentAnalysisStatus;
  /** 0–100, present while status is `uploading` or `analysing`. */
  progress?: number;
  /** Human-readable reason when status is `rejected`. */
  errorMessage?: string;
  /** `native_pdf` when the PDF carried text, otherwise Mistral OCR. */
  extractionMethod?: 'native_pdf' | 'mistral_ocr';
  extractedTextPreview?: string;
  classification?: DocumentClassification;
  classificationError?: string;
  /**
   * Overall document-authenticity level from the C4 metadata forensics, for a
   * per-document badge. `FAIBLE` when nothing was flagged, `À VÉRIFIER` when
   * deterministic signals fired without an LLM verdict, or the LLM's level
   * (`MODÉRÉ`/`ÉLEVÉ`/`CRITIQUE`). The full analysis is fetched separately.
   */
  fraudRisk?: string;
}

/** One layer of the C4 forensic verdict — the optional LLM analysis. */
export interface FraudLlmAnalysis {
  niveauRisque: string;
  verdict: string;
  signauxLlm: string[];
  analyseLlm: string;
  recommandation: string;
}

/** Full metadata-forensics result — `GET /documents/{id}/fraud`. */
export interface FraudAnalysis {
  fichier: string;
  typeFichier?: string;
  dateCreation?: string;
  dateModification?: string;
  logiciel?: string;
  auteurDeclare?: string;
  /** Deterministic forgery signals — always computed. */
  signauxAVerifier: string[];
  analyseLlm?: FraudLlmAnalysis;
  niveauRisque: string;
  aDesSignaux: boolean;
  erreur?: string;
}

/** A field extracted from a document, with the model's confidence. */
export interface ExtractedField {
  id: string;
  label: string;
  value: string;
  /** 0–1. */
  confidence: number;
}

/** One line of the "pièces attendues" checklist. */
export interface RequiredDocument {
  id: string;
  label: string;
  received: boolean;
}

/**
 * One line of the personalized checklist, derived from the citizen's complete
 * profile (the "Contrat B1" of the completeness feature).
 *
 * Richer than `RequiredDocument`: it carries the category, why the document is
 * required, and the accepted formats — everything the upload UI needs to guide
 * a citizen to the right file rather than just listing a label.
 */
export interface ChecklistDocument {
  id: string;
  libelle: string;
  categorie: 'identite' | 'ressources' | 'logement' | 'famille' | 'autre';
  obligatoire: boolean;
  justification: string;
  formats_acceptes: string[];
  received: boolean;
}

export interface PersonalizedChecklist {
  dossier_id: string;
  documents: ChecklistDocument[];
  version_checklist: string;
  status: 'complete' | 'incomplete';
  requiredReceivedCount: number;
  requiredDocumentCount: number;
}

export interface DocumentationArticle {
  id: string;
  slug: string;
  title: string;
  category: string;
  author: string;
  updatedAt: string;
  readingTimeMinutes: number;
  excerpt: string;
}
