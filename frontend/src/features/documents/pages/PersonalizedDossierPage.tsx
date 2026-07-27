import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  FileText,
  IdCard,
  Info,
  Loader2,
  Send,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { Dropzone, EmptyState, PageHeader, SectionHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/utils';
import { DecisionContestation } from '@/features/documents/components/DecisionContestation';
import { profilPartielToSnapshot } from '@/features/citizen/profiling';
import {
  citizenProfileService,
  type CitizenProfilePersisted,
} from '@/features/citizen/profiling/services/citizenProfileService';
import { dossierService } from '@/services/dossierService';
import type { DossierReview } from '@/services/documentService';
import {
  DOSSIER_CATEGORY_LABEL,
  DOSSIER_STATUS_META,
  type DossierCategory,
  type DossierChecklistItem,
  type PersonalizedDossier,
} from '@/types';

/**
 * "Mon dossier personnalisé" — the single, complete citizen dossier.
 *
 * One page for the whole flow: profil → checklist personnalisée → dépôt des
 * pièces → complétude → soumission → instruction. Everything is keyed on the
 * citizen's *own* application (`dossier.applicationId`), derived from their
 * profile — never a fixed demo dossier — so changing the profile changes the
 * checklist here, and uploading a piece flips the matching item.
 *
 * The civil-status block (NIR + date de naissance) is verified before the
 * dossier can be submitted: the administration needs both, and they are captured
 * here rather than left to a separate page.
 */

const STATUS_ICON = {
  missing: CircleDashed,
  uploaded: Clock,
  validated: CheckCircle2,
} as const;

/** ISO `YYYY-MM-DD` → `JJ/MM/AAAA`. */
function formatDateFr(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

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

/**
 * État civil : NIR + date de naissance.
 *
 * Both are required before submission. When either is missing the citizen can
 * fill it here (the same `PATCH /citizen/profile` the profile page uses), so the
 * dossier is self-contained — no detour to another screen to become submittable.
 */
function CivilStatusCard({
  profile,
  onSaved,
}: {
  profile: CitizenProfilePersisted;
  onSaved: (updated: CitizenProfilePersisted) => void;
}) {
  const hasNir = profile.hasSocialSecurityNumber;
  const hasBirthDate = Boolean(profile.birthDate);
  const complete = hasNir && hasBirthDate;

  const [editing, setEditing] = useState(!complete);
  const [birthDate, setBirthDate] = useState(profile.birthDate ?? '');
  const [nir, setNir] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const payload: { birthDate?: string; socialSecurityNumber?: string } = {};
      if (birthDate && birthDate !== (profile.birthDate ?? '')) payload.birthDate = birthDate;
      const digits = nir.replace(/\D/g, '');
      if (digits) payload.socialSecurityNumber = digits;
      if (Object.keys(payload).length === 0) {
        setEditing(false);
        return;
      }
      const updated = await citizenProfileService.mettreAJour(payload);
      setNir('');
      onSaved(updated);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enregistrement impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <SectionHeader
          title="État civil"
          as="h2"
          action={
            <Badge tone={complete ? 'success' : 'neutral'}>
              {complete ? 'Complet' : 'À compléter'}
            </Badge>
          }
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="flex items-start gap-2 text-body-sm text-on-surface-variant">
          <IdCard className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          Votre numéro de sécurité sociale et votre date de naissance sont nécessaires pour
          transmettre le dossier à l’administration.
        </p>

        {!editing ? (
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <div>
              <dt className="mb-1 text-label-sm text-on-surface-variant">
                Numéro de sécurité sociale
              </dt>
              <dd className="text-body-sm text-on-surface">
                {profile.socialSecurityNumberMasked ?? (
                  <span className="text-on-surface-variant">Non renseigné</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="mb-1 text-label-sm text-on-surface-variant">Date de naissance</dt>
              <dd className="text-body-sm text-on-surface">
                {formatDateFr(profile.birthDate) ?? (
                  <span className="text-on-surface-variant">Non renseignée</span>
                )}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Modifier
              </Button>
            </div>
          </dl>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="dossier-naissance">Date de naissance</Label>
                <Input
                  id="dossier-naissance"
                  type="date"
                  value={birthDate}
                  onChange={(event) => setBirthDate(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="dossier-nir">Numéro de sécurité sociale</Label>
                <Input
                  id="dossier-nir"
                  inputMode="numeric"
                  placeholder={hasNir ? 'Renseigné — laisser vide pour ne pas modifier' : '13 ou 15 chiffres'}
                  value={nir}
                  onChange={(event) => setNir(event.target.value)}
                />
              </div>
            </div>
            {error && (
              <p role="alert" className="text-body-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={isSaving}>
                {isSaving ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                Enregistrer
              </Button>
              {complete && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={isSaving}>
                  Annuler
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Submission block: the call-to-action before submission, and the instruction
 * status (coherence + decision + contestation) after it. Keyed on the citizen's
 * real application, so it reflects *this* dossier — not a demo one.
 */
function SubmissionCard({
  applicationId,
  review,
  canSubmit,
  blockingReason,
  profileSnapshot,
  onSubmitted,
}: {
  applicationId: string;
  review: DossierReview | null;
  canSubmit: boolean;
  blockingReason: string | null;
  profileSnapshot: Record<string, unknown>;
  onSubmitted: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await dossierService.submit(applicationId, profileSnapshot);
      onSubmitted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La soumission du dossier a échoué.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <SectionHeader title="Transmission du dossier" as="h2" />
      </CardHeader>
      <CardContent className="space-y-4">
        {review?.decision ? (
          <div
            className={cn(
              'rounded-lg border-l-4 p-4 text-body-sm',
              review.decision.outcome === 'validated'
                ? 'border-l-success bg-success-surface'
                : 'border-l-destructive bg-destructive-surface',
            )}
          >
            <p
              className={cn(
                'flex items-center gap-2 text-label-md',
                review.decision.outcome === 'validated' ? 'text-success' : 'text-destructive',
              )}
            >
              {review.decision.outcome === 'validated' ? (
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              ) : (
                <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              )}
              Décision : {review.decision.outcome === 'validated' ? 'Dossier validé' : 'Dossier rejeté'}
            </p>
            <p className="mt-1 text-on-surface-variant">{review.decision.explanation}</p>
          </div>
        ) : review?.submitted ? (
          <div className="rounded-lg border-l-4 border-l-primary bg-primary-fixed p-4 text-body-sm">
            <p className="flex items-center gap-2 text-label-md text-primary">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              Dossier transmis — en cours d’instruction
            </p>
            <p className="mt-1 text-on-surface-variant">
              Référence {review.application_number}. Un agent instruit votre demande ; la décision
              s’affichera ici.
            </p>
          </div>
        ) : (
          <>
            {blockingReason && (
              <p className="flex items-start gap-2 rounded-lg bg-surface-container p-3 text-body-sm text-on-surface-variant">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {blockingReason}
              </p>
            )}
            <Button block onClick={submit} disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Send aria-hidden="true" />
              )}
              Soumettre mon dossier
            </Button>
            {error && (
              <p role="alert" className="text-body-sm text-destructive">
                {error}
              </p>
            )}
          </>
        )}

        {/* Coherence analysis, once the dossier has been submitted. */}
        {review?.coherence && (
          <div className="rounded-lg border border-border p-4 text-body-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-label-md text-on-surface">Analyse de cohérence</span>
              {typeof review.coherence.score === 'number' && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-label-sm',
                    review.coherence.outcome === 'passed'
                      ? 'bg-success-surface text-success'
                      : review.coherence.outcome === 'failed'
                        ? 'bg-destructive-surface text-destructive'
                        : 'bg-primary-fixed text-primary',
                  )}
                >
                  {review.coherence.score}/100
                </span>
              )}
            </div>
            {review.coherence.explanation && (
              <p className="text-on-surface-variant">{review.coherence.explanation}</p>
            )}
          </div>
        )}

        {/* Droit de contestation — only once a decision exists. */}
        {review?.decision && review.application_number && (
          <DecisionContestation applicationNumber={review.application_number} />
        )}
      </CardContent>
    </Card>
  );
}

export default function PersonalizedDossierPage() {
  useDocumentTitle('Mon dossier personnalisé');
  const [dossier, setDossier] = useState<PersonalizedDossier | null>(null);
  const [profile, setProfile] = useState<CitizenProfilePersisted | null>(null);
  const [review, setReview] = useState<DossierReview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshDossier = useCallback(() => dossierService.getDossier().then(setDossier), []);

  const load = useCallback(() => {
    setError(null);
    return Promise.all([
      dossierService.getDossier(),
      citizenProfileService.obtenir(),
    ])
      .then(async ([dossierData, profileData]) => {
        setDossier(dossierData);
        setProfile(profileData);
        // The review depends on the resolved application id.
        const reviewData = await dossierService
          .getReview(dossierData.applicationId)
          .catch(() => null);
        setReview(reviewData);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Chargement impossible.'),
      )
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refreshReview = useCallback(() => {
    if (!dossier) return Promise.resolve();
    return dossierService
      .getReview(dossier.applicationId)
      .then(setReview)
      .catch(() => undefined);
  }, [dossier]);

  const groups = useMemo(() => (dossier ? groupByCategory(dossier.items) : []), [dossier]);

  // Submission gating: the administration needs civil status, so the NIR and the
  // birth date must be on file before the dossier can be transmitted.
  const civilStatusComplete = Boolean(profile?.hasSocialSecurityNumber && profile?.birthDate);
  const requiredComplete =
    !!dossier && dossier.requiredReceivedCount >= dossier.requiredDocumentCount;
  const canSubmit = civilStatusComplete && !review?.submitted;

  const blockingReason = !civilStatusComplete
    ? 'Renseignez votre état civil (numéro de sécurité sociale et date de naissance) pour transmettre le dossier.'
    : !requiredComplete
      ? 'Certaines pièces obligatoires manquent encore. Vous pouvez transmettre le dossier, mais l’agent verra son taux de complétude.'
      : null;

  const profileSnapshot = useMemo(
    () => (profile ? profilPartielToSnapshot(profile.profile as never) : {}),
    [profile],
  );

  return (
    <div className="mx-auto max-w-container">
      <PageHeader
        title="Mon dossier personnalisé"
        description="Vos pièces justificatives adaptées à votre situation, jusqu’à la transmission à l’administration."
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
            <Button variant="outline" onClick={load}>
              Réessayer
            </Button>
          }
        />
      )}

      {!isLoading && !error && dossier && profile && (
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

          {/* État civil (NIR + date de naissance) */}
          <CivilStatusCard profile={profile} onSaved={setProfile} />

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
                        onUploaded={() => {
                          refreshDossier();
                          refreshReview();
                        }}
                      />
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))
          )}

          {/* Transmission + instruction */}
          <SubmissionCard
            applicationId={dossier.applicationId}
            review={review}
            canSubmit={canSubmit}
            blockingReason={blockingReason}
            profileSnapshot={profileSnapshot}
            onSubmitted={refreshReview}
          />
        </div>
      )}
    </div>
  );
}
