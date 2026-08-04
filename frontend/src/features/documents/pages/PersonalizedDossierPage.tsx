import {
  Calculator,
  CheckCircle2,
  CircleDashed,
  Clock,
  FileCheck2,
  FileText,
  IdCard,
  Info,
  Loader2,
  Route,
  ScanSearch,
  Send,
  ShieldAlert,
  UserRound,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { CitizenBackButton } from '@/components/citizen/CitizenBackButton';
import { Dropzone, EmptyState, PageHeader, SectionHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { birthDateError, socialSecurityNumberError } from '@/lib/civilStatusValidation';
import { cn } from '@/lib/utils';
import { profilPartielToSnapshot } from '@/features/citizen/profiling';
import {
  citizenProfileService,
  type CitizenProfilePersisted,
} from '@/features/citizen/profiling/services/citizenProfileService';
import {
  coherenceService,
  type CoherenceResult,
  type CoherenceStatus,
} from '@/services/coherenceService';
import { dossierService } from '@/services/dossierService';
import { documentService, type DossierReview } from '@/services/documentService';
import {
  DOSSIER_CATEGORY_LABEL,
  DOSSIER_STATUS_META,
  type CitizenDocument,
  type DossierCategory,
  type DossierChecklistItem,
  type EstimationAide,
  type PersonalizedDossier,
} from '@/types';
import { useVoicePage } from '@/features/voice/context/VoicePageContext';

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

/**
 * `ChecklistRow` — reflects a piece's state, and, once received, lets the
 * citizen undo it. "Décocher" removes the document(s) that satisfied this
 * item (`dossierService.remove`, matched via `classification.matched
 * _checklist_document_id === item.documentType`) rather than flipping a
 * local flag — there is no client-side "checked" state to begin with, the
 * status is always derived from what actually reached the server, so
 * unchecking has to go through the same door uploading did.
 */
function ChecklistRow({
  item,
  onUncheck,
  isRemoving,
  disabled,
}: {
  item: DossierChecklistItem;
  onUncheck: () => void;
  isRemoving: boolean;
  disabled: boolean;
}) {
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
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {isReceived && (
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || isRemoving}
              onClick={onUncheck}
              aria-label={`Décocher « ${item.libelle} » — retirer le document déposé`}
            >
              {isRemoving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <X className="size-4" aria-hidden="true" />
              )}
              Décocher
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/** One dropped file's journey through `dossierService.upload`. */
type UploadEntry = {
  id: string;
  file: File;
  status: 'uploading' | 'done' | 'error';
  error?: string;
};

/**
 * The one place documents come in — and, since this rewrite, the moment they
 * actually leave the browser: each drop calls `dossierService.upload`
 * immediately, not at final submission. A citizen who never comes back to
 * click "Envoyer le dossier à la CAF" still has their pieces safely on the
 * application, and — the point of this change — the checklist to the right
 * updates the moment each upload resolves, instead of staying frozen on
 * "manquant" until the very end of the flow.
 *
 * A row shows one of three states: sending (spinner), sent (check — the
 * checklist has already been refreshed), or failed (with the reason and a
 * way to retry without re-dropping the file).
 */
function PendingFileRow({
  entry,
  onRetry,
  onRemove,
  disabled,
}: {
  entry: UploadEntry;
  onRetry: () => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <li className="flex items-center gap-4 rounded-lg border border-border bg-surface-lowest p-4">
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg',
          entry.status === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-primary-fixed text-primary',
        )}
      >
        {entry.status === 'uploading' ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : entry.status === 'done' ? (
          <CheckCircle2 className="size-5" aria-hidden="true" />
        ) : (
          <FileText className="size-5" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-label-md text-on-surface">{entry.file.name}</p>
        <p
          className={cn(
            'text-body-sm',
            entry.status === 'error' ? 'text-destructive' : 'text-on-surface-variant',
          )}
        >
          {entry.status === 'uploading' && 'Envoi en cours…'}
          {entry.status === 'done' && `${(entry.file.size / 1024).toFixed(0)} Ko — envoyé`}
          {entry.status === 'error' && (entry.error ?? 'L’envoi a échoué.')}
        </p>
      </div>
      {entry.status === 'error' && (
        <Button variant="outline" size="sm" disabled={disabled} onClick={onRetry}>
          Réessayer
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Retirer ${entry.file.name}`}
        disabled={disabled || entry.status === 'uploading'}
        onClick={onRemove}
      >
        <X aria-hidden="true" />
      </Button>
    </li>
  );
}

function PendingFilesColumn({
  uploads,
  onFilesAdded,
  onRetry,
  onRemove,
  disabled,
}: {
  uploads: UploadEntry[];
  onFilesAdded: (files: File[]) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <SectionHeader title="Documents à déposer" as="h3" />
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-body-sm text-on-surface-variant">
          Ajoutez vos justificatifs ici — chacun est envoyé immédiatement et vient compléter
          votre dossier ; la liste des pièces ci-contre se met à jour dès qu’il est reçu, sans
          attendre l’envoi final.
        </p>
        <Dropzone
          title="Glissez vos fichiers ici"
          hint="Ou cliquez pour parcourir votre ordinateur — PDF, JPG, PNG"
          disabled={disabled}
          onFilesSelected={onFilesAdded}
        />

        {uploads.length > 0 && (
          <ul className="flex flex-col gap-3">
            {uploads.map((entry) => (
              <PendingFileRow
                key={entry.id}
                entry={entry}
                disabled={disabled}
                onRetry={() => onRetry(entry.id)}
                onRemove={() => onRemove(entry.id)}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export interface CivilStatusCardRef {
  setBirthDate: (val: string) => void;
  setNir: (val: string) => void;
}

/**
 * État civil : NIR + date de naissance.
 *
 * Both are required before submission. When either is missing the citizen can
 * fill it here (the same `PATCH /citizen/profile` the profile page uses), so the
 * dossier is self-contained — no detour to another screen to become submittable.
 */
const CivilStatusCard = forwardRef<
  CivilStatusCardRef,
  {
    profile: CitizenProfilePersisted;
    onSaved: (updated: CitizenProfilePersisted) => void;
  }
>(({ profile, onSaved }, ref) => {
  const hasNir = profile.hasSocialSecurityNumber;
  const hasBirthDate = Boolean(profile.birthDate);
  const complete = hasNir && hasBirthDate;

  const [editing, setEditing] = useState(!complete);
  const [birthDate, setBirthDate] = useState(profile.birthDate ?? '');
  const [nir, setNir] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    setBirthDate: (val: string) => {
      setEditing(true);
      setBirthDate(val);
    },
    setNir: (val: string) => {
      setEditing(true);
      setNir(val);
    },
  }));

  const birthDateInvalid = birthDateError(birthDate);
  const nirInvalid = nir ? socialSecurityNumberError(nir) : null;
  const canSave = !birthDateInvalid && !nirInvalid;

  const save = async () => {
    if (!canSave) return;
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
                  aria-invalid={Boolean(birthDateInvalid)}
                  onChange={(event) => setBirthDate(event.target.value)}
                />
                {birthDateInvalid && (
                  <p role="alert" className="text-body-sm text-destructive">
                    {birthDateInvalid}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="dossier-nir">Numéro de sécurité sociale</Label>
                <Input
                  id="dossier-nir"
                  inputMode="numeric"
                  placeholder={hasNir ? 'Renseigné — laisser vide pour ne pas modifier' : '13 ou 15 chiffres'}
                  value={nir}
                  aria-invalid={Boolean(nirInvalid)}
                  onChange={(event) => setNir(event.target.value)}
                />
                {nirInvalid && (
                  <p role="alert" className="text-body-sm text-destructive">
                    {nirInvalid}
                  </p>
                )}
              </div>
            </div>
            {error && (
              <p role="alert" className="text-body-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={isSaving || !canSave}>
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
});

/**
 * Indicative benefit estimate — deliberately simplified, never presented as
 * an official figure, and deliberately **not** computed until the citizen
 * asks for it: no calculation, no amount, no server call happens on mount.
 *
 * `GET /citizen/estimation` is purely profile-driven (housing situation,
 * rent, income, household size — see `estimer_aide` backend-side): it has no
 * dependency on the checklist or on any uploaded document. It used to be
 * gated here on `missingRequiredItems.length === 0`, a frontend-only
 * restriction the backend never asked for, which meant "Obtenir mon
 * estimation" could refuse to even try before a single document existed.
 * Removed — a citizen can get their estimate the moment their profile is
 * filled in, uploads or not.
 */
function EstimationCard() {
  const [estimation, setEstimation] = useState<EstimationAide | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const lancerEstimation = () => {
    setAttempted(true);
    setIsLoading(true);
    setError(null);
    dossierService
      .getEstimation()
      .then(setEstimation)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Estimation impossible.'),
      )
      .finally(() => setIsLoading(false));
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {!attempted && (
          <div className="space-y-3">
            <p className="text-body-sm text-on-surface-variant">
              Calculez un montant indicatif, à partir des informations validées de votre profil
              — rien n’est calculé tant que vous ne le demandez pas.
            </p>
            <Button onClick={lancerEstimation}>
              <Calculator aria-hidden="true" />
              Obtenir mon estimation
            </Button>
          </div>
        )}

        {attempted && isLoading && <Skeleton className="h-20 w-full" />}

        {attempted && !isLoading && error && (
          <p className="text-body-sm text-on-surface-variant">{error}</p>
        )}

        {attempted && !isLoading && !error && estimation && !estimation.estimationPossible && (
          <p className="flex items-start gap-2 text-body-sm text-on-surface-variant">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Renseignez votre logement (loyer, statut) dans votre profil pour obtenir une
            estimation.
          </p>
        )}

        {attempted && !isLoading && !error && estimation && estimation.estimationPossible && (
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
                <dt className="text-on-surface-variant">Charges retenues</dt>
                <dd className="text-on-surface">{estimation.chargesRetenues} €</dd>
              </div>
              <div className="flex justify-between gap-2 sm:flex-col sm:justify-start">
                <dt className="text-on-surface-variant">Participation personnelle</dt>
                <dd className="text-on-surface">{estimation.participationPersonnelle} €</dd>
              </div>
            </dl>
          </>
        )}

        {attempted && !isLoading && !error && estimation && (
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
 * Action 1 — completeness check.
 *
 * Re-reads the server's own count rather than trusting what the page loaded
 * earlier: uploads are classified asynchronously, so the figure shown before a
 * document finished analysing is already stale by the time a citizen asks.
 */
function CompletudeCard({
  applicationId,
  status,
  requiredReceivedCount,
  requiredDocumentCount,
  onRefreshed,
}: {
  applicationId: string;
  status: PersonalizedDossier['status'];
  requiredReceivedCount: number;
  requiredDocumentCount: number;
  onRefreshed: () => void;
}) {
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const verifier = () => {
    setIsChecking(true);
    setError(null);
    documentService
      .getApplicationStatus(applicationId)
      .then(() => {
        onRefreshed();
        setCheckedAt(new Date());
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Vérification impossible.'),
      )
      .finally(() => setIsChecking(false));
  };

  const missing = Math.max(0, requiredDocumentCount - requiredReceivedCount);
  const complete = status === 'complete';

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-label-md text-on-surface">
            {requiredReceivedCount}/{requiredDocumentCount} pièces obligatoires
          </span>
          <Badge tone={complete ? 'success' : 'info'}>{complete ? 'Complet' : 'Incomplet'}</Badge>
        </div>

        <p className="flex items-start gap-2 text-body-sm text-on-surface-variant">
          {complete ? (
            <>
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              Toutes les pièces obligatoires ont été reçues et lues.
            </>
          ) : (
            <>
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Il manque {missing} pièce{missing > 1 ? 's' : ''} obligatoire
              {missing > 1 ? 's' : ''} — voir la liste ci-dessus.
            </>
          )}
        </p>

        {error && (
          <p role="alert" className="text-body-sm text-destructive">
            {error}
          </p>
        )}

        {checkedAt && !error && (
          <p className="text-label-sm text-on-surface-variant">
            Vérifié à {checkedAt.toLocaleTimeString('fr-FR')}
          </p>
        )}

        <Button variant="outline-primary" onClick={verifier} disabled={isChecking}>
          {isChecking ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <FileCheck2 aria-hidden="true" />
          )}
          Vérifier la complétude
        </Button>
      </CardContent>
    </Card>
  );
}

const COHERENCE_META: Record<
  CoherenceStatus,
  { label: string; tone: 'success' | 'warning' | 'error' }
> = {
  coherent: { label: 'Cohérent', tone: 'success' },
  a_revoir: { label: 'À vérifier', tone: 'warning' },
  incoherent: { label: 'Incohérence détectée', tone: 'error' },
};

/**
 * Cross-document coherence check, run on demand before submitting.
 *
 * Compares what the citizen declared against what the uploaded documents
 * actually say. Same analysis the pipeline runs at submission — offered here so
 * an inconsistency is found by the citizen rather than by an agent.
 *
 * `documentsExtraits` carries what the client genuinely holds: the file name and
 * the OCR text preview. No field is invented to pad the payload.
 */
function CoherenceCard({
  profileSnapshot,
  documents,
}: {
  profileSnapshot: Record<string, unknown>;
  documents: CitizenDocument[];
}) {
  const [result, setResult] = useState<CoherenceResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const analysable = documents.filter((doc) => doc.status !== 'rejected');

  const lancer = () => {
    setAttempted(true);
    setIsLoading(true);
    setError(null);
    coherenceService
      .analyser({
        profilDeclare: profileSnapshot,
        documentsExtraits: analysable.map((doc) => ({
          fichier: doc.fileName,
          type: doc.classification?.matched_checklist_document_id ?? null,
          texte: doc.extractedTextPreview ?? '',
        })),
      })
      .then(setResult)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Analyse impossible.'),
      )
      .finally(() => setIsLoading(false));
  };

  const meta = result ? COHERENCE_META[result.statutGlobal] : null;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {!attempted && (
          <div className="space-y-3">
            <p className="text-body-sm text-on-surface-variant">
              Compare ce que vous avez déclaré à ce que disent vos pièces déposées, et signale les
              écarts avant qu’un agent ne les découvre.
            </p>
            <Button onClick={lancer} disabled={analysable.length === 0}>
              <ScanSearch aria-hidden="true" />
              Tester les incohérences
            </Button>
            {analysable.length === 0 && (
              <p className="text-body-sm text-on-surface-variant">
                Déposez au moins une pièce pour lancer l’analyse.
              </p>
            )}
          </div>
        )}

        {attempted && isLoading && <Skeleton className="h-20 w-full" />}

        {attempted && !isLoading && error && (
          <p role="alert" className="text-body-sm text-destructive">
            {error}
          </p>
        )}

        {attempted && !isLoading && !error && result && meta && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-label-md text-on-surface">Résultat de l’analyse</p>
              <Badge tone={meta.tone}>{meta.label}</Badge>
            </div>

            {result.incoherences.length === 0 ? (
              <p className="flex items-start gap-2 text-body-sm text-on-surface-variant">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                Aucun écart relevé entre vos informations et vos pièces.
              </p>
            ) : (
              <ul className="space-y-3">
                {result.incoherences.map((item, index) => (
                  <li key={`${item.champ}-${index}`} className="rounded-lg border border-border p-3">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-label-md text-on-surface">{item.champ}</p>
                      <Badge tone={COHERENCE_META[item.statut].tone}>
                        {COHERENCE_META[item.statut].label}
                      </Badge>
                    </div>
                    <p className="text-body-sm text-on-surface-variant">{item.raison}</p>
                    {item.fichiersConcernes.length > 0 && (
                      <p className="mt-2 text-label-sm text-on-surface-variant">
                        Pièces concernées : {item.fichiersConcernes.join(', ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <p className="flex items-start gap-2 rounded-lg bg-surface-container p-3 text-body-sm text-on-surface-variant">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Cette analyse vous aide à corriger votre dossier ; elle ne remplace pas la décision de
              l’agent CAF.
            </p>

            <Button variant="outline" size="sm" onClick={lancer}>
              Relancer l’analyse
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Transmission to the CAF. Documents no longer wait for this moment to reach
 * the server — each is uploaded (storage, OCR, classification) as soon as it
 * is dropped in Function 1, and the checklist above already reflects what
 * arrived. This step only submits the application itself, keyed on the
 * profile snapshot; it is the one truly irreversible action on this page, so
 * it stays a single explicit button rather than something that fires as a
 * side effect of uploading.
 *
 * Once sent, this simply confirms it and points to "Suivre un dossier
 * déposé" — the status, decision and contestation live there now, not
 * duplicated on this page.
 */
function SubmissionCard({
  applicationId,
  requiredReceivedCount,
  requiredDocumentCount,
  review,
  canSubmit,
  blockingReason,
  profileSnapshot,
  onSubmitted,
  submitRef,
}: {
  applicationId: string;
  requiredReceivedCount: number;
  requiredDocumentCount: number;
  review: DossierReview | null;
  canSubmit: boolean;
  blockingReason: string | null;
  profileSnapshot: Record<string, unknown>;
  onSubmitted: () => void;
  /** Ref forwarded from the parent so the voice assistant can trigger submission. */
  submitRef?: React.RefObject<HTMLButtonElement>;
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
              {requiredDocumentCount > 0
                ? `${requiredReceivedCount}/${requiredDocumentCount} pièce(s) obligatoire(s) reçue(s).`
                : 'Aucune pièce obligatoire pour votre situation — vous pouvez transmettre le dossier.'}
            </p>
            <Button ref={submitRef} block onClick={submit} disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Send aria-hidden="true" />
              )}
              Envoyer le dossier à la CAF
            </Button>
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
  // Each dropped file's upload journey — sent to the server immediately, not
  // held back until the dossier is submitted (see `PendingFileRow`).
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  // The documents actually on file — the only way to know *which* upload(s)
  // satisfy a given checklist item, so "décocher" knows what to delete.
  const [documents, setDocuments] = useState<CitizenDocument[]>([]);
  // Checklist item keys (`documentType`) currently being unchecked, so the
  // row can show a spinner and disable its own button without a full-page
  // loading state.
  const [removingItemKeys, setRemovingItemKeys] = useState<ReadonlySet<string>>(new Set());
  const [checklistError, setChecklistError] = useState<string | null>(null);

  // Ref to the submit button so the voice assistant can click it
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  // Ref to the civil status card to fill birthDate and NIR
  const civilStatusRef = useRef<CivilStatusCardRef>(null);

  const refreshDossier = useCallback(() => dossierService.getDossier().then(setDossier), []);

  const refreshDocuments = useCallback(() => {
    if (!dossier) return Promise.resolve();
    return dossierService
      .listDocuments(dossier.applicationId)
      .then(setDocuments)
      .catch(() => undefined);
  }, [dossier]);

  // Upload each newly-dropped file right away so the checklist reflects it as
  // soon as the server confirms — this is what makes "the checklist ticks
  // off while documents load" true instead of only at final submission.
  const uploadFile = useCallback(
    (applicationId: string, entry: UploadEntry) => {
      setUploads((current) =>
        current.map((u) => (u.id === entry.id ? { ...u, status: 'uploading', error: undefined } : u)),
      );
      dossierService
        .upload(applicationId, entry.file)
        .then(() => {
          setUploads((current) =>
            current.map((u) => (u.id === entry.id ? { ...u, status: 'done' } : u)),
          );
          refreshDossier();
          refreshDocuments();
        })
        .catch((cause: unknown) => {
          setUploads((current) =>
            current.map((u) =>
              u.id === entry.id
                ? {
                    ...u,
                    status: 'error',
                    error: cause instanceof Error ? cause.message : 'L’envoi a échoué.',
                  }
                : u,
            ),
          );
        });
    },
    [refreshDossier, refreshDocuments],
  );

  const handleFilesAdded = useCallback(
    (files: File[]) => {
      if (!dossier) return;
      const applicationId = dossier.applicationId;
      const entries: UploadEntry[] = files.map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        status: 'uploading',
      }));
      setUploads((current) => [...current, ...entries]);
      entries.forEach((entry) => uploadFile(applicationId, entry));
    },
    [dossier, uploadFile],
  );

  const handleRetry = useCallback(
    (id: string) => {
      if (!dossier) return;
      const entry = uploads.find((u) => u.id === id);
      if (entry) uploadFile(dossier.applicationId, entry);
    },
    [dossier, uploads, uploadFile],
  );

  const handleRemoveUpload = useCallback((id: string) => {
    setUploads((current) => current.filter((u) => u.id !== id));
  }, []);

  // "Décocher" an item: delete the document(s) that matched it — the item's
  // checked state is never a local flag, so unchecking has to remove the
  // thing that made it checked in the first place, then re-read the dossier
  // (and the document list) so the row falls back to "missing" on its own.
  const handleUncheckItem = useCallback(
    async (item: DossierChecklistItem) => {
      const matches = documents.filter(
        (doc) => doc.classification?.matched_checklist_document_id === item.documentType,
      );
      if (matches.length === 0) return;

      setChecklistError(null);
      setRemovingItemKeys((current) => new Set(current).add(item.documentType));
      try {
        await Promise.all(matches.map((doc) => dossierService.remove(doc.id)));
        await Promise.all([refreshDossier(), refreshDocuments()]);
      } catch (cause) {
        setChecklistError(
          cause instanceof Error
            ? cause.message
            : `Impossible de décocher « ${item.libelle} ».`,
        );
      } finally {
        setRemovingItemKeys((current) => {
          const next = new Set(current);
          next.delete(item.documentType);
          return next;
        });
      }
    },
    [documents, refreshDossier, refreshDocuments],
  );

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
        const documentsData = await dossierService
          .listDocuments(dossierData.applicationId)
          .catch(() => []);
        setDocuments(documentsData);
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

  // Register page content for the voice assistant
  useVoicePage({
    readableText:
      'Page Déposer un dossier. Cette page vous permet de vérifier la complétude de vos pièces justificatives, ' +
      'obtenir une estimation de votre aide au logement, et transmettre votre dossier à la CAF. ' +
      (dossier
        ? `Votre dossier est actuellement ${dossier.status === 'complete' ? 'complet' : 'incomplet'} : ` +
          `${dossier.requiredReceivedCount} pièces obligatoires sur ${dossier.requiredDocumentCount} fournies. `
        : '') +
      (!civilStatusComplete ? 'Votre état civil est incomplet. Veuillez renseigner votre numéro de sécurité sociale et votre date de naissance. ' : '') +
      (review?.submitted ? 'Votre dossier a déjà été transmis.' : 'Vous pouvez envoyer votre dossier à la CAF.'),
    actions: [
      {
        id: 'submit_dossier',
        label: 'envoyer le dossier',
        description: 'Envoyer le dossier à la CAF',
        intent: { type: 'click_action', actionId: 'submit_dossier' },
        sensitive: true,
      },
    ],
    fields: [
      {
        fieldId: 'birthdate',
        labels: ['date de naissance', 'naissance'],
        setValue: (val) => civilStatusRef.current?.setBirthDate(val),
      },
      {
        fieldId: 'nir',
        labels: ['numero de securite sociale', 'securite sociale', 'secu', 'nir'],
        setValue: (val) => civilStatusRef.current?.setNir(val),
      },
    ],
    actionCallbacks: {
      submit_dossier: () => submitButtonRef.current?.click(),
    },
  });

  return (
    <div className="mx-auto max-w-container">
      <PageHeader
        eyebrow={<CitizenBackButton fallbackTo={ROUTES.portal} />}
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
        <div className="space-y-10">
          <CivilStatusCard ref={civilStatusRef} profile={profile} onSaved={setProfile} />

          {/* 1 — The checklist. Always on screen: it is the reference a citizen
              reads while gathering papers, so hiding it behind a button made the
              page unusable for its main job. */}
          <section className="space-y-gutter" aria-labelledby="etape-pieces">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="etape-pieces" className="text-headline-md text-on-surface">
                Les pièces attendues
              </h2>
              <Badge tone={dossier.status === 'complete' ? 'success' : 'info'}>
                {dossier.requiredReceivedCount}/{dossier.requiredDocumentCount} pièces obligatoires
              </Badge>
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
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-l-4 border-l-primary bg-primary-fixed p-4 text-body-sm">
                <p className="flex items-center gap-2 text-on-surface-variant">
                  <UserRound className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  Complétez votre profil pour personnaliser davantage la liste des pièces.
                </p>
                <Button variant="outline-primary" size="sm" asChild>
                  <Link to={ROUTES.profile}>Compléter mon profil</Link>
                </Button>
              </div>
            )}

            {checklistError && (
              <p role="alert" className="text-body-sm text-destructive">
                {checklistError}
              </p>
            )}

            {dossier.items.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Aucune pièce requise pour le moment"
                description="Complétez votre profil pour générer la liste de vos justificatifs."
              />
            ) : (
              <div className="grid gap-gutter md:grid-cols-2">
                {groups.map((group) => (
                  <Card key={group.categorie}>
                    <CardHeader>
                      <SectionHeader title={DOSSIER_CATEGORY_LABEL[group.categorie]} as="h3" />
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-3">
                        {group.items.map((item) => (
                          <ChecklistRow
                            key={item.documentType}
                            item={item}
                            disabled={Boolean(review?.submitted)}
                            isRemoving={removingItemKeys.has(item.documentType)}
                            onUncheck={() => handleUncheckItem(item)}
                          />
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* 2 — Deposit. */}
          <section className="space-y-gutter" aria-labelledby="etape-depot">
            <h2 id="etape-depot" className="text-headline-md text-on-surface">
              Déposer vos pièces
            </h2>
            <PendingFilesColumn
              uploads={uploads}
              disabled={Boolean(review?.submitted)}
              onFilesAdded={handleFilesAdded}
              onRetry={handleRetry}
              onRemove={handleRemoveUpload}
            />
          </section>

          {/* 3 — Three actions, each optional and independent: none is a
              prerequisite of the others, so they sit side by side rather than
              in a wizard. */}
          <section className="space-y-gutter" aria-labelledby="etape-actions">
            <div>
              <h2 id="etape-actions" className="text-headline-md text-on-surface">
                Vérifier et transmettre
              </h2>
              <p className="mt-1 text-body-sm text-on-surface-variant">
                Trois actions indépendantes, à lancer dans l’ordre que vous voulez.
              </p>
            </div>

            <div className="grid gap-gutter lg:grid-cols-3">
              <div className="flex flex-col gap-3">
                <SectionHeader title="1 · Complétude du dossier" as="h3" />
                <CompletudeCard
                  applicationId={dossier.applicationId}
                  status={dossier.status}
                  requiredReceivedCount={dossier.requiredReceivedCount}
                  requiredDocumentCount={dossier.requiredDocumentCount}
                  onRefreshed={refreshDossier}
                />
              </div>

              <div className="flex flex-col gap-3">
                <SectionHeader title="2 · Test des incohérences" as="h3" />
                <CoherenceCard profileSnapshot={profileSnapshot} documents={documents} />
              </div>

              <div className="flex flex-col gap-3">
                <SectionHeader title="3 · Envoyer à l’agent CAF" as="h3" />
                <SubmissionCard
                  submitRef={submitButtonRef}
                  applicationId={dossier.applicationId}
                  requiredReceivedCount={dossier.requiredReceivedCount}
                  requiredDocumentCount={dossier.requiredDocumentCount}
                  review={review}
                  canSubmit={canSubmit}
                  blockingReason={blockingReason}
                  profileSnapshot={profileSnapshot}
                  onSubmitted={() => {
                    refreshDossier();
                    refreshReview();
                  }}
                />
              </div>
            </div>
          </section>

          {/* Kept from the previous layout — not one of the three actions above,
              but the only place the citizen can get an indicative amount. */}
          <section className="space-y-gutter" aria-labelledby="etape-estimation">
            <h2 id="etape-estimation" className="text-headline-md text-on-surface">
              Estimation indicative de l’aide
            </h2>
            <EstimationCard />
          </section>
        </div>
      )}
    </div>
  );
}
