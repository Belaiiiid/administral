export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  /** Quick-reply chips offered alongside an assistant message. */
  suggestions?: string[];
  /** A structured recommendation card rendered under the message. */
  recommendation?: ChatRecommendation;
}

export interface ChatRecommendation {
  title: string;
  body: string;
  actions: { id: string; label: string; icon?: string }[];
}

export interface ChatConversation {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export type FeedbackVote = 'up' | 'down';
