import { Mail } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { authService } from '@/services/authService';

/**
 * Request a password-reset link.
 *
 * The success state is shown for **any** submitted address, because the backend
 * answers identically whether or not an account exists (see
 * `service.request_password_reset`). Rendering "no such account" here would
 * re-introduce, in the UI, exactly the enumeration oracle the API refuses to
 * be — so this page has no such branch to render.
 */
export default function ForgotPasswordPage() {
  useDocumentTitle('Mot de passe oublié');

  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await authService.requestPasswordReset(email);
      setSent(true);
    } catch (cause) {
      // Only a transport/server failure reaches here — an unknown address is a
      // 200 like any other.
      setError(
        cause instanceof Error
          ? cause.message
          : 'La demande n’a pas pu être envoyée. Réessayez dans un instant.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (sent) {
    return (
      <Card>
        <CardContent className="p-6 sm:p-8">
          <h1 className="mb-4 text-headline-md text-on-surface">Vérifiez votre messagerie</h1>
          <Alert tone="success" className="mb-6">
            <AlertDescription>
              Si un compte est associé à <strong>{email}</strong>, un lien de réinitialisation
              vient de lui être envoyé.
            </AlertDescription>
          </Alert>
          <p className="mb-6 text-body-sm text-on-surface-variant">
            Le lien est valable une heure et ne peut servir qu’une seule fois. Pensez à consulter
            vos courriers indésirables.
          </p>
          <Button asChild block size="lg">
            <Link to={ROUTES.login}>Retour à la connexion</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 sm:p-8">
        <h1 className="mb-2 text-headline-md text-on-surface">Mot de passe oublié</h1>
        <p className="mb-6 text-body-md text-on-surface-variant">
          Indiquez l’adresse e-mail de votre compte. Nous vous enverrons un lien pour choisir un
          nouveau mot de passe.
        </p>

        {error && (
          <Alert tone="error" className="mb-5">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Adresse e-mail</Label>
            <Input
              id="email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="nom@exemple.fr"
              startIcon={<Mail />}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <Button type="submit" block size="lg" disabled={isSubmitting || email.trim() === ''}>
            {isSubmitting ? 'Envoi…' : 'Envoyer le lien'}
          </Button>
        </form>

        <div className="mt-8 border-t border-border pt-6 text-center">
          <p className="text-body-sm text-on-surface-variant">
            Vous vous souvenez de votre mot de passe ?{' '}
            <Link to={ROUTES.login} className="text-primary hover:underline">
              Se connecter
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
