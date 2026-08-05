import {
  Calculator,
  CheckCircle2,
  CircleDashed,
  Clock,
  Eye,
  FileCheck2,
  FileText,
  Info,
  Loader2,
  Plus,
  Route,
  ScanSearch,
  Send,
  ShieldAlert,
  UserRound,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { citizenButton } from '@/components/citizen/citizenButton';
import { Dropzone, EmptyState, PageHeader, SectionHeader } from '@/components/shared';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useIsDesktop } from '@/hooks/useMediaQuery';
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
import { DocumentViewer } from '@/features/documents/components/DocumentViewer';
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
 * `ChecklistRow` — l'état d'une pièce, et sa propre cible de dépôt.
 *
 * La ligne accepte un fichier déposé dessus, et porte un bouton d'ajout
 * explicite pour qui ne fait pas de glisser-déposer. Les deux passent par le
 * même `onFilesAdded` que la zone globale : le serveur classe le fichier et
 * décide à quelle pièce il correspond, il n'y a pas de rattachement côté
 * client — déposer sur une ligne est un raccourci de saisie, pas une promesse
 * que le fichier atterrira sur *cette* ligne.
 *
 * "Décocher" supprime le(s) document(s) qui satisfaisaient l'item
 * (`dossierService.remove`, apparié via
 * `classification.matched_checklist_document_id === item.documentType`) plutôt
 * que de basculer un drapeau local : le statut vient toujours de ce qui a
 * atteint le serveur.
 */
