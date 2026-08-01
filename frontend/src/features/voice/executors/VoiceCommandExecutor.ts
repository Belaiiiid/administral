import type { NavigateFunction } from 'react-router-dom';
import type { VoiceIntent, VoicePageAction, VoicePageField, TextToSpeechProvider } from '../types';
import { ROUTES } from '@/app/router/paths';

/** Intents that change application state and must be confirmed before execution (except on login page). */
const CONFIRMABLE_INTENTS: VoiceIntent['type'][] = ['navigate', 'fill_field', 'click_action', 'sensitive_action'];

/** Human-readable confirmation prompt for each intent type/target. */
function buildConfirmationPrompt(intent: VoiceIntent, actions: VoicePageAction[], fields: VoicePageField[]): string {
  switch (intent.type) {
    case 'navigate': {
      const labels: Record<string, string> = {
        home: "la page d'accueil",
        documents: 'la page de mes documents',
        dossier: 'la page de dépôt de dossier',
      };
      return `Vous confirmez vouloir aller à ${labels[intent.target] ?? intent.target} ?`;
    }
    case 'fill_field': {
      const field = fields.find(f => f.fieldId === intent.fieldId);
      const label = field?.labels[0] ?? intent.fieldId;
      if (field?.sensitive) {
        return `Vous confirmez vouloir remplir le champ ${label} ?`;
      }
      return `Vous confirmez vouloir remplir le champ ${label} avec la valeur : ${intent.value} ?`;
    }
    case 'click_action':
    case 'sensitive_action': {
      const action = actions.find(a => a.id === intent.actionId);
      return action
        ? `${action.description}. Confirmez-vous cette action ? Dites oui ou non.`
        : "Confirmez-vous cette action ? Dites oui ou non.";
    }
    default:
      return "Confirmez-vous cette action ? Dites oui ou non.";
  }
}

export interface ExecutorDeps {
  navigate: NavigateFunction;
  tts: TextToSpeechProvider;
  actions: VoicePageAction[];
  fields: VoicePageField[];
  actionCallbacks: Record<string, () => void>;
  isWaitingForConfirmation: boolean;
  setWaitingForConfirmation: (value: boolean) => void;
  pendingAction: VoicePageAction | null;
  setPendingAction: (action: VoicePageAction | null) => void;
  pendingIntent: VoiceIntent | null;
  setPendingIntent: (intent: VoiceIntent | null) => void;
  readableText: string;
  /** When true, confirmation prompts are skipped (login page: avoids speaking passwords). */
  skipConfirmation?: boolean;
}

export class VoiceCommandExecutor {
  execute(intent: VoiceIntent, deps: ExecutorDeps): void {
    const {
      tts,
      actions,
      fields,
      isWaitingForConfirmation,
      setWaitingForConfirmation,
      pendingAction,
      setPendingAction,
      pendingIntent,
      setPendingIntent,
      skipConfirmation,
    } = deps;

    // ─── Handle confirmation/cancellation for a pending intent ───────────────
    if (isWaitingForConfirmation && (pendingIntent || pendingAction)) {
      if (intent.type === 'confirm') {
        tts.speak("Action confirmée. J'exécute.");
        setWaitingForConfirmation(false);

        // Execute the pending intent (generic) or legacy pending action
        if (pendingIntent) {
          setPendingIntent(null);
          this._execute(pendingIntent, deps);
        } else if (pendingAction) {
          setPendingAction(null);
          this._execute(pendingAction.intent, { ...deps, isWaitingForConfirmation: false, pendingIntent: null, pendingAction: null });
        }
        return;
      }
      if (intent.type === 'cancel') {
        tts.speak('Action annulée.');
        setWaitingForConfirmation(false);
        setPendingIntent(null);
        setPendingAction(null);
        return;
      }
      tts.speak("J'attends ta confirmation. Dis oui pour confirmer ou non pour annuler.");
      return;
    }

    // ─── Intercept confirmable intents (skip on login page) ──────────────────
    const isConfirmable = CONFIRMABLE_INTENTS.includes(intent.type);
    if (isConfirmable && !skipConfirmation) {
      const prompt = buildConfirmationPrompt(intent, actions, fields);
      setPendingIntent(intent);
      setWaitingForConfirmation(true);
      tts.speak(prompt);
      return;
    }

    // ─── Direct execution (no confirmation required) ──────────────────────────
    this._execute(intent, deps);
  }

