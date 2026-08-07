import { Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { APP_CONFIG } from '@/app/config/app';
import { ROUTES } from '@/app/router/paths';
import { AUTH_CHECKBOX, AUTH_FIELD } from '@/features/auth/authStyles';
import { PartnerLogos } from '@/components/layout/PartnerLogos';
import Turnstile from '@/components/shared/Turnstile';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useSessionStore } from '@/store/sessionStore';

const MIN_PASSWORD_LENGTH = 8;

type Strength = 'none' | 'weak' | 'medium' | 'strong';

function computeStrength(password: string): Strength {
  if (password.length === 0) return 'none';
  if (password.length < MIN_PASSWORD_LENGTH) return 'weak';
  let score = 0;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (score < 2) return 'weak';
  if (score < 4) return 'medium';
  return 'strong';
}

const STRENGTH_LABELS: Record<Strength, string> = {
  none: '',
  weak: 'Faible',
  medium: 'Moyen',
  strong: 'Fort',
};

const STRENGTH_COLORS: Record<Strength, string> = {
  none: 'bg-border',
  weak: 'bg-destructive',
  medium: 'bg-warning',
  strong: 'bg-success',
};

const STRENGTH_BARS: Record<Strength, number> = {
  none: 0,
  weak: 1,
  medium: 2,
  strong: 3,
};

