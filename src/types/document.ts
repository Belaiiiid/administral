export type DocumentAnalysisStatus = 'uploading' | 'analysing' | 'validated' | 'rejected';

export interface DocumentClassification {
  decision: 'match' | 'not_expected' | 'example_or_template' | 'insufficient';
  matched_checklist_document_id: string | null;
  confidence: number;
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
  /** `native_pdf` si le PDF contient du texte, sinon OCR Mistral. */
  extractionMethod?: 'native_pdf' | 'mistral_ocr';
  extractedTextPreview?: string;
  classification?: DocumentClassification;
  classificationError?: string;
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

/** Contrat B1 : checklist personnalisée issue du profil citoyen complet. */
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
