import {
  Calculator,
  CheckCircle2,
  CircleDashed,
  Clock,
  FileText,
  IdCard,
  Info,
  Loader2,
  Route,
  Send,
  UserRound,
  X,
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
  type EstimationAide,
  type PersonalizedDossier,
} from '@/types';

/**
 * "Envoyer un dossier" — three independent functions a citizen can use in any
 * order: check completeness/readability, get a rough estimate, and transmit.
 * They share this page because they all read the same profile-driven
 * checklist and application, but none of them requires the others to have
 * run first — a citizen can check their estimate without having uploaded
 * anything yet.
 *
 * Once a dossier is sent, tracking its instruction (status, decision,
 * contestation) lives on "Suivre un dossier déposé" (`SuiviDossierPage`), not
 * here — this page is about acting on a dossier, that one about checking on
 * it, and conflating the two made neither easy to scan.
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

function ChecklistRow({ item }: { item: DossierChecklistItem }) {
  const meta = DOSSIER_STATUS_META[item.status];
  const Icon = STATUS_ICON[item.status];
  // A piece is "received" the moment a deposited file matched it — the row
  // turns green right then, not only once an agent later validates it.
  const isReceived = item.status !== 'missing';

  return (
    <li
      className={cn(
        'rounded-lg border p-4 transition-colors',
        isReceived ? 'border-success/40 bg-success-surface' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <Icon
            className={cn('mt-0.5 size-5 shrink-0', isReceived ? 'text-success' : 'text-on-surface-variant')}
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
    </li>
  );
}

/**
 * The one place documents come in — but they go no further than the
 * browser's memory until "Envoyer le dossier à la CAF" is pressed. No upload,
 * no analysis, no server round-trip happens on drop; a `File` picked here and
 * never sent is discarded the moment the tab closes, exactly like a form
 * nobody submitted, because nothing about it ever left the browser.
 *
 * The trade-off this buys the citizen-facing side (documents.tsx's B1/B4
 * classification, per-file match score) has to wait until the send: there is
 * no server to ask "does this look right?" before that point. The checklist,
 * to its right, keeps showing what is *required* — it just cannot show what
 * is *matched* until the pieces actually reach the server at submission.
 */
function PendingFileRow({
  file,
  onRemove,
  disabled,
}: {
  file: File;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <li className="flex items-center gap-4 rounded-lg border border-border bg-surface-lowest p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary">
        <FileText className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-label-md text-on-surface">{file.name}</p>
        <p className="text-body-sm text-on-surface-variant">
          {(file.size / 1024).toFixed(0)} Ko — en attente d’envoi
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Retirer ${file.name}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <X aria-hidden="true" />
      </Button>
    </li>
  );
}

