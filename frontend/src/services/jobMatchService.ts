import type { JobMatchAnalysis } from '@/types';
import { apiClient } from './apiClient';

/**
 * Job-offer match analysis (France Travail). Stateless: one request, one
 * response — nothing is saved server-side, so there is nothing else to fetch.
 */
export interface JobMatchService {
  /** Compare a CV against a pasted job offer. `POST /ai/job-match/analyze`. */
  analyze(offerText: string, cv: File): Promise<JobMatchAnalysis>;
}

export const jobMatchService: JobMatchService = {
  analyze: (offerText, cv) => {
    const form = new FormData();
    form.append('cv', cv);
    form.append('offer_text', offerText);
    return apiClient.post<JobMatchAnalysis>('/ai/job-match/analyze', form);
  },
};
