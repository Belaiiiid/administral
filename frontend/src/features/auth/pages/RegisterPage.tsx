import { Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { FranceConnectButton } from '@/features/auth/components/FranceConnectButton';
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
      <Card>
        <CardContent className="p-6 sm:p-8">
          <div className="text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-success-surface">
              <Mail className="size-7 text-success" aria-hidden="true" />
            </div>
            <h1 className="mb-2 text-headline-md text-on-surface">Compte créé !</h1>
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
          <div className="rounded-lg bg-surface-low p-4">
            <p className="text-body-sm text-on-surface-variant">
              Pour accéder à l'ensemble de vos services, confirmez votre adresse
              e-mail en cliquant sur le lien que nous venons de vous envoyer.
              Pensez à vérifier vos courriers indésirables.
            </p>
          </div>
          <Button asChild block size="lg" className="mt-6">
            <Link to={ROUTES.login}>Se connecter</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 sm:p-8">
        <div className="mb-8 text-center">
          <h1 className="text-headline-md text-on-surface">Créer un espace personnel</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Un seul compte pour accéder à l'ensemble de vos services publics.
          </p>
        </div>

        <FranceConnectButton />

        <div className="my-8 flex items-center gap-4">
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
          <span className="text-label-sm text-on-surface-variant">OU</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>

        {error && (
          <Alert tone="error" className="mb-5">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="firstName">Prénom</Label>
              <Input
                id="firstName"
                name="firstName"
                autoComplete="given-name"
                startIcon={<User />}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                placeholder="Jean"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lastName">Nom</Label>
              <Input
                id="lastName"
                name="lastName"
                autoComplete="family-name"
                startIcon={<User />}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                placeholder="Dupont"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="register-email">Adresse e-mail</Label>
            <Input
              id="register-email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="nom@exemple.fr"
              startIcon={<Mail />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="register-password">Mot de passe</Label>
            <Input
              id="register-password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="new-password"
              startIcon={<Lock />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
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
              <div className="mt-1">
                <div className="flex gap-1">
                  {[1, 2, 3].map((bar) => (
                    <div
                      key={bar}
                      className={cn(
                        'h-1 flex-1 rounded-full transition-colors',
                        bar <= STRENGTH_BARS[strength]
                          ? STRENGTH_COLORS[strength]
                          : 'bg-border',
                      )}
                    />
                  ))}
                </div>
                <p
                  className={cn(
                    'mt-1 text-body-sm',
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
              <p id="password-error" className="text-body-sm text-destructive">
                {MIN_PASSWORD_LENGTH} caractères minimum.
              </p>
            )}
            {!tooShort && password.length === 0 && (
              <p id="password-hint" className="text-body-sm text-on-surface-variant">
                {MIN_PASSWORD_LENGTH} caractères minimum, dont une majuscule, un
                chiffre et un caractère spécial.
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
              onChange={(e) => setConfirmation(e.target.value)}
              required
              aria-describedby={mismatch ? 'confirmation-error' : undefined}
            />
            {mismatch && (
              <p id="confirmation-error" className="text-body-sm text-destructive">
                Les deux mots de passe ne correspondent pas.
              </p>
            )}
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="cgu"
              className="mt-0.5"
              checked={cguAccepted}
              onCheckedChange={(checked) => setCguAccepted(checked === true)}
            />
            <Label htmlFor="cgu" className="cursor-pointer font-normal leading-normal">
              J'accepte les conditions générales d'utilisation et la politique de
              protection des données personnelles.
            </Label>
          </div>

          <Button type="submit" block size="lg" disabled={!canSubmit}>
            {isLoggingIn ? 'Création du compte…' : 'Créer mon compte'}
          </Button>
        </form>

        <div className="mt-8 border-t border-border pt-6 text-center">
          <p className="text-body-sm text-on-surface-variant">
            Vous avez déjà un compte ?{' '}
            <Link to={ROUTES.login} className="font-medium text-primary hover:underline">
              Se connecter
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
