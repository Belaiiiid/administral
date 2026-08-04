import { ArrowRight, FileClock, LibraryBig } from 'lucide-react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { CitizenCard, CitizenCardBody, CitizenCardHeader } from '@/components/citizen/CitizenCard';
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
    // Plein écran : la page occupe la hauteur que lui laisse la coque (voir
    // `CitizenAppShell`, qui bloque le défilement du document sur cette route)
    // et ne défile pas elle-même. Le seul ascenseur de l'écran est celui du fil
    // de messages, dans `ChatWindow`.
    <div className="mx-auto flex h-full min-h-0 max-w-container flex-col">
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-3">
        <ChatWindow controller={controller} fill />

        {/* Context panel — fixe : il ne bouge pas quand le fil défile. Sur un
            écran trop court pour ses trois cartes, il défile pour lui-même
            plutôt que de pousser la mise en page.

            `[&>*]:shrink-0` : en colonne flex, les cartes prennent
            `flex-shrink: 1` par défaut et se laissent comprimer sous leur
            hauteur de contenu dès que le panneau manque de place. Comme
            `CitizenCard` masque son débordement (coins arrondis), le bas de la
            carte était rogné — le lien « Envoyer un dossier » sortait de la
            carte de 20px dès 700px de hauteur de fenêtre. En bloquant la
            compression, c'est le panneau qui défile (il a déjà `overflow-y-auto`)
            au lieu des cartes qui se tronquent. Posé sur le conteneur plutôt
            que sur chaque carte : cela couvre aussi `WhatsAppQrCard`, qui
            n'expose pas de `className`. */}
        <aside className="flex min-h-0 flex-col gap-6 overflow-y-auto [&>*]:shrink-0">
          <CitizenCard>
            <CitizenCardHeader title="Statut actuel" icon={FileClock} />
            <CitizenCardBody>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Aucun dossier en cours. Le contexte de votre demande s’affichera ici pour éclairer
                les réponses de l’assistant.
              </p>
              {/* La carte constatait l'absence de dossier sans dire comment en
                  ouvrir un : la seule issue était de retrouver l'entrée dans le
                  rail. Même libellé et même route que ce rail (`navigation.ts`,
                  id `dossier`) — deux noms pour une même destination se liraient
                  comme deux destinations. */}
              <Link
                to={ROUTES.dossier}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand transition-colors hover:text-[#102a74] hover:underline"
              >
                Envoyer un dossier
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </CitizenCardBody>
          </CitizenCard>

          <CitizenCard>
            <CitizenCardHeader title="Portail documentation" icon={LibraryBig} />
            <CitizenCardBody>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Les ressources utiles à votre conversation apparaîtront ici.
              </p>
            </CitizenCardBody>
          </CitizenCard>

          <WhatsAppQrCard />
        </aside>
      </div>
    </div>
  );
}
