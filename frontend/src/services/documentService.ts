import type {
  CitizenDocument,
  DocumentationArticle,
  ExtractedField,
  RequiredDocument,
} from '@/types';

export interface DocumentService {
  listDocuments(): Promise<CitizenDocument[]>;
  upload(file: File, onProgress?: (percent: number) => void): Promise<CitizenDocument>;
  remove(id: string): Promise<void>;
  /** Fields extracted by the analysis pipeline, with confidence scores. */
  getExtractedFields(documentId: string): Promise<ExtractedField[]>;
  getRequiredDocuments(applicationId: string): Promise<RequiredDocument[]>;
  listArticles(): Promise<DocumentationArticle[]>;
  getArticle(slug: string): Promise<DocumentationArticle>;
}

const notImplemented = (method: string) => (): never => {
  throw new Error(`documentService.${method}() sera implémenté par le module full-stack Documents.`);
};

export const documentService: DocumentService = {
  listDocuments: notImplemented('listDocuments'),
  upload: notImplemented('upload'),
  remove: notImplemented('remove'),
  getExtractedFields: notImplemented('getExtractedFields'),
  getRequiredDocuments: notImplemented('getRequiredDocuments'),
  listArticles: notImplemented('listArticles'),
  getArticle: notImplemented('getArticle'),
};
