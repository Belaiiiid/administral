import type { ChatbotContext, ChatbotResponse } from '@/features/chatbot/types/chatbot';
import { apiClient } from '@/services/apiClient';

/**
 * Citizen assistant contract.
 *
 * One method, because the assistant does one thing: answer a question. It does
 * not modify an application, compute an entitlement, decide eligibility, or
 * stand in for CAF rules — and there is no method here through which it could.
 * The narrow surface is the guarantee, not a comment asking for restraint.
 *
 * Interface first, transport second — same shape as `AgentCaseService`. The UI
 * depends on this type and never on where the answer comes from.
 */
export interface ChatbotService {
  /**
   * Ask a question. Future endpoint: `POST /citizen/chatbot/message`.
   *
   * @param message  The citizen's question, verbatim.
   * @param context  What is known about their situation. Optional throughout;
   *                 see {@link ChatbotContext}.
   */
  sendMessage(message: string, context?: ChatbotContext): Promise<ChatbotResponse>;
}

/**
 * REST implementation, backed by the FastAPI service.
 *
 * Everything the request triggers server-side — assembling profile and case
 * context, retrieval over the knowledge base, composing the answer from the
 * passages it retrieved — happens behind this one call and is invisible from
 * here. That is the point: the frontend knows there is an endpoint that answers
 * questions with sources, and nothing further.
 *
 * `conversationHistory` is trimmed to the last few turns. The whole thread
 * would grow without bound, and a context window is a finite resource the
 * client should not spend carelessly on its own behalf.
 */
const HISTORY_TURNS = 6;

export const httpChatbotService: ChatbotService = {
  sendMessage: (message, context) =>
    apiClient.post<ChatbotResponse>('/citizen/chatbot/message', {
      message,
      context: context
        ? {
            caseId: context.caseId,
            caseStatus: context.caseStatus,
            conversationHistory: (context.conversationHistory ?? [])
              .slice(-HISTORY_TURNS)
              .map(({ role, content }) => ({ role, content })),
            // Renvoyés tels quels : le backend n'a pas de session, l'état de la
            // clarification en cours vit ici le temps d'un aller-retour.
            pendingClarification: context.pendingClarification,
            isClarificationReply: context.isClarificationReply ?? false,
          }
        : undefined,
    }),
};
