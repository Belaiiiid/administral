import type { ChatConversation, ChatMessage, FeedbackVote } from '@/types';

export interface ChatService {
  getConversation(id?: string): Promise<ChatConversation>;
  /**
   * Streaming is the expected transport for assistant replies — the signature
   * takes a chunk callback so the UI can render tokens as they arrive.
   */
  sendMessage(
    conversationId: string,
    content: string,
    onChunk?: (chunk: string) => void,
  ): Promise<ChatMessage>;
  submitFeedback(messageId: string, vote: FeedbackVote): Promise<void>;
}

const notImplemented = (method: string) => (): never => {
  throw new Error(`chatService.${method}() sera implémenté par le module full-stack Assistant.`);
};

export const chatService: ChatService = {
  getConversation: notImplemented('getConversation'),
  sendMessage: notImplemented('sendMessage'),
  submitFeedback: notImplemented('submitFeedback'),
};
