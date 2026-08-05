import { CitizenCard } from '@/components/citizen/CitizenCard';
import { CitizenPageHeader } from '@/components/citizen/CitizenPageHeader';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ChatWindow } from '@/features/chatbot/components/ChatWindow';
import { useCvCoachChat } from '@/features/france-travail/hooks/useCvCoachChat';

/**
 * « Coach CV » — France Travail.
 *
 * Un seul canal : la conversation. Décrire son parcours à l'écrit et envoyer un
 * CV déjà rédigé mènent au même endroit, le fil, au lieu des deux colonnes de
 * poids égal qui obligeaient à choisir une voie avant d'avoir commencé. Le
 * fichier envoyé apparaît comme un tour de l'utilisateur, la relecture comme la
 * réponse de l'assistant — cf. `useCvCoachChat.sendCv`.
 *
 * La réserve « l'assistant commente, il ne réécrit pas » n'est plus affichée en
 * permanence : elle ouvre la réponse au CV, là où elle a un objet.
 */

const STARTER_QUESTIONS = [
  'Je suis agent d’entretien depuis 10 ans, aidez-moi à le présenter',
  'Comment valoriser une expérience sans diplôme ?',
  'Quelles réalisations mettre en avant pour un poste de vendeur ?',
];

export default function CvCoachPage() {
  useDocumentTitle('Coach CV — France Travail');
  const controller = useCvCoachChat();

  return (
    // Plein écran, comme « Aide IA » : la page prend la hauteur que lui laisse
    // la coque et ne défile pas elle-même, seul le fil des messages défile
    // (`CitizenAppShell` bloque le défilement du document sur cette route).
    <div className="mx-auto flex h-full min-h-0 max-w-container flex-col">
      <CitizenPageHeader
        eyebrow="Coach CV"
        title="Votre CV relu et commenté par l’assistant"
        description="Décrivez votre expérience à l’assistant, ou envoyez directement votre CV pour un retour — ce qui est déjà bien, ce qui manque, et des conseils concrets."
        // Même recette que « Déposer un dossier » / « Suivre un dossier
        // déposé » : police sans, taille `display`, bleu #102a74.
        titleClassName="font-sans text-[#102a74] sm:text-display"
        className="mb-6 shrink-0"
      />

      {/* Largeur bornée et centrée : une ligne de conversation qui court sur
          toute la largeur d'un grand écran est pénible à lire, et la barre de
          saisie s'y étire sans raison. */}
      <CitizenCard className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col p-6">
        <ChatWindow
          controller={controller}
          fill
          starterQuestions={STARTER_QUESTIONS}
          attachSuggestion="Envoyez votre CV pour un retour"
          onAttachFile={controller.sendCv}
          emptyHint="Racontez votre parcours, ou déposez votre CV — PDF, JPG ou PNG."
          composerPlaceholder="Décrivez votre expérience, ou joignez votre CV…"
        />
      </CitizenCard>
    </div>
  );
}
