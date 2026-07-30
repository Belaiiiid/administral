import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { FranceConnectButton } from '@/features/auth/components/FranceConnectButton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useSessionStore } from '@/store/sessionStore';
import { useVoiceStore } from '@/features/voice/store/voiceStore';

interface LocationState {
  from?: { pathname: string };
  /** Set by the reset flow after a successful password change. */
  notice?: string;
}

/**
 * Login. Authenticates against the auth module and routes the user to their
 * journey: agents to the back-office, citizens to their portal (or back to the
 * page a guard bounced them from).
 */
export default function LoginPage() {
  useDocumentTitle('Connexion');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const login = useSessionStore((state) => state.login);
  const isLoggingIn = useSessionStore((state) => state.isLoggingIn);
  const error = useSessionStore((state) => state.error);

  const navigate = useNavigate();
  const location = useLocation();
  const notice = (location.state as LocationState | null)?.notice;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const role = await login({ email, password });
      // An agent always lands in the back-office. A citizen returns where a
      // guard sent them from, or their portal by default.
      if (role === 'agent') {
        navigate(ROUTES.agent, { replace: true });
      } else {
        // After login, take citizens to voice onboarding if they haven't seen it yet,
        // otherwise to the intended page (or the citizen portal by default).
        const hasSeenVoiceOnboarding = useVoiceStore.getState().hasSeenVoiceOnboarding;
        const from = (location.state as LocationState | null)?.from?.pathname || ROUTES.portal;
        navigate(hasSeenVoiceOnboarding ? from : ROUTES.voiceOnboarding, { replace: true });
      }
    } catch {
      // The store holds the error message; the form renders it below.
    }
  };

  return (
    <Card>
      <CardContent className="p-6 sm:p-8">
        <h1 className="mb-6 text-headline-md text-on-surface">Connexion</h1>

        <FranceConnectButton />
        <p className="mt-3 text-center">
          <Link to="/franceconnect" className="text-body-sm text-on-surface-variant hover:underline">
            Qu’est-ce que FranceConnect ?
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

          <Button type="submit" block size="lg" disabled={isLoggingIn}>
            {isLoggingIn ? 'Connexion…' : 'Se connecter'}
          </Button>
        </form>

        <div className="mt-8 border-t border-border pt-6 text-center">
          <p className="text-body-sm text-on-surface-variant">
            Vous n’avez pas de compte ?{' '}
            <Link to={ROUTES.register} className="text-primary hover:underline">
              Créer un espace personnel
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
