import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { authService } from '@/services/authService';
import { useSessionStore } from '@/store/sessionStore';

type Status = 'verifying' | 'success' | 'error';

/**
 * Landing page for the confirmation link.
 *
 * Redeems the token on mount — the user clicked a link, so there is nothing
 * left for them to confirm with a second button. Public: the link is opened
 * from a mail client, usually in a browser with no session.
 */
export default function VerifyEmailPage() {
  useDocumentTitle('Confirmation de l’adresse e-mail');

  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [status, setStatus] = useState<Status>(token === '' ? 'error' : 'verifying');
  const [message, setMessage] = useState<string>(
    token === '' ? 'Ce lien de confirmation est incomplet.' : '',
  );

  const isAuthenticated = useSessionStore((state) => state.isAuthenticated);
  const bootstrap = useSessionStore((state) => state.bootstrap);

  // StrictMode mounts effects twice in development. Without this guard the
  // token would be redeemed on the first pass and rejected as already-used on
  // the second, showing an error for a verification that actually succeeded.
  const redeemed = useRef(false);

  useEffect(() => {
    if (token === '' || redeemed.current) return;
    redeemed.current = true;

    authService
      .verifyEmail(token)
      .then(() => {
        setStatus('success');
        // Refresh the cached identity so `isVerified` is current wherever the
        // UI reads it — otherwise the banner would keep nagging a verified user
        // until their next sign-in.
        if (isAuthenticated) void bootstrap();
      })
      .catch((cause: unknown) => {
        setStatus('error');
        setMessage(
          cause instanceof Error
            ? cause.message
            : 'Ce lien de confirmation est invalide ou a expiré.',
        );
      });
  }, [token, isAuthenticated, bootstrap]);

  return (
    <Card>
      <CardContent className="p-6 text-center sm:p-8">
        {status === 'verifying' && (
          <>
            <h1 className="mb-3 text-headline-md text-on-surface">Confirmation en cours…</h1>
            <p className="text-body-md text-on-surface-variant" role="status">
              Nous vérifions votre lien de confirmation.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2
              className="mx-auto mb-4 size-12 text-success"
              aria-hidden="true"
            />
            <h1 className="mb-3 text-headline-md text-on-surface">Adresse confirmée</h1>
            <p className="mb-8 text-body-md text-on-surface-variant">
              Votre adresse e-mail est confirmée. Vous pouvez utiliser votre espace personnel.
            </p>
            <Button asChild block size="lg">
              <Link to={isAuthenticated ? ROUTES.portal : ROUTES.login}>
                {isAuthenticated ? 'Accéder à mon espace' : 'Se connecter'}
              </Link>
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="mx-auto mb-4 size-12 text-destructive" aria-hidden="true" />
            <h1 className="mb-3 text-headline-md text-on-surface">Confirmation impossible</h1>
            <Alert tone="error" className="mb-6 text-left">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
            <p className="mb-8 text-body-sm text-on-surface-variant">
              Connectez-vous à votre espace pour demander un nouveau lien de confirmation.
            </p>
            <Button asChild block size="lg">
              <Link to={isAuthenticated ? ROUTES.portal : ROUTES.login}>
                {isAuthenticated ? 'Accéder à mon espace' : 'Se connecter'}
              </Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
