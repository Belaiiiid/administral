import { ChevronRight, Download, Headphones, History, MessageSquare, Phone } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import {
  AiSuggestionCard,
  Dropzone,
  EmptyState,
  PageHeader,
  SectionHeader,
  Timeline,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { AplTimelineEntry } from '@/types';

/** Empty until `aplService.getApplicationTimeline()` exists. */
const TIMELINE: AplTimelineEntry[] = [];

export default function AplApplicationDetailPage() {
  const { applicationId } = useParams();
  useDocumentTitle(`Demande ${applicationId ?? ''}`);

  return (
    <div className="mx-auto max-w-container">
      <PageHeader
        title="Suivi de votre demande APL"
        eyebrow={
          <nav aria-label="Fil d’Ariane">
            <ol className="flex items-center gap-2 text-body-sm text-on-surface-variant">
              <li>
                <Link to={ROUTES.apl} className="hover:underline">
                  Mes demandes
                </Link>
              </li>
              <ChevronRight className="size-4" aria-hidden="true" />
              <li aria-current="page" className="text-on-surface">
                Demande n° {applicationId}
              </li>
            </ol>
          </nav>
        }
        actions={
          <>
            <Button variant="outline">
              <Download aria-hidden="true" />
              Télécharger le récapitulatif
            </Button>
            <Button variant="secondary">
              <Headphones aria-hidden="true" />
              Contacter un conseiller
            </Button>
          </>
        }
      />

      <div className="grid gap-gutter lg:grid-cols-3">
        <div className="flex flex-col gap-gutter lg:col-span-2">
          {/* Status summary */}
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-2 text-headline-md text-on-surface">État de votre demande</h2>
              <p className="text-body-md text-on-surface-variant">
                Le détail de l’instruction s’affichera ici : étape en cours, action attendue de
                votre part et date de finalisation prévue.
              </p>

              <div className="mt-6 rounded-lg border border-border p-4">
                <p className="text-label-sm text-on-surface-variant">Date de finalisation prévue</p>
                <p className="text-headline-md text-outline">
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">Non disponible</span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <SectionHeader title="Historique de la demande" as="h2" />
            </CardHeader>
            <CardContent className={TIMELINE.length > 0 ? undefined : 'px-0'}>
              {TIMELINE.length > 0 ? (
                <Timeline entries={TIMELINE} />
              ) : (
                <EmptyState
                  icon={History}
                  title="Aucun événement"
                  description="Chaque étape de l’instruction sera consignée ici."
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Side panel */}
        <aside className="flex flex-col gap-gutter">
          <AiSuggestionCard title="Assistant" showFeedback={false}>
            Aucun conseil pour le moment. L’assistant vous alertera si une pièce manque à votre
            dossier.
          </AiSuggestionCard>

          <Card>
            <CardHeader>
              <SectionHeader title="Estimation des droits" as="h2" />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <span className="text-body-sm text-on-surface-variant">Montant mensuel estimé</span>
                <span className="text-headline-md text-outline">
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">Non disponible</span>
                </span>
              </div>
              <p className="text-body-sm italic text-on-surface-variant">
                L’estimation sera calculée à partir de vos revenus déclarés.
              </p>
            </CardContent>
          </Card>

          <Dropzone
            compact
            title="Ajouter une pièce"
            hint="Glissez-déposez vos documents ici (PDF, JPG — 5 Mo max)"
          />

          <Card>
            <CardHeader>
              <SectionHeader title="Aide et support" as="h2" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button asChild variant="outline" block className="justify-between">
                <Link to={ROUTES.chat}>
                  <span className="flex items-center gap-3">
                    <MessageSquare aria-hidden="true" />
                    Discuter avec l’assistant
                  </span>
                  <ChevronRight aria-hidden="true" />
                </Link>
              </Button>
              <Button variant="outline" block className="justify-between">
                <span className="flex items-center gap-3">
                  <Phone aria-hidden="true" />
                  Rappel téléphonique
                </span>
                <ChevronRight aria-hidden="true" />
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
