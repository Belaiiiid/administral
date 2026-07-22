import { mockChatbotService } from '@/features/chatbot/data/mockChatbotService';

import type { ChatbotService } from './chatbotService';

export type { ChatbotService } from './chatbotService';
export { httpChatbotService } from './chatbotService';

/**
 * The binding every hook imports — and the *only* line that changes when the
 * assistant backend lands.
 *
 * ┌─ today ────────────────────────────────────────────────────────────────┐
 * │  useChatbot → chatbotService → mockChatbotService → keyword lookup     │
 * ├─ when the API exists ──────────────────────────────────────────────────┤
 * │  useChatbot → chatbotService → httpChatbotService → apiClient → REST   │
 * │                                                          ↓             │
 * │                             context service → hybrid RAG → LLM         │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Everything below the REST call is server-side and unrepresented in this
 * codebase by design. No module here imports a model client, holds a prompt, or
 * names a provider — swapping the retrieval strategy or the model changes
 * nothing on this side of the line.
 *
 * To cut over: change the right-hand side to `httpChatbotService`, implement
 * `apiClient.request()`, then delete `data/`. No page, component or hook is
 * modified — that is the property this indirection exists to guarantee.
 */
export const chatbotService: ChatbotService = mockChatbotService;
