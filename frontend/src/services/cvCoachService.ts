import type { CvReviewResult } from '@/types';
import { apiClient } from './apiClient';

/** One turn of conversation history, as sent to/from the CV coach. */
export interface CvCoachTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * CV coach (France Travail) — a conversational coach plus a one-shot CV
 * reviewer. Stateless like `jobMatchService`: the chat history lives in the
 * caller (see `useCvCoachChat`), nothing is saved server-side.
 */
export interface CvCoachService {
  /** One conversational turn. `POST /ai/cv-coach/chat`. */
  chat(message: string, history: CvCoachTurn[]): Promise<string>;
  /** Structured, one-shot review of an uploaded CV. `POST /ai/cv-coach/review`. */
  review(cv: File): Promise<CvReviewResult>;
}

export const cvCoachService: CvCoachService = {
  chat: (message, history) =>
    apiClient
      .post<{ reply: string }>('/ai/cv-coach/chat', {
        message,
        conversation_history: history,
      })
      .then((response) => response.reply),

  review: (cv) => {
    const form = new FormData();
    form.append('cv', cv);
    return apiClient.post<CvReviewResult>('/ai/cv-coach/review', form);
  },
};
