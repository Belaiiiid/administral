import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Our typographic scale replaces Tailwind's default font sizes with custom keys
 * (`text-label-md`, `text-display`, …). tailwind-merge cannot infer those, so it
 * would classify them as text *colours* and silently drop a real colour class —
 * e.g. `text-label-sm` from a button size wiping out `text-primary-foreground`
 * from its variant. Declaring the scale keeps both groups independent.
 */
const FONT_SIZES = [
  'display',
  'headline-lg',
  'headline-lg-mobile',
  'headline-md',
  'body-lg',
  'body-md',
  'body-sm',
  'label-md',
  'label-sm',
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...FONT_SIZES] }],
    },
  },
});

/** Merge conditional class names, resolving Tailwind conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as euros, French locale. */
export function formatEuros(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

/** Format an ISO date as a long French date (e.g. « 12 mai 2024 »). */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

/** Initials fallback for avatars (« Jean Dupont » → « JD »). */
export function getInitials(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