  /** Internal direct execution without confirmation gate. */
  private _execute(intent: VoiceIntent, deps: ExecutorDeps): void {
    const { navigate, tts, actions, fields, actionCallbacks, readableText } = deps;

    switch (intent.type) {
      case 'navigate': {
        if (intent.target === 'home') {
          tts.speak("Navigation vers l'accueil.");
          navigate(ROUTES.portal);
        } else if (intent.target === 'documents') {
          tts.speak('Navigation vers mes documents.');
          navigate(ROUTES.documents);
        } else if (intent.target === 'dossier') {
          tts.speak('Navigation vers le dépôt de dossier.');
          navigate(ROUTES.dossier);
        }
        break;
      }
      case 'read_page': {
        if (readableText) {
          tts.speak(readableText);
        } else {
          tts.speak("Il n'y a pas de texte à lire sur cette page.");
        }
        break;
      }
      case 'stop_speaking': {
        tts.stop();
        break;
      }
      case 'explain_actions': {
        if (actions && actions.length > 0) {
          const actionDescriptions = actions.map((a) => a.description).join('. ');
          tts.speak(`Sur cette page, tu peux faire les actions suivantes : ${actionDescriptions}`);
        } else {
          tts.speak("Aucune action spécifique n'est déclarée sur cette page.");
        }
        break;
      }
      case 'fill_field': {
        const field = fields.find((f) => f.fieldId === intent.fieldId);
        if (field) {
          let cleanedValue = intent.value;

          if (field.fieldId === 'email') {
            // Replace spoken "arobase" or "at" with "@"
            cleanedValue = cleanedValue
              .replace(/\s+arobase\s+/gi, '@')
              .replace(/arobase/gi, '@')
              .replace(/\s+at\s+/gi, '@')
              .replace(/([^a-zA-Z0-9])at([^a-zA-Z0-9])/gi, '$1@$2');
            
            // Replace spoken "point" or "dot" with "."
            cleanedValue = cleanedValue
              .replace(/\s+point\s+/gi, '.')
              .replace(/point/gi, '.')
              .replace(/\s+dot\s+/gi, '.')
              .replace(/dot/gi, '.');

            // Strip all whitespace characters from email
            cleanedValue = cleanedValue.replace(/\s+/g, '');

            // Auto-correct missing "@" symbols in email addresses
            if (!cleanedValue.includes('@')) {
              const domains = ['gmail', 'yahoo', 'hotmail', 'outlook', 'orange', 'laposte', 'sfr', 'free', 'live'];
              let matched = false;
              for (const dom of domains) {
                const idx = cleanedValue.toLowerCase().indexOf(dom);
                if (idx > 0) {
                  if (cleanedValue[idx - 1] === '.') {
                    // Replace dot before domain with "@" (e.g. fedi.gmail.com -> fedi@gmail.com)
                    cleanedValue = cleanedValue.substring(0, idx - 1) + '@' + cleanedValue.substring(idx);
                  } else {
                    // Insert "@" before domain (e.g. fedigmail.com -> fedi@gmail.com)
                    cleanedValue = cleanedValue.substring(0, idx) + '@' + cleanedValue.substring(idx);
                  }
                  matched = true;
                  break;
                }
              }

              // Fallback: If no known domain matched, but we have at least 2 dots (e.g. user.domain.com)
              if (!matched) {
                const parts = cleanedValue.split('.');
                if (parts.length >= 3) {
                  const domainParts = parts.slice(-2);
                  const userParts = parts.slice(0, -2);
                  cleanedValue = userParts.join('.') + '@' + domainParts.join('.');
                }
              }
            }
          } else if (field.fieldId === 'nir') {
            // Keep only digits for NIR
            cleanedValue = cleanedValue.replace(/\D/g, '');
          } else if (field.sensitive) {
            // For sensitive fields (like passwords): strip accidental spaces,
            // but preserve spaces if explicitly dictated as "espace" or "space".
            cleanedValue = cleanedValue
              .split(/\s*(?:espace|space)\s*/i)
              .map((chunk) => chunk.replace(/\s+/g, ''))
              .join(' ');
          }

          field.setValue(cleanedValue);

          // Do NOT speak the value if the field is sensitive (e.g. password)
          if (field.sensitive) {
            tts.speak(`J'ai rempli le champ ${field.labels[0] ?? intent.fieldId}.`);
          } else {
            tts.speak(`J'ai rempli le champ avec la valeur : ${cleanedValue}`);
          }
        } else {
          tts.speak("Désolé, je ne trouve pas le champ demandé.");
        }
        break;
      }
      case 'click_action': {
        const callback = actionCallbacks[intent.actionId];
        if (callback) {
          callback();
          tts.speak("C'est fait.");
        } else {
          tts.speak("Désolé, cette action n'est pas disponible.");
        }
        break;
      }
      case 'sensitive_action': {
        // sensitive_action goes through confirmation gate above.
        // If we reach here it means confirmation was bypassed (skipConfirmation).
        const action = actions.find((a) => a.id === intent.actionId);
        if (action) {
          this._execute(action.intent, deps);
        }
        break;
      }
      case 'unknown': {
        tts.speak("Désolé, je n'ai pas compris cette commande.");
        break;
      }
      default:
        break;
    }
  }
}
