import { Eye, EyeOff, Loader2, Lock, Mail, RefreshCw } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { APP_CONFIG } from '@/app/config/app';
import { ROUTES } from '@/app/router/paths';
import { FranceConnectButton } from '@/features/auth/components/FranceConnectButton';
import { PartnerLogos } from '@/components/layout/PartnerLogos';
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
import { useVoiceStore } from '@/features/voice/store/voiceStore';
import { useVoicePage } from '@/features/voice/context/VoicePageContext';

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
  const formRef = useRef<HTMLFormElement>(null);

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
        // After login, take citizens to voice onboarding if they haven't seen it yet,
        // otherwise to the page they were headed to, or the administrations list by
        // default — same destination `HomeRoute` sends an already-authenticated
        // visitor to, so "choose an administration, then see its services" is the
        // one consistent entry point rather than a shortcut straight to CAF's hub.
        const hasSeenVoiceOnboarding = useVoiceStore.getState().hasSeenVoiceOnboarding;
        const from = (location.state as LocationState | null)?.from?.pathname || ROUTES.administrations;
        navigate(hasSeenVoiceOnboarding ? from : ROUTES.voiceOnboarding, { replace: true });
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

  // Register page context for the voice assistant.
  // Confirmation prompts are skipped on this page (skipConfirmation in the provider)
  // so the assistant fills fields directly without reading the password aloud.
  useVoicePage({
    readableText:
      "Page de connexion. Vous pouvez vous connecter avec votre adresse e-mail et votre mot de passe, ou utiliser FranceConnect.",
    actions: [
      {
        id: 'submit_login',
        label: 'se connecter',
        description: 'Soumettre le formulaire de connexion',
        intent: { type: 'click_action', actionId: 'submit_login' },
        sensitive: true,
      },
    ],
    fields: [
      {
        fieldId: 'email',
        labels: ['email', 'adresse email', 'adresse e-mail', 'mail', 'e-mail', 'courriel'],
        setValue: setEmail,
      },
      {
        fieldId: 'password',
        labels: ['mot de passe', 'password', 'mdp', 'code'],
        setValue: setPassword,
        sensitive: true,
      },
    ],
    actionCallbacks: {
      submit_login: () => formRef.current?.requestSubmit(),
    },
  });

  return (
    // The `short:` variants (max-height: 820px, see tailwind.config) trim
    // whitespace only, so the whole card still fits a laptop viewport without
    // a scrollbar. Nothing is hidden or shrunk below its readable size.
    <Card className="rounded-2xl border-none bg-surface-lowest shadow-soft-hover">
      <CardContent className="p-8 pb-6 sm:p-10 sm:pb-7 short:p-6 short:pb-5 short:sm:p-7">
        <div className="mb-8 flex flex-col items-center text-center short:mb-5">
          <span className="mb-4 flex size-20 items-center justify-center rounded-2xl bg-surface-lowest shadow-soft ring-1 ring-primary-fixed short:mb-3 short:size-14 shorter:size-12">
            <img
              src="/logo.png"
              alt={APP_CONFIG.name}
              className="size-full rounded-2xl object-contain"
            />
          </span>
          <h1 className="text-headline-lg text-primary">Connexion</h1>
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
                  className="mt-2 flex items-center gap-1.5 text-label-md text-primary hover:underline"
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

        <form
          ref={formRef}
          className="flex flex-col gap-4 shorter:gap-3"
          onSubmit={handleSubmit}
          noValidate
        >
          {/* Placeholder-only fields, per the reference design. The visible
              `<Label>` is gone, so each field carries an `aria-label` — a
              placeholder alone is not an accessible name, and it disappears
              as soon as the citizen starts typing. */}
          <Input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            aria-label="Adresse e-mail"
            placeholder="Adresse e-mail"
            startIcon={<Mail />}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="h-12 rounded-2xl border-primary-fixed bg-surface text-body-md"
          />

          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            name="password"
            autoComplete="current-password"
            aria-label="Mot de passe"
            placeholder="Mot de passe"
            startIcon={<Lock />}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="h-12 rounded-2xl border-primary-fixed bg-surface text-body-md"
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

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox id="remember" />
              <Label htmlFor="remember" className="cursor-pointer text-body-sm font-normal">
                Se souvenir de moi
              </Label>
            </div>
            {/* `text-destructive` (--error, #ba1a1a) rather than a literal red:
                it rides the high-contrast preference, and clears AA at 6.5:1
                where the previous pink sat at 3.6:1. */}
            <Link
              to={ROUTES.forgotPassword}
              className="text-body-sm text-destructive hover:underline"
            >
              Oublié ?
            </Link>
          </div>

          {/* Renders nothing without `VITE_TURNSTILE_SITE_KEY` — which is why
              it is absent from the reference screenshot. It still gates the
              submit button in any environment that configures a site key. */}
          <Turnstile
            onVerify={(token) => setTurnstileToken(token)}
            onExpire={() => setTurnstileToken(null)}
          />

          <Button
            type="submit"
            block
            size="lg"
            disabled={isLoggingIn || !turnstileToken}
            className="mt-1 h-12 rounded-2xl bg-marianne text-body-lg font-semibold hover:bg-primary"
          >
            {isLoggingIn ? 'Connexion…' : 'Se connecter'}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-4 short:my-4">
          <span aria-hidden="true" className="h-px flex-1 bg-primary-fixed" />
          <span className="text-label-sm text-on-surface-variant">Ou connectez-vous avec</span>
          <span aria-hidden="true" className="h-px flex-1 bg-primary-fixed" />
        </div>

        <FranceConnectButton className="h-12 rounded-2xl" />
        <p className="mt-4 text-center short:mt-3">
          <Link to="/franceconnect" className="text-body-sm text-on-surface-variant hover:underline">
            Qu’est-ce que FranceConnect ?
          </Link>
        </p>

        <div className="mt-6 text-center opacity-70 short:mt-4">
          <p className="text-label-sm text-on-surface-variant">
            Vous n’avez pas de compte ?{' '}
            <Link to={ROUTES.register} className="text-ai hover:underline">
              Créer un espace personnel
            </Link>
          </p>
        </div>

        {/* `PartnerLogos` rather than two hand-written `<img>`: it already
            pairs Talan with Mistral and falls back to a text wordmark if an
            asset is missing. `wordmark` selects /mistral-logo.svg. */}
        <div className="mt-5 flex items-center justify-center gap-4 opacity-70 short:mt-3">
          <span className="text-label-sm leading-none text-on-surface-variant">Powered by</span>
          {/* `object-contain` + a shared height letterboxes each mark inside the
              same box, so Talan's wordmark and Mistral's square sit on one
              optical baseline instead of being centred on their own bounds. */}
          <PartnerLogos
            className="items-center gap-5"
            logoClassName="h-5 w-auto object-contain"
            mistralMark="wordmark"
          />
        </div>
      </CardContent>
    </Card>
  );
}