export default function RegisterPage() {
  useDocumentTitle('Créer un compte');
  const navigate = useNavigate();
  const register = useSessionStore((state) => state.register);
  const isLoggingIn = useSessionStore((state) => state.isLoggingIn);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [cguAccepted, setCguAccepted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const strength = useMemo(() => computeStrength(password), [password]);
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirmation.length > 0 && password !== confirmation;
  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password === confirmation &&
    cguAccepted &&
    !!turnstileToken &&
    !isLoggingIn;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
        turnstileToken: turnstileToken ?? undefined,
      });

      // Services first, profiling per service: a new citizen picks what they
      // want to do before answering any question — the profiling assistant
      // only appears once they open a service that needs it (see
      // `RequireApplProfile`), since the questions differ from one to another.
      navigate(ROUTES.portal, { replace: true });

      setSuccess(true);

    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La création du compte a échoué.');
    }
  };

  if (success) {
    return (
      <Card className="rounded-2xl border-none bg-surface-lowest shadow-soft-hover">
        <CardContent className="p-8 pb-6 sm:p-10 sm:pb-7">
          <div className="text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-success-surface">
              <Mail className="size-7 text-success" aria-hidden="true" />
            </div>
            <h1 className="mb-2 text-headline-lg text-primary">Compte créé !</h1>
            <p className="mb-6 text-body-sm text-on-surface-variant">
              Votre compte a été créé avec succès.
            </p>
          </div>
          <Alert tone="success" className="mb-6">
            <AlertDescription>
              Un e-mail de confirmation vient de vous être envoyé à{' '}
              <strong>{email}</strong>.
            </AlertDescription>
          </Alert>
          <div className="rounded-xl bg-[var(--login-field)] p-4">
            <p className="text-body-sm text-on-surface-variant">
              Pour accéder à l'ensemble de vos services, confirmez votre adresse
              e-mail en cliquant sur le lien que nous venons de vous envoyer.
              Pensez à vérifier vos courriers indésirables.
            </p>
          </div>
          <Button
            asChild
            block
            size="lg"
            className="mt-6 h-12 rounded-2xl bg-marianne text-body-lg font-semibold hover:bg-primary"
          >
            <Link to={ROUTES.login}>Se connecter</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    // Même carte que l'écran de connexion : coins à 16px, pas de bordure, ombre
    // douce. Les champs, la case à cocher et le bouton principal reprennent les
    // mêmes tokens `.login-scope`, posés par `AuthLayout`, jusqu'au rembourrage
    // bas plus court que le haut : le bloc partenaires qui ferme la carte porte
    // déjà son propre blanc.
    //
    // Les variantes `short:` (max-height 820px) et `shorter:` (680px) rognent
    // les blancs — jamais le contenu — pour que la carte tienne dans une fenêtre
    // basse, la page étant verrouillée en hauteur par `AuthLayout`.
    <Card className="rounded-2xl border-none bg-surface-lowest shadow-soft-hover">
      <CardContent className="p-8 pb-6 sm:p-10 sm:pb-7 short:p-6 short:pb-5 short:sm:p-7">
        <div className="mb-8 flex flex-col items-center text-center short:mb-5">
          <span className="mb-4 flex size-24 items-center justify-center rounded-2xl bg-surface-lowest shadow-soft ring-1 ring-primary-fixed short:mb-3 short:size-16 shorter:size-14">
            <img
              src="/logo.png"
              alt={APP_CONFIG.name}
              className="size-full rounded-2xl object-contain"
            />
          </span>
          <h1 className="text-headline-lg text-primary">Créer un espace personnel</h1>
          <p className="mt-2 text-body-sm text-on-surface-variant">
            Un seul compte pour accéder à l'ensemble de vos services publics.
          </p>
        </div>

        {error && (
          <Alert tone="error" className="mb-5">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form className="flex flex-col gap-4 shorter:gap-3" onSubmit={handleSubmit} noValidate>
          {/* Placeholder-only fields, comme à la connexion. Le `<Label>` visible
              disparaît, donc chaque champ porte un `aria-label` — un placeholder
              seul ne fait pas un nom accessible, et il s'efface dès la première
              frappe. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="firstName"
              name="firstName"
              autoComplete="given-name"
              aria-label="Prénom"
              placeholder="Prénom"
              startIcon={<User />}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className={AUTH_FIELD}
            />
            <Input
              id="lastName"
              name="lastName"
              autoComplete="family-name"
              aria-label="Nom"
              placeholder="Nom"
              startIcon={<User />}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className={AUTH_FIELD}
            />
          </div>

          <Input
            id="register-email"
            type="email"
            name="email"
            autoComplete="email"
            aria-label="Adresse e-mail"
            placeholder="Adresse e-mail"
            startIcon={<Mail />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={AUTH_FIELD}
          />

          <div className="flex flex-col gap-2">
            <Input
              id="register-password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="new-password"
              aria-label="Mot de passe"
              placeholder="Mot de passe"
              startIcon={<Lock />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={AUTH_FIELD}
              aria-describedby={tooShort ? 'password-error' : 'password-hint'}
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
            {password.length > 0 && (
              <div>
                <div className="flex gap-1">
                  {[1, 2, 3].map((bar) => (
                    <div
                      key={bar}
                      className={cn(
                        'h-1 flex-1 rounded-full transition-colors',
                        bar <= STRENGTH_BARS[strength]
                          ? STRENGTH_COLORS[strength]
                          : 'bg-[var(--login-border)]',
                      )}
                    />
                  ))}
                </div>
                <p
                  className={cn(
                    // `pl-4` : les textes d'aide s'alignent sur le rembourrage
                    // interne du champ, pas sur son bord.
                    'mt-1 pl-4 text-body-sm',
                    strength === 'weak' && 'text-destructive',
                    strength === 'medium' && 'text-warning',
                    strength === 'strong' && 'text-success',
                  )}
                >
                  {STRENGTH_LABELS[strength]}
                </p>
              </div>
            )}
            {tooShort && (
              <p id="password-error" className="pl-4 text-body-sm text-destructive">
                {MIN_PASSWORD_LENGTH} caractères minimum.
              </p>
            )}
            {!tooShort && password.length === 0 && (
              <p id="password-hint" className="pl-4 text-label-sm text-on-surface-variant">
                {MIN_PASSWORD_LENGTH} caractères minimum, dont une majuscule, un
                chiffre et un caractère spécial.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Input
              id="confirmation"
              type={showPassword ? 'text' : 'password'}
              name="confirmation"
              autoComplete="new-password"
              aria-label="Confirmer le mot de passe"
              placeholder="Confirmer le mot de passe"
              startIcon={<Lock />}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              required
              className={AUTH_FIELD}
              aria-describedby={mismatch ? 'confirmation-error' : undefined}
            />
            {mismatch && (
              <p id="confirmation-error" className="pl-4 text-body-sm text-destructive">
                Les deux mots de passe ne correspondent pas.
              </p>
            )}
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="cgu"
              className={cn(AUTH_CHECKBOX, 'mt-0.5 shrink-0')}
              checked={cguAccepted}
              onCheckedChange={(checked) => setCguAccepted(checked === true)}
            />
            <Label htmlFor="cgu" className="cursor-pointer text-label-sm font-normal leading-normal">
              J'accepte les conditions générales d'utilisation et la politique de
              protection des données personnelles.
            </Label>
          </div>

          {/* Renders nothing without `VITE_TURNSTILE_SITE_KEY`. It still gates
              the submit button in any environment that configures a site key. */}
          <Turnstile
            onVerify={(token) => setTurnstileToken(token)}
            onExpire={() => setTurnstileToken(null)}
          />

          <Button
            type="submit"
            block
            size="lg"
            disabled={!canSubmit}
            className="mt-1 h-12 rounded-2xl bg-marianne text-body-lg font-semibold hover:bg-primary"
          >
            {isLoggingIn ? 'Création du compte…' : 'Créer mon compte'}
          </Button>
        </form>

        {/* `PartnerLogos` plutôt que deux balises image écrites à la main : il
            apparie déjà Talan et Mistral et retombe sur un mot-symbole texte si
            un fichier manque. `wordmark` sélectionne /mistral-logo.svg.

            Détaché du bouton par 40px : la mention partenaire n'appartient pas
            au formulaire, l'écart doit se lire comme une rupture et non comme
            l'interligne suivant. Resserré sur une fenêtre basse, la carte devant
            tenir sans défilement. */}
        <div className="mt-10 flex items-center justify-center gap-3 opacity-70 short:mt-6">
          <span className="text-label-sm leading-none text-on-surface-variant">Propulsé par</span>
          {/* Décalage de 3px sur Talan : le PNG porte sa signature « Positive
              innovation » sous le mot-symbole, son centre optique remonte donc
              d'environ 15% de la hauteur de boîte. */}
          <PartnerLogos
            className="items-center gap-4"
            logoClassName="h-5 w-auto object-contain"
            talanClassName="translate-y-[3px]"
            mistralMark="wordmark"
          />
        </div>
      </CardContent>
    </Card>
  );
}
