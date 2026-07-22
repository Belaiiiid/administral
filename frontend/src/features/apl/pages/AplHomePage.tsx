import { Activity, BadgeCheck, Calculator, HomeIcon, UploadCloud, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import {
  AiSuggestionCard,
  CircularProgress,
  DataRow,
  Dropzone,
  EmptyState,
  PageHeader,
  SectionHeader,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

/**
 * APL service homepage — the bento dashboard of the mockups.
 *
 * Layout only: no application, no amount and no activity is fabricated.
 * `aplService` will populate every widget below.
 */
export default function AplHomePage() {
  useDocumentTitle('APL à l’Aide');

  return (
    <div className="mx-auto max-w-container">
      <PageHeader title="APL à l’Aide" description="L’état de vos aides au logement en temps réel." />

      <div className="bento-grid">
        {/* Assistant slot */}
        <div className="md:col-span-12">
          <AiSuggestionCard title="Assistant" showFeedback={false}>
            Aucune suggestion pour le moment. L’assistant vous proposera des actions dès qu’une
            demande sera en cours.
          </AiSuggestionCard>
        </div>

        {/* Current application status */}
        <section className="md:col-span-12 lg:col-span-8" aria-labelledby="current-application">
          <Card className="h-full">
            <CardHeader>
              <SectionHeader title="État de la demande en cours" as="h2" id="current-application" />
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-8 md:flex-row">
              <CircularProgress value={null} label="Analysé" />

              <div className="flex-1 space-y-4">
                <p className="text-body-md text-on-surface-variant">
                  Aucune demande n’est en cours. Lancez une simulation pour estimer vos droits, puis
                  déposez votre demande.
                </p>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-border p-3">
                    <p className="mb-1 text-label-sm text-on-surface-variant">Date de dépôt</p>
                    <p className="text-label-md text-outline">
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">Non renseignée</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="mb-1 text-label-sm text-on-surface-variant">Montant estimé</p>
                    <p className="text-label-md text-outline">
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">Non renseigné</span>
                    </p>
                  </div>
                </div>

                <Button asChild variant="outline">
                  <Link to={ROUTES.aplApplication}>Déposer une demande</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Inverted upload card */}
        <section className="md:col-span-12 lg:col-span-4" aria-labelledby="upload-card">
          <div className="flex h-full flex-col rounded-xl bg-primary-container p-6 text-white shadow-soft">
            <UploadCloud className="mb-3 size-8" aria-hidden="true" />
            <h2 id="upload-card" className="mb-2 text-headline-md">
              Dépôt de documents
            </h2>
            <p className="mb-6 text-body-sm text-white/80">
              Déposez vos documents pour une extraction automatique des données.
            </p>
            <div className="mt-auto">
              <Dropzone inverted compact hint="Formats PDF, JPG, PNG — 5 Mo max" />
            </div>
          </div>
        </section>

        {/* Summary widgets */}
        <section className="md:col-span-4" aria-labelledby="situation">
          <Card className="flex h-full flex-col">
            <CardHeader className="flex-row items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary-fixed text-primary">
                <BadgeCheck className="size-5" aria-hidden="true" />
              </span>
              <h2 id="situation" className="text-label-md text-on-surface">
                Ma situation
              </h2>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-2">
              <DataRow label="Dernière mise à jour" />
              <DataRow label="Prochaine vérification" />
              <Button asChild block className="mt-auto">
                <Link to={ROUTES.aplApplication}>Vérifier ma situation</Link>
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="md:col-span-4" aria-labelledby="household-apl">
          <Card className="h-full">
            <CardHeader className="flex-row items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-secondary-fixed text-secondary-on-fixed">
                <Users className="size-5" aria-hidden="true" />
              </span>
              <h2 id="household-apl" className="text-label-md text-on-surface">
                Composition du foyer
              </h2>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <DataRow label="Adultes" />
              <DataRow label="Enfants à charge" />
              <Button asChild variant="link" size="sm" className="mt-2 self-start px-0">
                <Link to={ROUTES.profile}>Renseigner ma situation</Link>
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="md:col-span-4" aria-labelledby="housing">
          <Card className="h-full">
            <CardHeader className="flex-row items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
                <HomeIcon className="size-5" aria-hidden="true" />
              </span>
              <h2 id="housing" className="text-label-md text-on-surface">
                Données logement
              </h2>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <DataRow label="Loyer hors charges" />
              <DataRow label="Type de bail" />
              <Button asChild variant="link" size="sm" className="mt-2 self-start px-0">
                <Link to={ROUTES.profile}>Renseigner mon logement</Link>
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* Recent activity */}
        <section className="md:col-span-12" aria-labelledby="activities">
          <Card className="overflow-hidden">
            <div className="border-b border-border px-6 py-4">
              <h2 id="activities" className="section-title">
                Activités récentes
              </h2>
            </div>
            <EmptyState
              icon={Activity}
              title="Aucune activité"
              description="Les événements de votre dossier (dépôts, analyses, décisions) s’afficheront ici."
            />
          </Card>
        </section>

        {/* Simulator call-out */}
        <section className="md:col-span-12">
          <Card>
            <CardContent className="flex flex-col items-center gap-6 p-8 text-center md:flex-row md:text-left">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-primary">
                <Calculator className="size-6" aria-hidden="true" />
              </span>
              <div className="flex-1">
                <h2 className="text-headline-md text-on-surface">Votre situation a changé ?</h2>
                <p className="text-body-md text-on-surface-variant">
                  Estimez vos nouveaux droits en moins de deux minutes.
                </p>
              </div>
              <Button asChild>
                <Link to={ROUTES.aplSimulator}>Lancer le simulateur</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
