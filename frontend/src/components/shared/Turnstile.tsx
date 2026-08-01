import { useEffect, useRef, useCallback } from 'react';

/**
 * Cloudflare Turnstile widget — drop-in captcha for auth forms.
 *
 * Loads the Turnstile script lazily on first mount and renders the widget into
 * a container `div`. When the challenge is solved, `onVerify` delivers the
 * token; when it expires, `onExpire` lets the parent clear its state so the
 * submit button becomes disabled again.
 *
 * The site key is read from `VITE_TURNSTILE_SITE_KEY` — set it in
 * `frontend/.env`.
 */

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

interface TurnstileProps {
  /** Called with the Turnstile token once the challenge is solved. */
  onVerify: (token: string) => void;
  /** Called when a previously solved challenge expires. */
  onExpire?: () => void;
  /** Visual theme — follows the OS preference if omitted. */
  theme?: 'light' | 'dark' | 'auto';
  /** Widget size. */
  size?: 'normal' | 'compact';
}

/* ------------------------------------------------------------------ */
/* Script loader — shared across all instances                        */
/* ------------------------------------------------------------------ */

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    // Already loaded (e.g. injected manually in index.html).
    if (window.turnstile) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Turnstile script'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function Turnstile({
  onVerify,
  onExpire,
  theme = 'light',
  size = 'normal',
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Stable callback refs so the widget doesn't re-render on every parent render.
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || !SITE_KEY) return;

    // Avoid duplicate renders.
    if (widgetIdRef.current !== null) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      theme,
      size,
      callback: (token: string) => onVerifyRef.current(token),
      'expired-callback': () => onExpireRef.current?.(),
    });
  }, [theme, size]);

  useEffect(() => {
    if (!SITE_KEY) {
      console.warn(
        '[Turnstile] VITE_TURNSTILE_SITE_KEY is not set — captcha widget will not render.',
      );
      // Auto-verify in development so the submit button is not blocked
      onVerifyRef.current('dev-bypass-token');
      return;
    }

    loadTurnstileScript()
      .then(renderWidget)
      .catch((err) => console.error('[Turnstile] Script load failed:', err));

    return () => {
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [renderWidget]);

  // Nothing to show when the key is missing — dev mode without Turnstile.
  if (!SITE_KEY) return null;

  return (
    <div className="flex justify-center rounded-lg border border-border bg-surface-low p-3">
      <div ref={containerRef} />
    </div>
  );
}
