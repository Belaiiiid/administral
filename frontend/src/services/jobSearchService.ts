import type { JobSearchResult } from '@/types';
import { apiClient } from './apiClient';

/**
 * Job search (France Travail) — a free-text prompt in, real offers out.
 * Stateless, one request per search.
 */
export interface JobSearchService {
  /** `POST /ai/job-search/search`. */
  search(prompt: string): Promise<JobSearchResult>;
}

export const jobSearchService: JobSearchService = {
  search: (prompt) => apiClient.post<JobSearchResult>('/ai/job-search/search', { prompt }),
};
