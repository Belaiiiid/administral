import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { FranceConnectButton } from '@/features/auth/components/FranceConnectButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

/**
 * Login skeleton. The form does not submit anywhere — authentication is a
 * future full-stack module (see docs/roadmap.md).
 */
export default function LoginPage() {
  useDocumentTitle('Connexion');
  const [showPassword, setShowPassword] = useState(false);

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

        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => event.preventDefault()}
          noValidate
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Adresse e-mail</Label>
            <Input
              id="email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="nom@exemple.fr"
              startIcon={<Mail />}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="password">Mot de passe</Label>
              <Link
                to="/mot-de-passe-oublie"
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

          <Button type="submit" block size="lg">
            Se connecter
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
