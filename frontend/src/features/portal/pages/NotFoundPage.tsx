import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import administralLogo from '@/assets/administral-logo.png';
import { EmptyState } from '@/components/shared';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function NotFoundPage() {
  useDocumentTitle('Page introuvable');

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-header items-center border-b border-border bg-surface-lowest px-margin-mobile md:px-gutter">
        <Link to={ROUTES.home} className="flex items-center gap-2.5">
          <img src={administralLogo} alt="Administral" className="size-9 shrink-0 object-contain" />
          <span className="text-headline-md text-primary">ADMINISTRAL</span>
        </Link>
      </header>

      <main id="main-content" className="flex flex-1 items-center justify-center p-gutter">
        <EmptyState
          icon={Compass}
          title="Cette page n’existe pas"
          description="La page que vous cherchez a peut-être été déplacée ou n’est plus disponible."
          actions={
            <Button asChild>
              <Link to={ROUTES.portal}>Retour au tableau de bord</Link>
            </Button>
          }
        />
      </main>

      <Footer />
    </div>
  );
}
