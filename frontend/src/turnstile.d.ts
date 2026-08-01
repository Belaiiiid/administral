/**
 * Ambient type declarations for the Cloudflare Turnstile global.
 *
 * The `turnstile` object is injected by the Turnstile script loaded at
 * runtime. These declarations let TypeScript know about it without
 * installing a third-party types package.
 */

interface TurnstileRenderOptions {
  sitekey: string;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact';
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
}

interface TurnstileInstance {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
  getResponse: (widgetId: string) => string | undefined;
}

interface Window {
  turnstile?: TurnstileInstance;
}
