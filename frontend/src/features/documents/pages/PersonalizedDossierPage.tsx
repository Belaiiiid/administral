import { CheckCircle2, CircleDashed, Clock, FileText, Info, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { Dropzone, EmptyState, PageHeader, SectionHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/utils';
import { dossierService } from '@/services/dossierService';
import {
  DOSSIER_CATEGORY_LABEL,
  DOSSIER_STATUS_META,
  type DossierCategory,
  type DossierChecklistItem,
  type PersonalizedDossier,
} from '@/types';

/**
 * "Mon dossier personnalisé" — the checklist derived from the citizen's profile.
 *
 * Every required document is listed with the reason it is asked (grounded in the
 * profile, not invented by a model) and its state. Uploading reuses the existing
 * citizen document endpoint, targeting this dossier's application, so a piece
 * flips the matching checklist item and the completeness bar advances.
 */

const STATUS_ICON = {
  missing: CircleDashed,
  uploaded: Clock,
  validated: CheckCircle2,
} as const;

/** Group items by category, preserving the backend's ordering. */
function groupByCategory(
  items: DossierChecklistItem[],
): { categorie: DossierCategory; items: DossierChecklistItem[] }[] {
  const groups: { categorie: DossierCategory; items: DossierChecklistItem[] }[] = [];
  for (const item of items) {
    let group = groups.find((g) => g.categorie === item.categorie);
    if (!group) {
      group = { categorie: item.categorie, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

function ChecklistRow({
  item,
  applicationId,
  onUploaded,
}: {
  item: DossierChecklistItem;
  applicationId: string;
  onUploaded: () => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = DOSSIER_STATUS_META[item.status];
  const Icon = STATUS_ICON[item.status];

  const upload = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setIsUploading(true);
    setError(null);
    try {
      await dossierService.upload(applicationId, file);
      onUploaded();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'L’envoi a échoué.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <li className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <Icon
            className={cn(
              'mt-0.5 size-5 shrink-0',
              item.status === 'validated'
                ? 'text-success'
                : item.status === 'uploaded'
                  ? 'text-primary'
                  : 'text-on-surface-variant',
            )}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-label-md text-on-surface">
              {item.libelle}
              {!item.required && (
                <span className="ml-2 text-label-sm text-on-surface-variant">(facultatif)</span>
              )}
            </p>
            <p className="mt-0.5 flex items-start gap-1 text-body-sm text-on-surface-variant">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {item.reason}
            </p>
          </div>
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>

      {item.status === 'missing' && (
        <div className="mt-3">
          <Dropzone
            compact
            title={isUploading ? 'Envoi en cours…' : 'Déposer ce document'}
            hint={`Formats acceptés : ${item.formatsAcceptes.join(', ').toUpperCase()}`}
            disabled={isUploading}
            onFilesSelected={upload}
          />
          {error && (
            <p role="alert" className="mt-2 text-body-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export default function PersonalizedDossierPage() {
  useDocumentTitle('Mon dossier personnalisé');
  const [dossier, setDossier] = useState<PersonalizedDossier | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useMemo(
    () => () => {
      setError(null);
      return dossierService
        .getDossier()
        .then(setDossier)
        .catch((cause: unknown) =>
          setError(cause instanceof Error ? cause.message : 'Chargement impossible.'),
        )
        .finally(() => setIsLoading(false));
    },
    [],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const groups = useMemo(() => (dossier ? groupByCategory(dossier.items) : []), [dossier]);

  return (
    <div className="mx-auto max-w-container">
      <PageHeader
        title="Mon dossier personnalisé"
        description="Les pièces justificatives adaptées à votre situation, avec le motif de chaque demande."
      />

      {isLoading && (
        <div className="space-y-gutter">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {!isLoading && error && (
        <EmptyState
          icon={Info}
          title="Chargement impossible"
          description={error}
          actions={
            <Button variant="outline" onClick={refresh}>
              Réessayer
            </Button>
          }
        />
      )}

      {!isLoading && !error && dossier && (
        <div className="space-y-gutter">
          {/* Completeness summary */}
          <Card>
            <CardHeader>
              <SectionHeader
                title="Avancement de mon dossier"
                as="h2"
                action={
                  <Badge tone={dossier.status === 'complete' ? 'success' : 'info'}>
                    {dossier.status === 'complete' ? 'Complet' : 'Incomplet'}
                  </Badge>
                }
              />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-body-sm text-on-surface-variant">
                  Pièces obligatoires fournies
                </span>
                <span className="text-label-md text-on-surface">
                  {dossier.requiredReceivedCount}/{dossier.requiredDocumentCount}
                </span>
              </div>
              <Progress
                value={
                  dossier.requiredDocumentCount
                    ? (dossier.requiredReceivedCount / dossier.requiredDocumentCount) * 100
                    : 0
                }
                aria-label={`${dossier.requiredReceivedCount} pièces obligatoires sur ${dossier.requiredDocumentCount}`}
              />
              {!dossier.profileComplete && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border-l-4 border-l-primary bg-primary-fixed p-4 text-body-sm">
                  <p className="flex items-center gap-2 text-on-surface-variant">
                    <UserRound className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    Complétez votre profil pour personnaliser davantage la liste des pièces.
                  </p>
                  <Button variant="outline-primary" size="sm" asChild>
                    <Link to={ROUTES.profile}>Compléter mon profil</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Checklist by category */}
          {dossier.items.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Aucune pièce requise pour le moment"
              description="Complétez votre profil pour générer la liste de vos justificatifs."
            />
          ) : (
            groups.map((group) => (
              <Card key={group.categorie}>
                <CardHeader>
                  <SectionHeader title={DOSSIER_CATEGORY_LABEL[group.categorie]} as="h2" />
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {group.items.map((item) => (
                      <ChecklistRow
                        key={item.documentType}
                        item={item}
                        applicationId={dossier.applicationId}
                        onUploaded={refresh}
                      />
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
