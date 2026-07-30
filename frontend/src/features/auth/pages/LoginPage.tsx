import { Eye, EyeOff, Loader2, Lock, Mail, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { FranceConnectButton } from '@/features/auth/components/FranceConnectButton';
import Turnstile from '@/components/shared/Turnstile';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { authService } from '@/services/authService';
import { useSessionStore } from '@/store/sessionStore';

interface LocationState {
  from?: { pathname: string };
  notice?: string;
}

export default function LoginPage() {
  useDocumentTitle('Connexion');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const login = useSessionStore((state) => state.login);
  const isLoggingIn = useSessionStore((state) => state.isLoggingIn);
  const error = useSessionStore((state) => state.error);
  const errorCode = useSessionStore((state) => state.errorCode);

  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const notice = (location.state as LocationState | null)?.notice;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setResent(false);
    try {
      const role = await login({ email, password, turnstileToken: turnstileToken ?? undefined });
      if (role === 'admin') {
        navigate(ROUTES.admin, { replace: true });
      } else if (role === 'agent') {
        navigate(ROUTES.agent, { replace: true });
      } else {
        // After login, take citizens to voice onboarding
        navigate(ROUTES.voiceOnboarding, { replace: true });
      }
    } catch {
      // error is in the store
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await authService.resendVerificationPublic(email);
      setResent(true);
    } catch {
      // ignore
    } finally {
      setResending(false);
    }
  };

  const isEmailNotVerified = errorCode === 'EMAIL_NOT_VERIFIED';

  return (
    <Card className="shadow-soft">
      <CardContent className="p-6 sm:p-8">
        <div className="mb-8 text-center">
          <h1 className="text-headline-md text-on-surface">Connexion</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Accédez à votre espace personnel
          </p>
        </div>

        <FranceConnectButton />
        <p className="mt-3 text-center">
          <Link
            to="/franceconnect"
            className="text-body-sm text-on-surface-variant hover:underline"
          >
            Qu'est-ce que FranceConnect ?
          </Link>
        </p>

        <div className="my-8 flex items-center gap-4">
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
          <span className="text-label-sm text-on-surface-variant">OU</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>

        {notice && (
          <Alert tone="success" className="mb-5">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        {isEmailNotVerified ? (
          <Alert tone="warning" className="mb-5">
            <AlertDescription>
              <span className="block">
                Votre adresse e-mail n'a pas encore été confirmée. Vérifiez votre
                messagerie (pensez aux courriers indésirables).
              </span>
              {resent ? (
                <span className="mt-2 block font-medium text-success">
                  Un nouveau lien de confirmation vous a été envoyé si votre
                  adresse est associée à un compte non confirmé.
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  {resending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="size-4" aria-hidden="true" />
                  )}
                  Renvoyer le lien de confirmation
                </button>
              )}
            </AlertDescription>
          </Alert>
        ) : error ? (
          <Alert tone="error" className="mb-5">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

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

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="password">Mot de passe</Label>
              <Link
                to={ROUTES.forgotPassword}
                className="text-body-sm text-on-surface-variant hover:underline"
              >
                Oublié ?
              </Link>
            </div>
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              startIcon={<Lock />}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              endAdornment={
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={
                    showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                  }
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
          </div>

          <div className="flex items-center gap-3">
            <Checkbox id="remember" />
            <Label htmlFor="remember" className="cursor-pointer font-normal">
              Se souvenir de moi
            </Label>
          </div>

          <Turnstile
            onVerify={(token) => setTurnstileToken(token)}
            onExpire={() => setTurnstileToken(null)}
          />

          <Button type="submit" block size="lg" disabled={isLoggingIn || !turnstileToken}>
            {isLoggingIn ? 'Connexion…' : 'Se connecter'}
          </Button>
        </form>

        <div className="mt-8 border-t border-border pt-6 text-center">
          <p className="text-body-sm text-on-surface-variant">
            Vous n'avez pas de compte ?{' '}
            <Link to={ROUTES.register} className="font-medium text-primary hover:underline">
              Créer un espace personnel
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
