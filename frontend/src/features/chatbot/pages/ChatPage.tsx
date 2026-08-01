import { SectionHeader } from '@/components/shared';
import { Card, CardContent } from '@/components/ui/card';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ChatWindow } from '@/features/chatbot/components/ChatWindow';
import { useChatbot } from '@/features/chatbot/hooks/useChatbot';
import { WhatsAppQrCard } from '@/features/chatbot/components/landing/WhatsAppQrCard';

/**
 * The citizen assistant.
 *
 * A consultation surface and nothing more: it answers questions about
 * procedures, documents and the meaning of administrative terms. It cannot
 * modify an application, compute an entitlement or rule on eligibility — not by
 * convention but by construction, since `chatbotService` exposes no method that
 * would let it.
 *
 * Route unchanged (`ROUTES.chat`); the file kept its name so the lazy import in
 * the router still resolves.
 */
export default function ChatPage() {
  useDocumentTitle('Assistant');

  /*
   * No context is passed yet, and none is fabricated.
   *
   * `ChatbotContext` is ready for `citizenProfile`, `caseId` and `caseStatus`,
   * but the citizen-side services that would supply them are still unimplemented
   * (`profileService`, `aplService`). Passing a placeholder profile would make
   * the assistant answer personal questions from invented data — the one failure
   * mode this whole design exists to prevent. Until those services return real
   * values, the assistant correctly says it cannot see the citizen's file.
   *
   * Wiring it later is one line here plus the hooks that load them; no component
   * below changes.
   */
  const controller = useChatbot();

  return (
    <div className="mx-auto grid max-w-container gap-gutter lg:grid-cols-3">
      <ChatWindow controller={controller} />

      {/* Context panel */}
      <aside className="flex flex-col gap-gutter">
        <Card>
          <CardContent className="p-6">
            <SectionHeader title="Statut actuel" as="h2" className="mb-4" />
            <p className="text-body-sm text-on-surface-variant">
              Aucun dossier en cours. Le contexte de votre demande s’affichera ici pour éclairer les
              réponses de l’assistant.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <SectionHeader title="Portail documentation" as="h2" className="mb-4" />
            <p className="text-body-sm text-on-surface-variant">
              Les ressources utiles à votre conversation apparaîtront ici.
            </p>
          </CardContent>
        </Card>

        <WhatsAppQrCard />
      </aside>
    </div>
  );
}
