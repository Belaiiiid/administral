/**
 * RGAA: a keyboard user must be able to bypass the navigation.
 * Visually hidden until focused.
 */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-3 focus:text-label-md focus:text-primary-foreground"
    >
      Aller au contenu principal
    </a>
  );
}
