import type { NavigateFunction } from 'react-router-dom';
import type { VoiceIntent, VoicePageAction, VoicePageField, TextToSpeechProvider } from '../types';
import { ROUTES } from '@/app/router/paths';

export interface ExecutorDeps {
  navigate: NavigateFunction;
  tts: TextToSpeechProvider;
  actions: VoicePageAction[];
  fields: VoicePageField[];
  isWaitingForConfirmation: boolean;
  setWaitingForConfirmation: (value: boolean) => void;
  pendingAction: VoicePageAction | null;
  setPendingAction: (action: VoicePageAction | null) => void;
  readableText: string;
}

export class VoiceCommandExecutor {
  execute(intent: VoiceIntent, deps: ExecutorDeps): void {
    const {
      navigate,
      tts,
      actions,
      fields,
      isWaitingForConfirmation,
      setWaitingForConfirmation,
      pendingAction,
      setPendingAction,
      readableText,
    } = deps;

    // 1. Handle confirmation flow
    if (isWaitingForConfirmation && pendingAction) {
      if (intent.type === 'confirm') {
        tts.speak("Action confirmée. J'exécute.");
        setWaitingForConfirmation(false);
        setPendingAction(null);
        // Execute the confirmed intent
        this.execute(pendingAction.intent, { ...deps, isWaitingForConfirmation: false, pendingAction: null });
        return;
      }
      if (intent.type === 'cancel') {
        tts.speak('Action annulée.');
        setWaitingForConfirmation(false);
        setPendingAction(null);
        return;
      }
      // Any other intent while waiting for confirmation is ignored or prompts the user again
      tts.speak("J'attends ta confirmation. Dis oui pour confirmer ou non pour annuler.");
      return;
    }

    // 2. Normal intents
    switch (intent.type) {
      case 'navigate': {
        if (intent.target === 'home') {
          tts.speak("Navigation vers l'accueil.");
          navigate(ROUTES.portal);
        } else if (intent.target === 'documents') {
          tts.speak('Navigation vers mes documents.');
          navigate(ROUTES.documents);
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
          field.setValue(intent.value);
          tts.speak(`J'ai rempli le champ avec la valeur : ${intent.value}`);
        } else {
          tts.speak("Désolé, je ne trouve pas le champ demandé.");
        }
        break;
      }

      case 'sensitive_action': {
        const action = actions.find((a) => a.id === intent.actionId);
        if (action) {
          if (action.sensitive) {
            tts.speak(`${action.description}. Confirme-tu cette action ? Dis oui ou non.`);
            setPendingAction(action);
            setWaitingForConfirmation(true);
          } else {
            this.execute(action.intent, deps);
          }
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