function ChecklistRow({
  item,
  onUncheck,
  onFilesAdded,
  isRemoving,
  disabled,
  matchedDocuments,
  onViewDocument,
}: {
  item: DossierChecklistItem;
  onUncheck: () => void;
  onFilesAdded: (files: File[]) => void;
  isRemoving: boolean;
  disabled: boolean;
  /** The uploads that satisfied this line — usually one, sometimes several. */
  matchedDocuments: CitizenDocument[];
  onViewDocument: (document: CitizenDocument) => void;
}) {
  const meta = DOSSIER_STATUS_META[item.status];
  const Icon = STATUS_ICON[item.status];
  // A piece is "received" the moment a deposited file matched it — the row
  // turns green right then, not only once an agent later validates it.
  const isReceived = item.status !== 'missing';
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectFiles = (files: FileList | null) => {
    if (files?.length) onFilesAdded(Array.from(files));
  };

  return (
    <li
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragOver(false);
        if (!disabled) selectFiles(event.dataTransfer.files);
      }}
      className={cn(
        'rounded-lg border px-3 py-2 transition-colors',
        isReceived ? 'border-success/40 bg-success-surface' : 'border-border',
        isDragOver && 'border-primary bg-primary-fixed/30',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon
            className={cn('size-4 shrink-0', isReceived ? 'text-success' : 'text-on-surface-variant')}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="truncate text-label-md text-on-surface">
              {item.libelle}
              {!item.required && (
                <span className="ml-2 text-label-sm text-on-surface-variant">(facultatif)</span>
              )}
            </p>
            {isDragOver && (
              <p className="text-label-sm text-primary">Déposez le fichier ici</p>
            )}
          </div>
          {/* La justification ("parce que vous êtes locataire…") quitte le flux
              pour garder la ligne compacte, mais reste accessible au survol
              comme au focus clavier plutôt que d'être perdue. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="shrink-0 rounded-full text-on-surface-variant transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Pourquoi « ${item.libelle} » est demandé`}
              >
                <Info className="size-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{item.reason}</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/*
            A labelled button rather than an icon: this is the one action on the
            row a citizen actively looks for, and « Consulter » next to the
            unlabelled + and × is what makes it findable.

            One button per matched upload, because a line can be satisfied by
            several files (three bulletins de salaire). With a single file the
            button just says « Consulter »; with more, each carries its own file
            name, so there is never a choice made silently on the citizen's
            behalf about which piece opens.
          */}
          {matchedDocuments.map((document) => (
            <Button
              key={document.id}
              variant="outline"
              size="sm"
              onClick={() => onViewDocument(document)}
              aria-label={`Consulter « ${document.fileName} »`}
              className="max-w-[11rem]"
            >
              <Eye className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {matchedDocuments.length > 1 ? document.fileName : 'Consulter'}
              </span>
            </Button>
          ))}
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(event) => {
              selectFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            aria-label={`Ajouter un fichier pour « ${item.libelle} »`}
          >
            <Plus className="size-4" aria-hidden="true" />
          </Button>
          {isReceived && (
            <Button
              variant="ghost"
              size="icon"
              disabled={disabled || isRemoving}
              onClick={onUncheck}
              aria-label={`Décocher « ${item.libelle} » — retirer le document déposé`}
            >
              {isRemoving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <X className="size-4" aria-hidden="true" />
              )}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * La checklist, une catégorie par panneau repliable.
 *
 * Tout est replié par défaut sauf la première catégorie à laquelle il manque
 * une pièce : c'est là que le citoyen a quelque chose à faire, et c'est la
 * seule ouverture qui le guide sans lui rendre la colonne illisible. Sur mobile
 * (`openByDefault` reçoit `undefined`) même cette catégorie reste fermée — la
 * colonne y passe sous le dépôt, et une liste dépliée y ajouterait un écran
 * entier de défilement avant le reste de la page.
 *
 * `type="multiple"` : ouvrir une catégorie n'en referme pas une autre, un
 * citoyen qui compare deux rubriques n'a pas à faire d'aller-retour.
 */
function ChecklistAccordion({
  groups,
  openByDefault,
  disabled,
  removingItemKeys,
  onUncheck,
  onFilesAdded,
  documentsByType,
  onViewDocument,
}: {
  groups: { categorie: DossierCategory; items: DossierChecklistItem[] }[];
  openByDefault: DossierCategory | undefined;
  disabled: boolean;
  removingItemKeys: ReadonlySet<string>;
  onUncheck: (item: DossierChecklistItem) => void;
  onFilesAdded: (files: File[]) => void;
  /** Uploads indexed by the checklist line they matched. */
  documentsByType: ReadonlyMap<string, CitizenDocument[]>;
  onViewDocument: (document: CitizenDocument) => void;
}) {
  // Clé de remontage : quand le passage mobile/desktop change la valeur par
  // défaut, l'accordéon doit repartir de cet état plutôt que garder celui que
  // le citoyen avait sur l'autre disposition.
  const defaultValue = openByDefault ? [openByDefault] : [];

  return (
    <TooltipProvider delayDuration={200}>
      <Accordion
        key={openByDefault ?? 'all-closed'}
        type="multiple"
        defaultValue={defaultValue}
        className="rounded-lg border border-border bg-surface-lowest px-4"
      >
        {groups.map((group) => {
          const received = group.items.filter((item) => item.status !== 'missing').length;
          return (
            <AccordionItem
              key={group.categorie}
              value={group.categorie}
              className="last:border-b-0"
            >
              <AccordionTrigger className="py-3">
                <span className="flex flex-1 items-center justify-between gap-3 pr-2">
                  <span className="text-label-md text-on-surface">
                    {DOSSIER_CATEGORY_LABEL[group.categorie]}
                  </span>
                  <Badge tone={received === group.items.length ? 'success' : 'info'}>
                    {received}/{group.items.length} reçues
                  </Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <ul className="space-y-2">
                  {group.items.map((item) => (
                    <ChecklistRow
                      key={item.documentType}
                      item={item}
                      disabled={disabled}
                      isRemoving={removingItemKeys.has(item.documentType)}
                      onUncheck={() => onUncheck(item)}
                      onFilesAdded={onFilesAdded}
                      matchedDocuments={documentsByType.get(item.documentType) ?? []}
                      onViewDocument={onViewDocument}
                    />
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </TooltipProvider>
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

/**
 * Avancement du dossier : pièces obligatoires reçues sur obligatoires demandées.
 *
 * Rendu à deux endroits (bloc de dépôt et colonne des pièces attendues) à
 * partir d'un seul objet, `checklistProgress`, dérivé du dossier chargé. Les
 * deux affichages ne peuvent donc pas diverger — c'était le cas quand le dépôt
 * comptait tous les items et l'en-tête seulement les obligatoires.
 *
 * Le dénominateur n'est pas une constante : le backend regénère la checklist à
 * chaque `GET /citizen/dossier` depuis le profil, donc le total change d'un
 * citoyen à l'autre et quand la situation d'un même citoyen évolue.
 */
function ChecklistProgress({
  receivedCount,
  totalCount,
}: {
  receivedCount: number;
  totalCount: number;
}) {
  if (totalCount === 0) {
    return (
      <p className="text-label-md text-on-surface-variant">
        Liste des pièces en attente de personnalisation
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-label-md text-on-surface">
        {receivedCount}/{totalCount} pièce{totalCount > 1 ? 's' : ''} obligatoire
        {totalCount > 1 ? 's' : ''} reçue{totalCount > 1 ? 's' : ''}
      </p>
      <Progress
        value={(receivedCount / totalCount) * 100}
        aria-label={`${receivedCount} pièces obligatoires reçues sur ${totalCount}`}
      />
    </div>
  );
}

/**
 * "Vos documents" — la checklist et le dépôt dans un seul bloc.
 *
 * Ils étaient côte à côte, chacun avec sa barre de progression : deux endroits
 * pour la même information, et un aller-retour du regard entre "ce qu'on me
 * demande" et "où je dépose". Ici la zone globale sert le cas courant (plusieurs
 * fichiers d'un coup, le serveur les classe), et chaque ligne de la liste est
 * elle-même une cible de dépôt pour le cas précis. Une seule progression, celle
 * du bloc, et une seule liste de statuts : celle du serveur.
 */
function DocumentsSection({
  uploads,
  onFilesAdded,
  onRetry,
  onRemove,
  disabled,
  progress,
  groups,
  openByDefault,
  removingItemKeys,
  onUncheck,
  hasItems,
  profileComplete,
  checklistError,
  documentsByType,
  onViewDocument,
}: {
  uploads: UploadEntry[];
  onFilesAdded: (files: File[]) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  disabled: boolean;
  progress: { receivedCount: number; totalCount: number };
  groups: { categorie: DossierCategory; items: DossierChecklistItem[] }[];
  openByDefault: DossierCategory | undefined;
  removingItemKeys: ReadonlySet<string>;
  onUncheck: (item: DossierChecklistItem) => void;
  hasItems: boolean;
  profileComplete: boolean;
  checklistError: string | null;
  documentsByType: ReadonlyMap<string, CitizenDocument[]>;
  onViewDocument: (document: CitizenDocument) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <SectionHeader title="Vos documents" as="h2" />
      </CardHeader>
      <CardContent className="space-y-gutter">
        <ChecklistProgress
          receivedCount={progress.receivedCount}
          totalCount={progress.totalCount}
        />

        <Dropzone
          compact
          title="Glissez vos fichiers ici"
          hint="Plusieurs à la fois — chaque fichier est associé automatiquement à la pièce correspondante. PDF, JPG, PNG"
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

        {!profileComplete && (
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

        {!hasItems ? (
          <EmptyState
            icon={FileText}
            title="Aucune pièce requise pour le moment"
            description="Complétez votre profil pour générer la liste de vos justificatifs."
          />
        ) : (
          <ChecklistAccordion
            groups={groups}
            openByDefault={openByDefault}
            disabled={disabled}
            removingItemKeys={removingItemKeys}
            onUncheck={onUncheck}
            onFilesAdded={onFilesAdded}
            documentsByType={documentsByType}
            onViewDocument={onViewDocument}
          />
        )}
      </CardContent>
    </Card>
  );
}

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
 *
 * Hors du parcours de dépôt : l'estimation ne dépend d'aucune pièce, elle ne
 * doit donc pas s'intercaler entre déposer, vérifier et transmettre. Elle vit
 * dans un bouton permanent en tête de page, qui ouvre cette modale — disponible
 * à tout moment, sans jamais interrompre le fil.
 */
function EstimationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dossier-scope max-w-xl">
        <DialogHeader>
          <DialogTitle>Estimation indicative de l’aide</DialogTitle>
          <DialogDescription>
            Calculée à partir des informations de votre profil, indépendamment des pièces
            déposées.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!attempted && (
            <div className="space-y-3">
              <p className="text-body-sm text-on-surface-variant">
                Rien n’est calculé tant que vous ne le demandez pas.
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
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Fermer</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Une étape du stepper : pastille numérotée, ligne de liaison, état court,
 * action.
 *
 * La numérotation est l'ordre à suivre : compléter, puis contrôler la
 * cohérence, puis envoyer — corriger un écart après l'envoi n'est plus
 * possible. Techniquement les trois appels restent indépendants côté serveur,
 * donc rien n'est verrouillé ; c'est l'énoncé et la ligne du stepper qui
 * portent l'ordre.
 */
function StepperStep({
  index,
  isLast,
  title,
  state,
  tone = 'info',
  children,
}: {
  index: number;
  isLast: boolean;
  title: string;
  state: string;
  tone?: 'success' | 'info' | 'warning';
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full text-label-md',
            tone === 'success' ? 'bg-success text-white' : 'bg-primary-fixed text-primary',
          )}
          aria-hidden="true"
        >
          {index}
        </span>
        {/* La ligne de liaison : elle relie visuellement les étapes sans rien
            impliquer sur leur ordre d'exécution. */}
        {!isLast && <span className="w-px flex-1 bg-border" aria-hidden="true" />}
      </div>
      <div className={cn('min-w-0 flex-1 space-y-3', isLast ? 'pb-0' : 'pb-gutter')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-label-md text-on-surface">{title}</h3>
          <Badge tone={tone}>{state}</Badge>
        </div>
        {children}
      </div>
    </li>
  );
}

/**
 * Étape 1 — complétude, en ligne dans la page.
 *
 * Pas de modale : la liste des pièces manquantes est déjà à l'écran, juste
 * au-dessus, dans "Vos documents". Rouvrir la même information par-dessus
 * serait la dupliquer.
 *
 * Relit le compte du serveur plutôt que de faire confiance à ce que la page a
 * chargé : les dépôts sont classés de façon asynchrone, le chiffre affiché
 * avant la fin d'une analyse est déjà périmé quand le citoyen demande.
 */
function CompletudeStep({
  applicationId,
  items,
  onRefreshed,
  onChecked,
}: {
  applicationId: string;
  /** Sert à nommer les pièces qui manquent : le compteur seul ne dit pas lesquelles. */
  items: DossierChecklistItem[];
  onRefreshed: () => void;
  /** Signale que l'étape a tourné au moins une fois (message d'accompagnement). */
  onChecked: () => void;
}) {
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [verdict, setVerdict] = useState<{ received: number; total: number } | null>(null);

  const verifier = () => {
    setIsChecking(true);
    setError(null);
    documentService
      .getApplicationStatus(applicationId)
      .then((status) => {
        onRefreshed();
        // Le compte vient de la réponse du serveur, pas de l'état de la page :
        // c'est tout l'intérêt de cette étape.
        setVerdict({
          received: status.requiredReceivedCount,
          total: status.requiredDocumentCount,
        });
        setCheckedAt(new Date());
        onChecked();
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Vérification impossible.'),
      )
      .finally(() => setIsChecking(false));
  };

  // Nommées au rendu, donc après le rafraîchissement déclenché ci-dessus.
  const manquantes = items.filter((item) => item.required && item.status === 'missing');
  const complet = verdict !== null && verdict.received >= verdict.total;

  return (
    <div className="space-y-2">
      <p className="text-body-sm text-on-surface-variant">
        Relit vos pièces côté serveur et met à jour la liste ci-dessus.
      </p>

      {error && (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      )}

      {/*
        Le résultat, en toutes lettres. Avant, un clic ne produisait qu'un
        « Vérifié à 14:32:05 » : le citoyen apprenait que quelque chose s'était
        passé, jamais ce que ça donnait. `role="status"` le fait annoncer aux
        lecteurs d'écran, qui autrement ne voyaient rien changer non plus.
      */}
      {verdict && !error && (
        <div
          role="status"
          className={cn(
            'rounded-lg border-l-4 p-3 text-body-sm',
            // `--warning-surface` est un fond soutenu prévu pour du texte blanc
            // (cf. components/ui/badge) : l'utiliser ici donnait du texte
            // sombre sur bordeaux. La barre latérale porte l'accent, le fond
            // reste la surface neutre déjà employée par les encarts de la page.
            complet
              ? 'border-l-success bg-success-surface text-on-surface'
              : 'border-l-warning bg-surface-container text-on-surface',
          )}
        >
          <p className="flex items-start gap-2 text-label-md">
            {complet ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            )}
            {complet
              ? `Dossier complet — les ${verdict.total} pièces obligatoires ont été reçues.`
              : `${verdict.received} pièce${verdict.received > 1 ? 's' : ''} sur ${verdict.total} reçue${verdict.received > 1 ? 's' : ''} : il en manque ${verdict.total - verdict.received}.`}
          </p>

          {!complet && manquantes.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-8 text-on-surface-variant">
              {manquantes.map((item) => (
                <li key={item.documentType}>{item.libelle}</li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-label-sm text-on-surface-variant">
            {complet
              ? 'Vous pouvez transmettre votre dossier.'
              : 'Vous pouvez transmettre malgré tout : l’agent verra le taux de complétude.'}{' '}
            Vérifié à {checkedAt?.toLocaleTimeString('fr-FR')}.
          </p>
        </div>
      )}

      <Button
        className={citizenButton({ variant: 'marianne' })}
        onClick={verifier}
        disabled={isChecking}
      >
        {isChecking ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <FileCheck2 aria-hidden="true" />
        )}
        Vérifier la complétude
      </Button>
    </div>
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
function CoherenceStep({
  profileSnapshot,
  documents,
  onRevoirDocuments,
  onResult,
}: {
  profileSnapshot: Record<string, unknown>;
  documents: CitizenDocument[];
  /** Referme la modale et ramène le citoyen sur ses pièces. */
  onRevoirDocuments: () => void;
  /** Remonte le verdict, à titre d'information — il ne conditionne plus l'envoi. */
  onResult: (result: CoherenceResult) => void;
}) {
  const [open, setOpen] = useState(false);
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
      .then((analysis) => {
        setResult(analysis);
        onResult(analysis);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Analyse impossible.'),
      )
      .finally(() => setIsLoading(false));
  };

  const ouvrirEtLancer = () => {
    setOpen(true);
    lancer();
  };

  const meta = result ? COHERENCE_META[result.statutGlobal] : null;
  const ecarts = result?.incoherences.length ?? 0;

  return (
    <div className="space-y-2">
      <p className="text-body-sm text-on-surface-variant">
        Compare ce que vous avez déclaré à ce que disent vos pièces, et signale les écarts avant
        qu’un agent ne les découvre.
      </p>
      {/* Seule condition restante : il faut quelque chose à analyser. */}
      {analysable.length === 0 && (
        <p className="text-body-sm text-on-surface-variant">
          Déposez au moins une pièce pour lancer l’analyse.
        </p>
      )}
      <Button
        className={citizenButton({ variant: 'marianne' })}
        onClick={ouvrirEtLancer}
        disabled={analysable.length === 0}
      >
        <ScanSearch aria-hidden="true" />
        Tester les incohérences
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="dossier-scope max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Test des incohérences</DialogTitle>
            <DialogDescription>
              {isLoading
                ? 'Analyse en cours…'
                : result
                  ? `${ecarts} écart${ecarts > 1 ? 's' : ''} détecté${ecarts > 1 ? 's' : ''} sur ${analysable.length} pièce${analysable.length > 1 ? 's' : ''} analysée${analysable.length > 1 ? 's' : ''}.`
                  : 'Comparaison de votre profil déclaré avec vos pièces déposées.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {isLoading && <Skeleton className="h-24 w-full" />}

            {!isLoading && error && (
              <p role="alert" className="text-body-sm text-destructive">
                {error}
              </p>
            )}

            {!isLoading && !error && result && meta && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-label-md text-on-surface">Résultat de l’analyse</p>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>

                {result.incoherences.length === 0 ? (
                  <p className="flex items-start gap-2 text-body-sm text-on-surface-variant">
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-success"
                      aria-hidden="true"
                    />
                    Aucun écart relevé entre vos informations et vos pièces.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {result.incoherences.map((item, index) => (
                      <li
                        key={`${item.champ}-${index}`}
                        className="rounded-lg border border-border p-3"
                      >
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                          <p className="flex items-center gap-2 text-label-md text-on-surface">
                            {item.coherent ? (
                              <CheckCircle2
                                className="size-4 shrink-0 text-success"
                                aria-hidden="true"
                              />
                            ) : (
                              <ShieldAlert
                                className="size-4 shrink-0 text-warning"
                                aria-hidden="true"
                              />
                            )}
                            {item.champ}
                          </p>
                          <Badge tone={COHERENCE_META[item.statut].tone}>
                            {COHERENCE_META[item.statut].label}
                          </Badge>
                        </div>
                        <p className="text-body-sm text-on-surface-variant">{item.raison}</p>
                        {/* Ce que le document dit, tel que l'analyseur l'a lu.
                            Le service ne renvoie pas la valeur déclarée en
                            regard : on montre l'extrait, sans reconstituer un
                            « déclaré » que personne n'a renvoyé. */}
                        {item.preuves.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {item.preuves.map((preuve, preuveIndex) => (
                              <li
                                key={preuveIndex}
                                className="rounded-lg bg-surface-container px-3 py-2 text-body-sm text-on-surface-variant"
                              >
                                « {preuve} »
                              </li>
                            ))}
                          </ul>
                        )}
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
                  Cette analyse vous aide à corriger votre dossier ; elle ne remplace pas la
                  décision de l’agent CAF.
                </p>
              </>
            )}

            {attempted && !isLoading && (
              <Button variant="outline" size="sm" onClick={lancer}>
                Relancer l’analyse
              </Button>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Fermer</Button>
            </DialogClose>
            <Button
              onClick={() => {
                setOpen(false);
                onRevoirDocuments();
              }}
            >
              Revoir mes documents
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
function SubmissionStep({
  applicationId,
  review,
  canSubmit,
  blockingReason,
  profileSnapshot,
  onSubmitted,
  submitRef,
}: {
  applicationId: string;
  review: DossierReview | null;
  canSubmit: boolean;
  blockingReason: string | null;
  profileSnapshot: Record<string, unknown>;
  onSubmitted: () => void;
  /** Ref forwarded from the parent so the voice assistant can trigger submission. */
  submitRef?: React.RefObject<HTMLButtonElement>;
}) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await dossierService.submit(applicationId, profileSnapshot);
      setOpen(false);
      onSubmitted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La soumission du dossier a échoué.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (review?.submitted) {
    return (
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
    );
  }

  return (
    <div className="space-y-2">
      {/* L'envoi reste possible sur un dossier incomplet — le backend ne l'a
          jamais interdit — mais le citoyen doit savoir ce que l'agent verra. */}
      {blockingReason && (
        <p className="flex items-start gap-2 rounded-lg bg-surface-container p-3 text-body-sm text-on-surface-variant">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {blockingReason}
        </p>
      )}

      {error && (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      )}

      {/* Confirmation en modale, comme l'étape 2 : c'est la seule action
          irréversible de la page, elle ne part pas sur un simple clic. */}
      <Button
        ref={submitRef}
        className={citizenButton({ variant: 'marianne' })}
        onClick={() => setOpen(true)}
        disabled={!canSubmit}
      >
        <Send aria-hidden="true" />
        Envoyer le dossier à la CAF
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="dossier-scope">
          <DialogHeader>
            <DialogTitle>Envoyer le dossier à la CAF</DialogTitle>
            <DialogDescription>
              Votre dossier part en instruction. Vous pourrez suivre son avancement, mais pas
              revenir sur cet envoi.
            </DialogDescription>
          </DialogHeader>

          {blockingReason && (
            <p className="flex items-start gap-2 rounded-lg bg-surface-container p-3 text-body-sm text-on-surface-variant">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {blockingReason}
            </p>
          )}

          {error && (
            <p role="alert" className="text-body-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isSubmitting}>
                Annuler
              </Button>
            </DialogClose>
            <Button onClick={submit} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Send aria-hidden="true" />
              )}
              Confirmer l’envoi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
  // The piece being read, or null. One dialog for the whole checklist: moving
  // from one document to the next swaps the fetch rather than remounting, so a
  // single object URL is alive at a time.
  const [openDocument, setOpenDocument] = useState<CitizenDocument | null>(null);

  // Ref to the submit button so the voice assistant can click it
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  // "Revoir mes documents", depuis la modale de cohérence : la modale se ferme
  // et la page remonte sur le bloc où les pièces se corrigent.
  const documentsSectionRef = useRef<HTMLElement>(null);
  const [estimationOpen, setEstimationOpen] = useState(false);

  const scrollToDocuments = useCallback(() => {
    documentsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Progression séquentielle des trois étapes. `completenessChecked` n'est levé
  // que dans le `.then` de l'étape 1 : une vérification en erreur ne déverrouille
  // rien. `coherenceResult` porte le verdict de l'étape 2, dont l'étape 3 dépend.
  const [completenessChecked, setCompletenessChecked] = useState(false);
  const [coherenceResult, setCoherenceResult] = useState<CoherenceResult | null>(null);

  // Le verdict de cohérence ne vaut que pour le jeu de pièces analysé : déposer
  // ou retirer un document après coup le périme. Sans cette remise à zéro, un
  // citoyen pourrait passer l'étape 2, ajouter une pièce contradictoire, et
  // transmettre malgré tout sur une analyse qui ne l'a jamais vue.
  const documentsSignature = documents.map((doc) => doc.id).sort().join('|');
  useEffect(() => {
    setCoherenceResult(null);
  }, [documentsSignature]);

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

  /*
   * Uploads indexed by the checklist line they satisfied — the same key
   * `handleUncheckItem` matches on, so a row's "consulter" links and its
   * "décocher" act on exactly the same set of files.
   *
   * Only documents the classifier placed appear here, which is also the
   * condition the download route enforces: a row can never offer a link the
   * server would refuse.
   */
  const documentsByType = useMemo(() => {
    const index = new Map<string, CitizenDocument[]>();
    for (const document of documents) {
      const key = document.classification?.matched_checklist_document_id;
      if (!key) continue;
      const bucket = index.get(key);
      if (bucket) bucket.push(document);
      else index.set(key, [document]);
    }
    return index;
  }, [documents]);

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

  // L'unique source de vérité des deux barres de progression : les compteurs de
  // pièces *obligatoires* renvoyés par le serveur, ceux-là mêmes qui décident de
  // la complétude du dossier. Les deux barres lisent cet objet, elles ne peuvent
  // donc plus afficher deux chiffres différents. Le total reste variable — la
  // checklist est regénérée depuis le profil à chaque lecture du dossier.
  const checklistProgress = useMemo(
    () => ({
      receivedCount: dossier?.requiredReceivedCount ?? 0,
      totalCount: dossier?.requiredDocumentCount ?? 0,
    }),
    [dossier],
  );

  // La catégorie ouverte au chargement : la première à laquelle il manque une
  // pièce. Sur mobile, aucune — la colonne y est empilée sous le dépôt, on
  // évite d'y déployer une liste avant que le citoyen la demande.
  const isDesktop = useIsDesktop();
  const firstIncompleteCategory = useMemo(
    () =>
      isDesktop
        ? groups.find((group) => group.items.some((item) => item.status === 'missing'))?.categorie
        : undefined,
    [groups, isDesktop],
  );

  // The civil-status gate was removed with the card that fed it: it was the only
  // place to enter the NIR and birth date, so keeping the check would have left
  // the dossier permanently unsubmittable. `submit_application` (backend) never
  // enforced either field, so submission works without them — but the agent now
  // receives a dossier carrying no NIR, which is what identifies an allocataire
  // on the CAF side.
  const requiredComplete =
    !!dossier && dossier.requiredReceivedCount >= dossier.requiredDocumentCount;

  // Les trois outils sont indépendants : ni la complétude ni la cohérence ne
  // conditionnent l'envoi. `submit_application` (backend) n'a jamais rien exigé
  // d'autre que l'application elle-même, et bloquer la transmission sur une
  // analyse qui n'a pas tourné revenait à retenir un dossier que
  // l'administration accepte — c'est à l'agent d'instruire, pas au navigateur
  // de refuser. Les écarts restent affichés, mais comme un avertissement.
  const coherenceClear = coherenceResult?.statutGlobal === 'coherent';
  const canSubmit = !review?.submitted;

  // Informatif, plus bloquant : ce que le citoyen doit savoir avant d'envoyer,
  // par ordre de gravité, sans jamais lui interdire de le faire.
  const blockingReason =
    coherenceResult && !coherenceClear
      ? `L’analyse a relevé ${coherenceResult.incoherences.length} écart${coherenceResult.incoherences.length > 1 ? 's' : ''} entre vos déclarations et vos pièces. Vous pouvez transmettre malgré tout, mais l’agent les verra.`
      : !requiredComplete
        ? 'Certaines pièces obligatoires manquent encore. Vous pouvez transmettre le dossier, mais l’agent verra son taux de complétude.'
        : !completenessChecked || !coherenceResult
          ? 'Les vérifications ci-dessus sont facultatives — elles vous évitent un aller-retour avec l’agent, mais rien ne vous oblige à les lancer avant d’envoyer.'
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
    // No dictatable fields left on this page: the birth-date and NIR entries
    // pointed at the removed civil-status card.
    fields: [],
    actionCallbacks: {
      submit_dossier: () => submitButtonRef.current?.click(),
    },
  });

  return (
    <div className="dossier-scope mx-auto max-w-container">
      <PageHeader
        title="Déposer un dossier"
        description="Vos pièces justificatives adaptées à votre situation, jusqu’à la transmission à l’administration."
        actions={
          // Hors parcours : l'estimation ne dépend d'aucune pièce déposée, elle
          // reste donc joignable en un clic à n'importe quel moment du dépôt.
          <Button
            className={citizenButton({ variant: 'marianne' })}
            onClick={() => setEstimationOpen(true)}
          >
            <Calculator aria-hidden="true" />
            Estimer mon aide
          </Button>
        }
      />

      <EstimationDialog open={estimationOpen} onOpenChange={setEstimationOpen} />

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
        // Une seule colonne, dans l'ordre du parcours réel : déposer, puis
        // vérifier, puis transmettre. La checklist et le dépôt ne sont plus deux
        // blocs à confronter du regard, ils sont le même bloc.
        <div className="space-y-10">
          <section ref={documentsSectionRef} aria-labelledby="section-documents">
            <DocumentsSection
              uploads={uploads}
              disabled={Boolean(review?.submitted)}
              onFilesAdded={handleFilesAdded}
              onRetry={handleRetry}
              onRemove={handleRemoveUpload}
              progress={checklistProgress}
              groups={groups}
              openByDefault={firstIncompleteCategory}
              removingItemKeys={removingItemKeys}
              onUncheck={handleUncheckItem}
              hasItems={dossier.items.length > 0}
              profileComplete={dossier.profileComplete}
              checklistError={checklistError}
              documentsByType={documentsByType}
              onViewDocument={setOpenDocument}
            />
          </section>

          <section className="space-y-gutter" aria-labelledby="section-verifier">
            <div>
              <h2
                id="section-verifier"
                className="text-headline-lg-mobile text-primary md:text-headline-lg"
              >
                Vérifier et transmettre
              </h2>
              <p className="mt-1 text-body-sm text-on-surface-variant">
                Trois outils indépendants, à lancer dans l’ordre que vous voulez. Les deux
                premiers vous évitent un aller-retour avec l’agent ; aucun n’est obligatoire
                pour transmettre.
              </p>
            </div>

            <Card>
              <CardContent className="pt-6">
                <ol className="space-y-0">
                  <StepperStep
                    index={1}
                    isLast={false}
                    title="Complétude"
                    state={`${checklistProgress.receivedCount}/${checklistProgress.totalCount} reçues`}
                    tone={dossier.status === 'complete' ? 'success' : 'info'}
                  >
                    <CompletudeStep
                      applicationId={dossier.applicationId}
                      items={dossier.items}
                      onRefreshed={refreshDossier}
                      onChecked={() => setCompletenessChecked(true)}
                    />
                  </StepperStep>

                  <StepperStep
                    index={2}
                    isLast={false}
                    title="Incohérences"
                    state={
                      documents.length === 0
                        ? 'Aucune pièce à analyser'
                        : `${documents.length} pièce${documents.length > 1 ? 's' : ''} déposée${documents.length > 1 ? 's' : ''}`
                    }
                  >
                    <CoherenceStep
                      profileSnapshot={profileSnapshot}
                      documents={documents}
                      onRevoirDocuments={scrollToDocuments}
                      onResult={setCoherenceResult}
                    />
                  </StepperStep>

                  <StepperStep
                    index={3}
                    isLast
                    title="Envoyer à la CAF"
                    state={
                      review?.submitted
                        ? 'Transmis'
                        : requiredComplete
                          ? 'Prêt à envoyer'
                          : 'Pièces manquantes'
                    }
                    tone={review?.submitted || requiredComplete ? 'success' : 'warning'}
                  >
                    <SubmissionStep
                      submitRef={submitButtonRef}
                      applicationId={dossier.applicationId}
                      review={review}
                      canSubmit={canSubmit}
                      blockingReason={blockingReason}
                      profileSnapshot={profileSnapshot}
                      onSubmitted={() => {
                        refreshDossier();
                        refreshReview();
                      }}
                    />
                  </StepperStep>
                </ol>
              </CardContent>
            </Card>
          </section>
        </div>
      )}

      {/* Same dossier the documents were listed with — the server resolves the
          file through it, so a mismatch is refused rather than served. */}
      <DocumentViewer
        document={openDocument}
        applicationId={dossier?.applicationId}
        onClose={() => setOpenDocument(null)}
      />
    </div>
  );
}
