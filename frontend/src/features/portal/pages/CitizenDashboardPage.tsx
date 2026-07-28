import {
  ArrowRight,
  Bell,
  CalendarClock,
  FileText,
  HomeIcon,
  Inbox,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { SERVICES } from '@/app/config/services';
import { ROUTES } from '@/app/router/paths';
import { AiSuggestionCard, DataRow, EmptyState, PageHeader, SectionHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useSessionStore } from '@/store/sessionStore';

/**
 * Citizen portal home — the cross-administration entry point.
 *
 * Layout only. Every widget below renders its empty state until
 * `portalService` provides real data; nothing here fabricates a value.
 */
export default function CitizenDashboardPage() {
  useDocumentTitle('Tableau de bord');
  const { displayName, activatedServices } = useSessionStore();

  const activeServices = SERVICES.filter((service) => activatedServices.includes(service.id));
  const inactiveServices = SERVICES.filter((service) => !activatedServices.includes(service.id));

  return (
    <div className="mx-auto max-w-container">
      <PageHeader
        title="Tableau de bord"
        description={
          displayName
            ? `Bienvenue ${displayName}, voici l’état de vos démarches en cours.`
            : 'Retrouvez ici l’état de vos démarches en cours.'
        }
        actions={
          <Button asChild variant="outline">
            <Link to={ROUTES.portalNotifications}>
              <Bell aria-hidden="true" />
              Notifications
            </Link>
          </Button>
        }
      />

      <div className="bento-grid">
        {/* Assistant slot */}
        <div className="md:col-span-12">
          <AiSuggestionCard title="Assistant" showFeedback={false}>
            Aucune suggestion pour le moment. L’assistant analysera vos démarches dès qu’elles
            seront disponibles.
          </AiSuggestionCard>
        </div>

        {/* Active services */}
        <section className="md:col-span-8" aria-labelledby="active-services">
          <SectionHeader
            title="Mes services actifs"
            as="h2"
            id="active-services"
            className="mb-4"
            action={
              <Button asChild variant="link" size="sm">
                <Link to={ROUTES.dossier}>Gérer mes services</Link>
              </Button>
            }
          />

          {activeServices.length > 0 ? (
            <ul className="flex flex-col gap-4">
              {activeServices.map((service) => (
                <li key={service.id}>
                  <Card>
                    <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary">
                        <HomeIcon className="size-6" aria-hidden="true" />
                      </span>
                      <div className="flex-1">
                        <h3 className="text-headline-md text-primary">{service.name}</h3>
                        <p className="text-body-sm text-on-surface-variant">
                          {service.description}
                        </p>
                      </div>
                      <Button asChild variant="outline-primary">
                        <Link to={service.basePath}>
                          Ouvrir
                          <span className="sr-only"> {service.name}</span>
                          <ArrowRight aria-hidden="true" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={Inbox}
                  title="Aucun service activé"
                  description="Rattachez une administration à votre compte pour suivre vos démarches ici."
                  actions={
                    <Button asChild>
                      <Link to={ROUTES.dossier}>
                        <Plus aria-hidden="true" />
                        Activer un service
                      </Link>
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          )}
        </section>

        {/* Profile summary */}
        <aside className="md:col-span-4" aria-labelledby="profile-summary">
          <Card className="h-full">
            <CardHeader>
              <SectionHeader title="Mon profil citoyen" as="h2" id="profile-summary" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <DataRow label="Situation familiale" />
              <DataRow label="Enfants à charge" />
              <DataRow label="Dernière mise à jour" />
              <Button asChild variant="outline" block className="mt-4">
                <Link to={ROUTES.profile}>Compléter mon profil</Link>
              </Button>
            </CardContent>
          </Card>
        </aside>

        {/* Upcoming deadlines */}
        <section className="md:col-span-4" aria-labelledby="deadlines">
          <Card className="flex h-full flex-col">
            <CardHeader className="flex-row items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary-fixed text-primary">
                <CalendarClock className="size-5" aria-hidden="true" />
              </span>
              <h2 id="deadlines" className="text-label-md text-on-surface">
                Prochaines échéances
              </h2>
            </CardHeader>
            <CardContent className="flex flex-1 items-center justify-center p-0">
              <EmptyState
                size="compact"
                icon={CalendarClock}
                title="Aucune échéance"
                description="Vos prochaines dates limites apparaîtront ici."
              />
            </CardContent>
          </Card>
        </section>

        {/* Recent documents */}
        <section className="md:col-span-4" aria-labelledby="recent-docs">
          <Card className="flex h-full flex-col">
            <CardHeader className="flex-row items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-secondary-fixed text-secondary-on-fixed">
                <FileText className="size-5" aria-hidden="true" />
              </span>
              <h2 id="recent-docs" className="text-label-md text-on-surface">
                Documents récents
              </h2>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col p-0">
              <EmptyState
                size="compact"
                icon={FileText}
                title="Aucun document"
                description="Les pièces que vous déposez s’afficheront ici."
                className="flex-1 justify-center"
              />
              <div className="px-6 pb-6">
                <Button asChild variant="link" size="sm" className="px-0">
                  <Link to={ROUTES.documents}>Tous mes documents</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Household */}
        <section className="md:col-span-4" aria-labelledby="household">
          <Card className="h-full">
            <CardHeader className="flex-row items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary-fixed text-primary">
                <Users className="size-5" aria-hidden="true" />
              </span>
              <h2 id="household" className="text-label-md text-on-surface">
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

        {/* Suggestive empty state — additional services */}
        {inactiveServices.length > 0 && (
          <div className="md:col-span-12">
            <EmptyState
              variant="suggestive"
              icon={Sparkles}
              title="Activez d’autres services publics"
              description={`${inactiveServices.length} administrations peuvent être rattachées à votre compte pour pré-remplir automatiquement vos démarches.`}
              actions={
                <Button asChild>
                  <Link to={ROUTES.dossier}>
                    <Plus aria-hidden="true" />
                    Ajouter un service
                  </Link>
                </Button>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
