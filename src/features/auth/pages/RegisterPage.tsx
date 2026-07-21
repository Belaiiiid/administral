import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { FranceConnectButton } from '@/features/auth/components/FranceConnectButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function RegisterPage() {
  useDocumentTitle('Créer un compte');

  return (
    <Card>
      <CardContent className="p-6 sm:p-8">
        <h1 className="mb-2 text-headline-md text-on-surface">Créer un espace personnel</h1>
        <p className="mb-6 text-body-sm text-on-surface-variant">
          Un seul compte pour accéder à l’ensemble de vos services publics.
        </p>

        <FranceConnectButton />

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
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="firstName">Prénom</Label>
              <Input id="firstName" name="firstName" autoComplete="given-name" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lastName">Nom</Label>
              <Input id="lastName" name="lastName" autoComplete="family-name" />
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
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="register-password">Mot de passe</Label>
            <Input
              id="register-password"
              type="password"
              name="password"
              autoComplete="new-password"
              aria-describedby="password-hint"
            />
            <p id="password-hint" className="text-body-sm text-on-surface-variant">
              12 caractères minimum, dont une majuscule et un chiffre.
            </p>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox id="cgu" className="mt-0.5" />
            <Label htmlFor="cgu" className="cursor-pointer font-normal leading-normal">
              J’accepte les conditions générales d’utilisation et la politique de protection des
              données personnelles.
            </Label>
          </div>

          <Button type="submit" block size="lg">
            Créer mon compte
          </Button>
        </form>

        <div className="mt-8 border-t border-border pt-6 text-center">
          <p className="text-body-sm text-on-surface-variant">
            Vous avez déjà un compte ?{' '}
            <Link to={ROUTES.login} className="text-primary hover:underline">
              Se connecter
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
