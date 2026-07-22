import type {
  ChatbotContext,
  ChatbotResponse,
  ChatbotSource,
} from '@/features/chatbot/types/chatbot';
import type { ChatbotService } from '@/features/chatbot/services/chatbotService';

/**
 * Deterministic stand-in for {@link ChatbotService}.
 *
 * Stands in for the backend, and therefore does the backend's work: matching a
 * question against a knowledge base and returning an answer with the sources it
 * came from. It matches on keywords where the real system will match on
 * embeddings — a cruder retrieval, but the *same* retrieval step, producing the
 * same envelope. Nothing downstream can tell which one answered.
 *
 * Two properties are worth keeping if this file is edited:
 *
 *   1. Every answer is written text paired with the source it is drawn from.
 *      No answer is assembled at runtime from the citizen's data.
 *   2. An unmatched question yields a documented refusal, never a plausible
 *      guess. A mock that invents answers teaches the UI to trust answers.
 *
 * Delete this file to remove all canned content; `httpChatbotService` then
 * carries the feature.
 */

/** Simulates network + inference latency so the typing indicator is exercised. */
const LATENCY_MS = 640;

const delay = <T>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));

interface KnowledgeEntry {
  /** Lowercase, unaccented keywords. A question matching any one of them hits. */
  keywords: string[];
  answer: string;
  sources: ChatbotSource[];
}

/**
 * Accent- and case-insensitive normalisation, so « démarche » matches
 * « demarche ». The real backend normalises before embedding for the same
 * reason: citizens type without accents.
 */
const normalise = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const KNOWLEDGE_BASE: KnowledgeEntry[] = [
  {
    keywords: ['document', 'piece', 'justificatif apl', 'quels documents', 'fournir'],
    answer:
      'Pour une demande APL, vous devez fournir les justificatifs liés à votre identité, ' +
      'votre logement et votre situation : une pièce d’identité en cours de validité, votre ' +
      'contrat de bail ou attestation de résidence, un relevé d’identité bancaire à votre nom, ' +
      'et vos justificatifs de ressources des douze derniers mois.',
    sources: [
      { title: 'Documents nécessaires pour une demande APL', category: 'demarche' },
      { title: 'Liste des pièces justificatives acceptées', category: 'document' },
    ],
  },
  {
    keywords: ['ressource', 'revenu', 'salaire', 'avis d’imposition', 'avis d imposition'],
    answer:
      'Un justificatif de ressources est un document attestant des revenus que vous avez perçus ' +
      'sur une période donnée. Il peut s’agir de vos bulletins de salaire, de votre avis ' +
      'd’imposition, ou d’une attestation de versement de prestations. Il permet d’établir votre ' +
      'situation financière au moment de la demande.',
    sources: [
      { title: 'Qu’est-ce qu’un justificatif de ressources ?', category: 'faq' },
      { title: 'Ressources prises en compte dans le calcul APL', category: 'reglementation' },
    ],
  },
  {
    keywords: ['attente', 'en cours', 'delai', 'combien de temps', 'traitement', 'statut'],
    answer:
      'Un dossier reste en attente tant qu’un élément nécessaire à son instruction manque, ou ' +
      'tant qu’un agent ne l’a pas examiné. Les motifs les plus fréquents sont une pièce ' +
      'justificative absente ou illisible, et une information à confirmer auprès d’un tiers. ' +
      'Le détail de votre dossier indique la raison exacte et l’action éventuellement attendue ' +
      'de votre part.',
    sources: [
      { title: 'Les étapes d’instruction d’un dossier', category: 'demarche' },
      { title: 'Pourquoi mon dossier est-il en attente ?', category: 'faq' },
    ],
  },
  {
    keywords: ['apl', 'aide au logement', 'allocation logement'],
    answer:
      'L’APL (aide personnalisée au logement) est une aide versée par la CAF pour réduire le ' +
      'montant de votre loyer ou de votre mensualité d’emprunt. Son attribution et son montant ' +
      'dépendent de vos ressources, de la composition de votre foyer et des caractéristiques de ' +
      'votre logement.',
    sources: [{ title: 'Présentation de l’aide personnalisée au logement', category: 'demarche' }],
  },
  {
    keywords: ['bail', 'logement', 'loyer', 'proprietaire', 'colocation'],
    answer:
      'Les informations relatives à votre logement — adresse, montant du loyer, type de bail et ' +
      'nature de l’occupation — sont demandées car elles conditionnent le calcul de l’aide. ' +
      'Elles doivent correspondre à celles figurant sur votre contrat de bail.',
    sources: [
      { title: 'Informations logement demandées dans le formulaire', category: 'demarche' },
      { title: 'Conditions relatives au logement', category: 'reglementation' },
    ],
  },
];

/**
 * The documented refusal for an unmatched question.
 *
 * It offers a route to a human rather than an approximation. An assistant that
 * fills silence with a plausible-sounding answer is worse than one that says it
 * does not know: the citizen cannot tell the two apart, and acts on both.
 */
const NO_ANSWER: ChatbotResponse = {
  answer:
    'Je n’ai pas d’information fiable sur ce point dans ma documentation. Pour éviter de vous ' +
    'induire en erreur, je préfère ne pas répondre. Vous pouvez reformuler votre question, ou ' +
    'contacter votre caisse pour une réponse adaptée à votre situation.',
  sources: [],
};

/**
 * Prefix stating that the assistant cannot see the citizen's own file.
 *
 * Reached when someone asks about "mon dossier" while no case is attached to the
 * conversation. The limit is stated *before* the general answer, so a citizen
 * never reads a description of the process and takes it for a description of
 * their file.
 */
const NO_CASE_CONTEXT_PREFIX =
  'Je n’ai pas accès à un dossier en cours pour cette conversation : je ne peux donc rien vous ' +
  'dire de votre situation personnelle.';

/** Used when the question is personal *and* nothing general matches it. */
const NO_CASE_CONTEXT: ChatbotResponse = {
  answer: `${NO_CASE_CONTEXT_PREFIX} Vous pouvez consulter le détail de votre demande depuis votre espace, ou contacter votre caisse.`,
  sources: [{ title: 'Les étapes d’instruction d’un dossier', category: 'demarche' }],
};

/** Question worded about the citizen's own case rather than the rules in general. */
const isAboutTheirOwnCase = (question: string): boolean =>
  /\bmon dossier\b|\bma demande\b|\bmon compte\b/.test(question);

const findEntry = (question: string): KnowledgeEntry | undefined =>
  KNOWLEDGE_BASE.find((entry) =>
    entry.keywords.some((keyword) => question.includes(normalise(keyword))),
  );

export const mockChatbotService: ChatbotService = {
  sendMessage: (message, context?: ChatbotContext): Promise<ChatbotResponse> => {
    const question = normalise(message);

    /*
     * Context is *used*, not invented. A personal question with no case attached
     * gets the limit stated plainly; the same question with a case attached
     * still gets a general answer here, because a keyword mock has no business
     * narrating a dossier. Grounding a personal answer in real case data is the
     * backend's job, and it is the reason `context` is in the signature at all.
     */
    if (isAboutTheirOwnCase(question) && !context?.caseId) {
      const general = findEntry(question);

      return delay(
        general
          ? {
              answer: `${NO_CASE_CONTEXT_PREFIX} Voici toutefois ce qui s’applique de manière générale. ${general.answer}`,
              sources: general.sources,
            }
          : NO_CASE_CONTEXT,
      );
    }

    return delay(findEntry(question) ?? NO_ANSWER);
  },
};
