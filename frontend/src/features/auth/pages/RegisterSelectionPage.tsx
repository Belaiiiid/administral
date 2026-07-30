import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ROUTES } from '@/app/router/paths';

export default function RegisterSelectionPage() {
  useDocumentTitle('Créer un compte - Choix');
  const [showManualOptions, setShowManualOptions] = useState(false);

  if (showManualOptions) {
    return (
      <Card>
        <CardContent className="p-6 sm:p-8 flex flex-col items-center text-center">
          <h1 className="mb-2 text-headline-md text-on-surface">Saisie manuelle</h1>
          <p className="mb-8 text-body-sm text-on-surface-variant">
            Comment souhaitez-vous remplir vos informations ?
          </p>

          <div className="grid grid-cols-1 gap-4 w-full">
            <Button asChild size="lg" variant="outline" className="w-full">
              <Link to={ROUTES.registerManual}>Classique (Sans assistant)</Link>
            </Button>
            <Button size="lg" className="w-full" onClick={() => {
              // TODO: Mettre le lien d'API pour redirection vers l'assistant vocal
              window.location.href = '#lien-api-assistant-vocal';
            }}>
              Avec assistant vocal
            </Button>
            <Button variant="ghost" className="w-full mt-2" onClick={() => setShowManualOptions(false)}>
              Retour
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 sm:p-8 flex flex-col items-center text-center">
        <h1 className="mb-2 text-headline-md text-on-surface">Créer un espace personnel</h1>
        <p className="mb-8 text-body-sm text-on-surface-variant">
          Voulez-vous remplir vos informations manuellement ou gagner du temps en important un document justificatif ?
        </p>

        <div className="grid grid-cols-1 gap-4 w-full">
          <Button size="lg" variant="outline" className="w-full" onClick={() => setShowManualOptions(true)}>
            Saisie manuelle
          </Button>
          <Button asChild size="lg" className="w-full">
            <Link to={ROUTES.registerDocument}>Importer un document (OCR)</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
