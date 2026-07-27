import { Eye, EyeOff, Lock } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { authService } from '@/services/authService';

/** Mirrors the backend's `min_length=8`, so the mismatch is caught before a round trip. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Choose a new password, authorised by the token in the emailed link.
 *
 * No session is created on success: the user is sent to the login page to sign
 * in with the password they just chose. Signing them in straight from a link
 * that arrived by email would make possession of that email a session.
 */
export default function ResetPasswordPage() {
  useDocumentTitle('Nouveau mot de passe');

  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirmation.length > 0 && password !== confirmation;
  const canSubmit =
    password.length >= MIN_PASSWORD_LENGTH && password === confirmation && !isSubmitting;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await authService.resetPassword({ token, password });
      navigate(ROUTES.login, {
        replace: true,
        state: { notice: 'Votre mot de passe a été mis à jour. Vous pouvez vous connecter.' },
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Le lien est invalide ou a expiré. Demandez-en un nouveau.',
      );
      setIsSubmitting(false);
    }
  };

  // A link opened without its query string cannot be redeemed. Say so
  // immediately rather than after a submission that is certain to fail.
  if (token === '') {
    return (
      <Card>
        <CardContent className="p-6 sm:p-8">
          <h1 className="mb-4 text-headline-md text-on-surface">Lien incomplet</h1>
          <Alert tone="error" className="mb-6">
            <AlertDescription>
              Ce lien de réinitialisation est incomplet. Copiez-le entièrement depuis votre
              messagerie, ou demandez-en un nouveau.
            </AlertDescription>
          </Alert>
          <Button asChild block size="lg">
            <Link to={ROUTES.forgotPassword}>Demander un nouveau lien</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 sm:p-8">
        <h1 className="mb-2 text-headline-md text-on-surface">Nouveau mot de passe</h1>
        <p className="mb-6 text-body-md text-on-surface-variant">
          Choisissez un mot de passe d’au moins {MIN_PASSWORD_LENGTH} caractères.
        </p>

        {error && (
          <Alert tone="error" className="mb-5">
            <AlertDescription>
              {error}{' '}
              <Link to={ROUTES.forgotPassword} className="underline">
                Demander un nouveau lien
              </Link>
            </AlertDescription>
          </Alert>
        )}

        <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Nouveau mot de passe</Label>
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="new-password"
              startIcon={<Lock />}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              aria-describedby={tooShort ? 'password-error' : undefined}
              endAdornment={
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  className="rounded p-1 text-on-surface-variant hover:text-on-surface"
                >
                  {showPassword ? (
                    <EyeOff className="size-5" aria-hidden="true" />
                  ) : (
                    <Eye className="size-5" aria-hidden="true" />
                  )}
                </button>
              }
            />
            {tooShort && (
              <p id="password-error" className="text-body-sm text-destructive">
                {MIN_PASSWORD_LENGTH} caractères minimum.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmation">Confirmer le mot de passe</Label>
            <Input
              id="confirmation"
              type={showPassword ? 'text' : 'password'}
              name="confirmation"
              autoComplete="new-password"
              startIcon={<Lock />}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
              aria-describedby={mismatch ? 'confirmation-error' : undefined}
            />
            {mismatch && (
              <p id="confirmation-error" className="text-body-sm text-destructive">
                Les deux mots de passe ne correspondent pas.
              </p>
            )}
          </div>

          <Button type="submit" block size="lg" disabled={!canSubmit}>
            {isSubmitting ? 'Enregistrement…' : 'Définir le mot de passe'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
