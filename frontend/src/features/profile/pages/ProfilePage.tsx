import { Accessibility, HomeIcon, History, Pencil, Save, Settings2, User, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import {
  AiSuggestionCard,
  DataRow,
  EmptyState,
  PageHeader,
  SectionHeader,
  StatusBadge,
} from '@/components/shared';
import { ACCESSIBILITY_OPTIONS } from '@/features/profile/accessibilityOptions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUiStore } from '@/store/uiStore';
import type { SituationHistoryEntry } from '@/types';

/** Empty until `profileService.getSituationHistory()` exists. */
const HISTORY: SituationHistoryEntry[] = [];

/** The identity fields the profile renders, in reading order. */
const IDENTITY_FIELDS = [
  'Nom',
  'Prénom',
  'Numéro de sécurité sociale',
  'Date de naissance',
  'Lieu de naissance',
  'Adresse e-mail',
] as const;

const NOTIFICATION_PREFERENCES = [
  { id: 'email', label: 'Notifications e-mail', description: 'Alertes sur le statut de vos dossiers' },
  { id: 'ai', label: 'Assistance active', description: 'Conseils personnalisés dans vos parcours' },
  { id: 'sharing', label: 'Partage de données', description: 'Entre administrations rattachées' },
] as const;

/** Citizen profile skeleton. Nothing is persisted. */
export default function ProfilePage() {
  useDocumentTitle('Mon profil');
  const accessibility = useUiStore((state) => state.accessibility);
  const setPreference = useUiStore((state) => state.setAccessibilityPreference);

  // Only the three preferences that visibly change rendering are surfaced here;
  // the full list lives on the dedicated accessibility page.
  const quickA11yOptions = ACCESSIBILITY_OPTIONS.filter((option) => option.affectsRendering).slice(0, 3);

  return (
    <div className="mx-auto max-w-container">
      <PageHeader
        title="Mon profil citoyen"
        description="Gérez vos informations personnelles et vos préférences."
        actions={
          <Button>
            <Save aria-hidden="true" />
            Enregistrer les modifications
          </Button>
        }
      />

      <div className="grid gap-gutter lg:grid-cols-3">
        {/* Identity */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <User className="size-5 text-on-surface-variant" aria-hidden="true" />
              <h2 className="text-headline-md text-on-surface">Informations personnelles</h2>
            </span>
            <Button variant="ghost" size="sm">
              <Pencil aria-hidden="true" />
              Modifier
            </Button>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-6 sm:grid-cols-2">
              {IDENTITY_FIELDS.map((label) => (
                <div key={label}>
                  <dt className="mb-1 text-label-sm uppercase tracking-wider text-on-surface-variant">
                    {label}
                  </dt>
                  <dd className="text-body-md text-outline">
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">Non renseigné</span>
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        {/* Assistant slot */}
        <AiSuggestionCard title="Assistant" showFeedback={false}>
          Aucun conseil pour le moment. L’assistant analysera votre profil une fois vos informations
          renseignées.
        </AiSuggestionCard>

        {/* Household */}
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <Users className="size-5 text-on-surface-variant" aria-hidden="true" />
              <h2 className="text-headline-md text-on-surface">Composition du foyer</h2>
            </span>
            <Button variant="ghost" size="icon" aria-label="Modifier la composition du foyer">
              <Pencil aria-hidden="true" />
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <DataRow variant="filled" label="Situation familiale" />
            <DataRow variant="filled" label="Enfants à charge" />
            <DataRow variant="filled" label="Personnes rattachées" />
          </CardContent>
        </Card>

        {/* Housing */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <HomeIcon className="size-5 text-on-surface-variant" aria-hidden="true" />
              <h2 className="text-headline-md text-on-surface">Détails du logement</h2>
            </span>
            <Button variant="ghost" size="icon" aria-label="Modifier les détails du logement">
              <Pencil aria-hidden="true" />
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <DataRow variant="filled" label="Statut d’occupation" />
            <DataRow variant="filled" label="Surface habitable" />
            <DataRow variant="filled" label="Loyer mensuel HC" />
            <DataRow variant="filled" label="Ville" />
          </CardContent>
        </Card>

        {/* Accessibility quick toggles */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <Accessibility className="size-5 text-on-surface-variant" aria-hidden="true" />
              <h2 className="text-headline-md text-on-surface">Accessibilité</h2>
            </span>
            <Button asChild variant="link" size="sm">
              <Link to={ROUTES.profileAccessibility}>Toutes les préférences</Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {quickA11yOptions.map((option) => (
              <div
                key={option.key}
                className="flex items-center justify-between gap-4 rounded-lg border border-border p-4"
              >
                <div>
                  <Label htmlFor={`profile-${option.key}`} className="cursor-pointer">
                    {option.label}
                  </Label>
                  <p className="text-body-sm text-on-surface-variant">{option.description}</p>
                </div>
                <Switch
                  id={`profile-${option.key}`}
                  checked={accessibility[option.key]}
                  onCheckedChange={(checked) => setPreference(option.key, checked)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Notification preferences */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center gap-3">
            <Settings2 className="size-5 text-on-surface-variant" aria-hidden="true" />
            <h2 className="text-headline-md text-on-surface">Paramètres et préférences</h2>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {NOTIFICATION_PREFERENCES.map((preference) => (
              <div
                key={preference.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-border p-4"
              >
                <div>
                  <Label htmlFor={`pref-${preference.id}`} className="cursor-pointer">
                    {preference.label}
                  </Label>
                  <p className="text-body-sm text-on-surface-variant">{preference.description}</p>
                </div>
                <Switch id={`pref-${preference.id}`} />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Situation history */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center gap-3">
            <History className="size-5 text-on-surface-variant" aria-hidden="true" />
            <SectionHeader title="Historique des mises à jour" as="h2" />
          </CardHeader>
          <CardContent className="px-0">
            {HISTORY.length > 0 ? (
              <Table>
                <caption className="sr-only">
                  Historique des déclarations de changement de situation
                </caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type de changement</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {HISTORY.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-on-surface-variant">{entry.date}</TableCell>
                      <TableCell className="text-label-md">{entry.changeType}</TableCell>
                      <TableCell>
                        <StatusBadge status={entry.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                icon={History}
                title="Aucune mise à jour"
                description="Vos déclarations de changement de situation seront historisées ici."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
