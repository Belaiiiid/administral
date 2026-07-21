import {
  Contrast,
  Eye,
  Keyboard,
  Mic,
  Sparkles,
  Type,
  Volume2,
  UserRoundCheck,
  type LucideIcon,
} from 'lucide-react';

import type { AccessibilityPreferences } from '@/types';

export interface AccessibilityOption {
  key: keyof AccessibilityPreferences;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Whether toggling this option changes the rendering immediately. */
  affectsRendering: boolean;
}

/**
 * The eight options from the accessibility mockup, shared by the onboarding
 * screen and the profile settings page so the two can never drift apart.
 */
export const ACCESSIBILITY_OPTIONS: AccessibilityOption[] = [
  {
    key: 'voiceAssistant',
    label: 'Assistant vocal',
    description: 'L’assistant vous guide oralement à travers chaque étape de votre dossier.',
    icon: UserRoundCheck,
    affectsRendering: false,
  },
  {
    key: 'voiceInput',
    label: 'Saisie vocale',
    description: 'Dictez vos réponses et informations plutôt que de les taper au clavier.',
    icon: Mic,
    affectsRendering: false,
  },
  {
    key: 'speechSynthesis',
    label: 'Synthèse vocale',
    description: 'Lecture automatique des textes et messages d’aide par une voix système.',
    icon: Volume2,
    affectsRendering: false,
  },
  {
    key: 'largeText',
    label: 'Texte agrandi',
    description: 'Augmente la taille de la police de 20 % pour une meilleure lisibilité.',
    icon: Type,
    affectsRendering: true,
  },
  {
    key: 'highContrast',
    label: 'Contraste élevé',
    description: 'Optimise les couleurs pour un contraste maximal entre le texte et le fond.',
    icon: Contrast,
    affectsRendering: true,
  },
  {
    key: 'keyboardNavigation',
    label: 'Navigation clavier',
    description: 'Rend les indicateurs de focus plus visibles pour la navigation sans souris.',
    icon: Keyboard,
    affectsRendering: true,
  },
  {
    key: 'simplifiedInterface',
    label: 'Interface simplifiée',
    description: 'Réduit les animations et les éléments non essentiels pour limiter la charge cognitive.',
    icon: Sparkles,
    affectsRendering: true,
  },
  {
    key: 'screenReaderOptimised',
    label: 'Lecteur d’écran',
    description: 'Optimise le code source pour une lecture fluide par NVDA, JAWS ou VoiceOver.',
    icon: Eye,
    affectsRendering: false,
  },
];
