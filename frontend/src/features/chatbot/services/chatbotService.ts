import type { ChatbotContext, ChatbotResponse } from '@/features/chatbot/types/chatbot';

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

const notImplemented = (method: string) => (): never => {
  throw new Error(`chatbotService.${method}() sera implémenté par le module full-stack Assistant.`);
};

/**
 * The real implementation, pending.
 *
 * When the backend lands this becomes a single `apiClient` call plus a DTO→domain
 * mapping:
 *
 *   sendMessage: (message, context) =>
 *     apiClient.post<ChatbotResponseDto>('/citizen/chatbot/message', {
 *       message,
 *       context: toContextDto(context),
 *     }).then(toChatbotResponse),
 *
 * Everything the request triggers server-side — assembling profile and case
 * context, hybrid retrieval over the knowledge base, prompting the model,
 * grounding the answer in the passages it retrieved — happens behind this call
 * and is invisible from here. That is the point: the frontend knows there is an
 * endpoint that answers questions with sources, and nothing further.
 *
 * `apiClient` already exists (`src/services/apiClient.ts`) and already throws
 * until its `request()` is written — so this file needs no other scaffolding.
 */
export const httpChatbotService: ChatbotService = {
  sendMessage: notImplemented('sendMessage'),
};
