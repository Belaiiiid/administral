import type {
  CitizenDocument,
  DocumentClassification,
  DocumentationArticle,
  ExtractedField,
  PersonalizedChecklist,
  RequiredDocument,
} from '@/types';
import { apiClient } from './apiClient';

/**
 * Citizen document contract.
 *
 * The upload / checklist / classification methods are the completeness feature
 * from the `MonParcours-Completude` work, now wired to the FastAPI citizen
 * module: upload stores the file, extracts its text, classifies it against the
 * dossier checklist, and updates completeness — all server-side.
 *
 * `listArticles` / `getArticle` stay `notImplemented`: they belong to a separate
 * documentation module that does not exist yet, and wiring them to absent
 * endpoints would trade a clear error for a 404.
 */
export interface DocumentService {
  listDocuments(): Promise<CitizenDocument[]>;
  upload(file: File, onProgress?: (percent: number) => void): Promise<CitizenDocument>;
  remove(id: string): Promise<void>;
  /** Fields extracted by the analysis pipeline, with confidence scores. */
  getExtractedFields(documentId: string): Promise<ExtractedField[]>;
  getRequiredDocuments(applicationId: string): Promise<RequiredDocument[]>;
  /** Personalized checklist derived from the citizen's complete profile. */
  getChecklist(applicationId: string): Promise<PersonalizedChecklist>;
  /** Just the completeness counters, for a status badge without the full list. */
  getApplicationStatus(
    applicationId: string,
  ): Promise<
    Pick<
      PersonalizedChecklist,
      'dossier_id' | 'status' | 'requiredReceivedCount' | 'requiredDocumentCount'
    >
  >;
  /** How the classifier matched one uploaded document against the checklist. */
  getClassification(documentId: string): Promise<DocumentClassification>;
  listArticles(): Promise<DocumentationArticle[]>;
  getArticle(slug: string): Promise<DocumentationArticle>;
}

const notImplemented = (method: string) => (): never => {
  throw new Error(`documentService.${method}() sera implémenté par le module full-stack Documents.`);
};

export const documentService: DocumentService = {
  listDocuments: () => apiClient.get<CitizenDocument[]>('/documents'),

  upload: (file) => {
    // The API reads the file from multipart form data; `FormData` sets its own
    // Content-Type (with the boundary), so `apiClient` must not force JSON.
    const form = new FormData();
    form.append('file', file);
    return apiClient.post<CitizenDocument>('/documents', form);
  },

  remove: (id) => apiClient.delete<void>(`/documents/${encodeURIComponent(id)}`),

  getChecklist: (applicationId) =>
    apiClient.get<PersonalizedChecklist>(
      `/applications/${encodeURIComponent(applicationId)}/checklist`,
    ),

  getApplicationStatus: (applicationId) =>
    apiClient.get<
      Pick<
        PersonalizedChecklist,
        'dossier_id' | 'status' | 'requiredReceivedCount' | 'requiredDocumentCount'
      >
    >(`/applications/${encodeURIComponent(applicationId)}/status`),

  getClassification: (documentId) =>
    apiClient.get<DocumentClassification>(
      `/documents/${encodeURIComponent(documentId)}/classification`,
    ),

  // No structured field-extraction endpoint yet — the extracted text preview
  // lives on the document itself. Kept explicit rather than faked.
  getExtractedFields: notImplemented('getExtractedFields'),
  getRequiredDocuments: notImplemented('getRequiredDocuments'),
  listArticles: notImplemented('listArticles'),
  getArticle: notImplemented('getArticle'),
};
