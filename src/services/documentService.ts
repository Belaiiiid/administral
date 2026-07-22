import type { CitizenDocument, DocumentClassification, DocumentationArticle, ExtractedField, PersonalizedChecklist, RequiredDocument } from '@/types';
import { apiClient } from './apiClient';

export interface DocumentService {
  listDocuments(): Promise<CitizenDocument[]>;
  upload(file: File, onProgress?: (percent: number) => void): Promise<CitizenDocument>;
  remove(id: string): Promise<void>;
  getExtractedFields(documentId: string): Promise<ExtractedField[]>;
  getRequiredDocuments(applicationId: string): Promise<RequiredDocument[]>;
  getChecklist(applicationId: string): Promise<PersonalizedChecklist>;
  getApplicationStatus(applicationId: string): Promise<Pick<PersonalizedChecklist, 'dossier_id' | 'status' | 'requiredReceivedCount' | 'requiredDocumentCount'>>;
  getClassification(documentId: string): Promise<DocumentClassification>;
  listArticles(): Promise<DocumentationArticle[]>;
  getArticle(slug: string): Promise<DocumentationArticle>;
}

export const documentService: DocumentService = {
  listDocuments: () => apiClient.get<CitizenDocument[]>('/documents'),
  upload: async (file) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.post<CitizenDocument>('/documents', form);
  },
  remove: (id) => apiClient.delete<void>(`/documents/${id}`),
  getExtractedFields: (documentId) => apiClient.get<ExtractedField[]>(`/documents/${documentId}/fields`),
  getRequiredDocuments: (applicationId) => apiClient.get<RequiredDocument[]>(`/applications/${applicationId}/required-documents`),
  getChecklist: (applicationId) => apiClient.get<PersonalizedChecklist>(`/applications/${applicationId}/checklist`),
  getApplicationStatus: (applicationId) => apiClient.get<Pick<PersonalizedChecklist, 'dossier_id' | 'status' | 'requiredReceivedCount' | 'requiredDocumentCount'>>(`/applications/${applicationId}/status`),
  getClassification: (documentId) => apiClient.get<DocumentClassification>(`/documents/${documentId}/classification`),
  listArticles: () => apiClient.get<DocumentationArticle[]>('/documentation'),
  getArticle: (slug) => apiClient.get<DocumentationArticle>(`/documentation/${slug}`),
};
