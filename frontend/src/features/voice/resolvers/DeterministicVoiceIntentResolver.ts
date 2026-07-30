import type { VoiceIntent, VoicePageField, VoicePageAction } from '../types';

const HOME_PATTERNS = [
  "aller a l'accueil",
  "aller a laccueil",
  "allez a l'accueil",
  "allez a laccueil",
  "allez sur l'accueil",
  'accueil',
  'retour accueil',
  "retour a l'accueil",
  'retour a laccueil',
  'page accueil',
  "page d'accueil",
  "aller sur l'accueil",
  "ramene moi a l'accueil",
  "va a l'accueil",
  'va a laccueil',
  'go home',
  'home',
  'tableau de bord',
  'dashboard',
];

const DOCUMENTS_PATTERNS = [
  'ouvrir mes documents',
  'mes documents',
  'documents',
  'voir mes documents',
  'afficher mes documents',
  'aller aux documents',
  'aller sur mes documents',
  'ouvrir les documents',
  'mes fichiers',
  'voir mes fichiers',
  'afficher mes fichiers',
  'ouvrir mes fichiers',
  'fichiers',
  'consulter mes documents',
  'consulter mes fichiers',
  'section documents',
];

const DOSSIER_PATTERNS = [
  'deposer un dossier',
  'deposer mon dossier',
  'envoyer un dossier',
  'envoyer mon dossier',
  'mon dossier',
  'dossier',
  'aller au dossier',
  'aller sur le dossier',
  'ouvrir mon dossier',
  'soumettre un dossier',
  'soumettre mon dossier',
];

const READ_PAGE_PATTERNS = [
  'lire la page',
  'lire page',
  'lecture',
  'lis la page',
  'lis cette page',
  'lire cette page',
  'lire le contenu',
  'lis le contenu',
  'describe la page',
  'decris la page',
  "qu'est ce qu'il y a sur cette page",
  "qu'est ce qu'il y a ici",
  'que vois-je ici',
  'que vois je ici',
  'lire',
  'lire tout',
  'lit la page',
];

const STOP_SPEAKING_PATTERNS = [
  'arrete de parler',
  'arreter',
  'stop',
  'silence',
  'tais-toi',
  'tais toi',
  'ferme-la',
  'ferme la',
  'chut',
  'couper le son',
  'coupe le son',
  'stoppe',
  'stoppe-toi',
  'arrete',
  'ca suffit',
  'assez',
  'ok merci',
  'merci stop',
];

/** Prefixes that indicate the user wants to trigger a page action by voice. */
const ACTION_TRIGGER_PREFIXES = [
  'clique sur ',
  'appuie sur ',
  'lance ',
  'execute ',
  'effectue ',
  'valide ',
  'fais ',
  'demarre ',
];

const YES_WORDS = ['oui', 'ouais', 'yes', 'confirme', 'valide', 'ok', 'parfait', "d accord", 'absolument', 'exactement'];
const NO_WORDS = ['non', 'no', 'annule', 'pas ok', 'jamais', 'surtout pas', 'arrete', 'stop'];

export class DeterministicVoiceIntentResolver {
  resolve(
    transcript: string,
    activeFields: VoicePageField[] = [],
    isWaitingForConfirmation = false,
    activeActions: VoicePageAction[] = [],
  ): VoiceIntent {
    const normalized = this.normalize(transcript);

    if (isWaitingForConfirmation) {
      if (this.isYes(normalized)) return { type: 'confirm' };
      if (this.isNo(normalized)) return { type: 'cancel' };
    }

    const wakeWords = ['assistant', 'jarvis'];
    let commandText = normalized;
    for (const wakeWord of wakeWords) {
      if (normalized.startsWith(wakeWord + ' ')) {
        commandText = normalized.substring(wakeWord.length).trim();
        break;
      }
    }

    if (!commandText) {
      return { type: 'unknown', transcript };
    }

    if (HOME_PATTERNS.includes(commandText)) return { type: 'navigate', target: 'home' };
    if (DOCUMENTS_PATTERNS.includes(commandText)) return { type: 'navigate', target: 'documents' };
    if (DOSSIER_PATTERNS.includes(commandText)) return { type: 'navigate', target: 'dossier' };
    if (READ_PAGE_PATTERNS.includes(commandText)) return { type: 'read_page' };
    if (STOP_SPEAKING_PATTERNS.includes(commandText)) return { type: 'stop_speaking' };

    const explainPatterns = [
      "qu'est-ce que je peux faire ici",
      'quest ce que je peux faire ici',
      "qu'est ce que je peux faire ici",
      'aide',
      'actions',
      'que puis-je faire',
      'que puis je faire',
      'quelles sont les actions',
      'quelles actions',
      'que faire',
      'help',
      'aide moi',
      'aide-moi',
      'guide-moi',
      'guide moi',
      'comment ca marche',
      "comment fonctionne l'assistant",
      'que peux-tu faire',
      'que peux tu faire',
      'tes commandes',
      'liste des commandes',
    ];
    if (explainPatterns.includes(commandText)) return { type: 'explain_actions' };

    if (this.isYes(commandText)) return { type: 'confirm' };
    if (this.isNo(commandText)) return { type: 'cancel' };

    // ─── Action-trigger phrases ("clique sur X", "valide X", etc.) ───────────
    for (const prefix of ACTION_TRIGGER_PREFIXES) {
      if (commandText.startsWith(prefix)) {
        const actionLabel = commandText.substring(prefix.length).trim();
        const matchedAction = activeActions.find(
          (a) => this.normalize(a.label) === actionLabel || this.normalize(a.description) === actionLabel,
        );
        if (matchedAction) {
          return { type: 'sensitive_action', actionId: matchedAction.id };
        }
      }
    }

    // ─── Field filling ────────────────────────────────────────────────────────
    for (const field of activeFields) {
      for (const label of field.labels) {
        const normalizedLabel = this.normalize(label);
        const labelIndex = commandText.indexOf(normalizedLabel);
        if (labelIndex !== -1) {
          let afterLabel = commandText.substring(labelIndex + normalizedLabel.length).trim();
          const LINKS = ['est ', 'de ', 'vaut ', 'egale ', 'c est ', "c'est "];
          for (const link of LINKS) {
            if (afterLabel.startsWith(link)) {
              afterLabel = afterLabel.substring(link.length).trim();
              break;
            }
          }
          if (afterLabel) {
            return { type: 'fill_field', fieldId: field.fieldId, value: afterLabel };
          }
        }
      }
    }

    return { type: 'unknown', transcript };
  }

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s'\.\-_@/]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isYes(text: string): boolean {
    return YES_WORDS.includes(text);
  }

  private isNo(text: string): boolean {
    return NO_WORDS.includes(text);
  }
}
