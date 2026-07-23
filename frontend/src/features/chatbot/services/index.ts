import type { ChatbotService } from './chatbotService';
import { httpChatbotService } from './chatbotService';

export type { ChatbotService } from './chatbotService';
export { httpChatbotService } from './chatbotService';

/**
 * The binding `useChatbot` imports.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │  useChatbot → chatbotService → httpChatbotService → apiClient → REST   │
 * │                                                        ↓               │
 * │                              retrieval → answer composition            │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Everything below the REST call is server-side and unrepresented in this
 * codebase by design. No module here imports a model client, holds a prompt, or
 * names a provider — swapping the retrieval strategy or the model behind it
 * changes nothing on this side of the line.
 */
export const chatbotService: ChatbotService = httpChatbotService;