function PendingFilesColumn({
  files,
  onFilesAdded,
  onRemove,
  disabled,
}: {
  files: File[];
  onFilesAdded: (files: File[]) => void;
  onRemove: (index: number) => void;
  disabled: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <SectionHeader title="Documents à déposer" as="h3" />
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-body-sm text-on-surface-variant">
          Ajoutez vos justificatifs ici — ils restent dans votre navigateur, rien n’est envoyé
          tant que vous n’avez pas cliqué sur « Envoyer le dossier à la CAF ». Si vous quittez la
          page avant, ils sont perdus, comme un formulaire non validé.
        </p>
        <Dropzone
          title="Glissez vos fichiers ici"
          hint="Ou cliquez pour parcourir votre ordinateur — PDF, JPG, PNG"
          disabled={disabled}
          onFilesSelected={onFilesAdded}
        />

        {files.length > 0 && (
          <ul className="flex flex-col gap-3">
            {files.map((file, index) => (
              <PendingFileRow
                key={`${file.name}-${file.size}-${index}`}
                file={file}
                disabled={disabled}
                onRemove={() => onRemove(index)}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
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
 * Indicative benefit estimate — deliberately simplified, never presented as
 * an official figure. Loads on its own; nothing else on the page depends on
 * it, matching the "à volonté" spirit of these three functions.
 */
function EstimationCard() {
  const [estimation, setEstimation] = useState<EstimationAide | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dossierService
      .getEstimation()
      .then(setEstimation)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Estimation impossible.'),
      )
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {isLoading && <Skeleton className="h-20 w-full" />}

        {!isLoading && error && (
          <p className="text-body-sm text-on-surface-variant">{error}</p>
        )}

        {!isLoading && !error && estimation && !estimation.estimationPossible && (
          <p className="flex items-start gap-2 text-body-sm text-on-surface-variant">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Renseignez votre logement (loyer, statut) dans votre profil pour obtenir une
            estimation.
          </p>
        )}

        {!isLoading && !error && estimation && estimation.estimationPossible && (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-display text-primary">{estimation.montantEstime} €</span>
              <span className="text-body-sm text-on-surface-variant">par mois, environ</span>
            </div>
            <dl className="grid gap-x-6 gap-y-2 text-body-sm sm:grid-cols-2">
              <div className="flex justify-between gap-2 sm:flex-col sm:justify-start">
                <dt className="text-on-surface-variant">Loyer retenu</dt>
                <dd className="text-on-surface">{estimation.loyerRetenu} €</dd>
              </div>
              <div className="flex justify-between gap-2 sm:flex-col sm:justify-start">
                <dt className="text-on-surface-variant">Participation personnelle</dt>
                <dd className="text-on-surface">{estimation.participationPersonnelle} €</dd>
              </div>
            </dl>
          </>
        )}

        {!isLoading && !error && estimation && (
          <p className="flex items-start gap-2 rounded-lg bg-surface-container p-3 text-body-sm text-on-surface-variant">
            <Calculator className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {estimation.avertissement}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Transmission to the CAF — and the one moment the pending files actually
 * reach the server. Each is uploaded (storage, OCR, classification, the same
 * pipeline a live-feedback flow would have run earlier) before the
 * application itself is submitted, so by the time the citizen lands on
 * "Suivre un dossier déposé" the checklist already reflects what really
 * arrived. A file that fails to upload is reported but does not block the
 * rest — the citizen still finds out via the completeness rate afterwards.
 *
 * Once sent, this simply confirms it and points to "Suivre un dossier
 * déposé" — the status, decision and contestation live there now, not
 * duplicated on this page.
 */
function SubmissionCard({
  applicationId,
  pendingFiles,
  onFilesCommitted,
  review,
  canSubmit,
  blockingReason,
  profileSnapshot,
  onSubmitted,
}: {
  applicationId: string;
  pendingFiles: File[];
  onFilesCommitted: () => void;
  review: DossierReview | null;
  canSubmit: boolean;
  blockingReason: string | null;
  profileSnapshot: Record<string, unknown>;
  onSubmitted: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadFailures, setUploadFailures] = useState<string[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setIsSubmitting(true);
    setError(null);
    setUploadFailures([]);

    const failures: string[] = [];
    for (const [index, file] of pendingFiles.entries()) {
      setProgress(`Envoi de ${index + 1}/${pendingFiles.length} — ${file.name}`);
      try {
        await dossierService.upload(applicationId, file);
      } catch (cause) {
        failures.push(
          `${file.name} : ${cause instanceof Error ? cause.message : 'l’envoi a échoué.'}`,
        );
      }
    }
    setUploadFailures(failures);
    setProgress(null);

    try {
      await dossierService.submit(applicationId, profileSnapshot);
      onFilesCommitted();
      onSubmitted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La soumission du dossier a échoué.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {review?.submitted ? (
          <div className="rounded-lg border-l-4 border-l-primary bg-primary-fixed p-4 text-body-sm">
            <p className="flex items-center gap-2 text-label-md text-primary">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              Dossier transmis — en cours d’instruction
            </p>
            <p className="mt-1 text-on-surface-variant">Référence {review.application_number}.</p>
            <Button asChild variant="outline-primary" size="sm" className="mt-3">
              <Link to={ROUTES.suivi}>
                <Route aria-hidden="true" />
                Suivre mon dossier
              </Link>
            </Button>
          </div>
        ) : (
          <>
            {blockingReason && (
              <p className="flex items-start gap-2 rounded-lg bg-surface-container p-3 text-body-sm text-on-surface-variant">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {blockingReason}
              </p>
            )}
            <p className="text-body-sm text-on-surface-variant">
              {pendingFiles.length > 0
                ? `${pendingFiles.length} document(s) prêt(s) à être envoyé(s) avec le dossier.`
                : 'Aucun document en attente — vous pouvez tout de même transmettre le dossier.'}
            </p>
            <Button block onClick={submit} disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Send aria-hidden="true" />
              )}
              {progress ?? 'Envoyer le dossier à la CAF'}
            </Button>
            {uploadFailures.length > 0 && (
              <ul className="space-y-1">
                {uploadFailures.map((message) => (
                  <li key={message} role="alert" className="text-body-sm text-destructive">
                    {message}
                  </li>
                ))}
              </ul>
            )}
            {error && (
              <p role="alert" className="text-body-sm text-destructive">
                {error}
              </p>
            )}
          </>
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
  // Held in the browser only — never uploaded until the dossier is sent.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

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
        title="Déposer un dossier"
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
        <div className="space-y-8">
          {/* Function 1 — Vérification complétude et lisibilité */}
          <section className="space-y-gutter">
            <h2 className="text-headline-md text-on-surface">
              Vérification complétude et lisibilité
            </h2>
            <Card>
              <CardHeader>
                <SectionHeader
                  title="Avancement de mon dossier"
                  as="h3"
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

            <CivilStatusCard profile={profile} onSaved={setProfile} />

            <div className="grid gap-gutter lg:grid-cols-3">
              <div className="lg:col-span-2">
                <PendingFilesColumn
                  files={pendingFiles}
                  disabled={Boolean(review?.submitted)}
                  onFilesAdded={(added) => setPendingFiles((current) => [...current, ...added])}
                  onRemove={(index) =>
                    setPendingFiles((current) => current.filter((_, i) => i !== index))
                  }
                />
              </div>

              <aside className="flex flex-col gap-gutter">
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
                        <SectionHeader title={DOSSIER_CATEGORY_LABEL[group.categorie]} as="h3" />
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-3">
                          {group.items.map((item) => (
                            <ChecklistRow key={item.documentType} item={item} />
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  ))
                )}
              </aside>
            </div>
          </section>

          {/* Function 2 — Estimation de l'aide */}
          <section className="space-y-gutter">
            <h2 className="text-headline-md text-on-surface">Estimation de l’aide</h2>
            <EstimationCard />
          </section>

          {/* Function 3 — Envoyer le dossier à la CAF */}
          <section className="space-y-gutter">
            <h2 className="text-headline-md text-on-surface">Envoyer le dossier à la CAF</h2>
            <SubmissionCard
              applicationId={dossier.applicationId}
              pendingFiles={pendingFiles}
              onFilesCommitted={() => setPendingFiles([])}
              review={review}
              canSubmit={canSubmit}
              blockingReason={blockingReason}
              profileSnapshot={profileSnapshot}
              onSubmitted={() => {
                refreshDossier();
                refreshReview();
              }}
            />
          </section>
        </div>
      )}
    </div>
  );
}
