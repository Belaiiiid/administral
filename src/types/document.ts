export type DocumentAnalysisStatus = 'uploading' | 'analysing' | 'validated' | 'rejected';

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
