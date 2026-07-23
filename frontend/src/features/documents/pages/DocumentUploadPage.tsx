import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  FileText,
  ScanLine,
  ShieldAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { AiSuggestionCard, Dropzone, EmptyState, PageHeader, SectionHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/app/router/paths';
import { documentService } from '@/services/documentService';
import type { CitizenDocument, PersonalizedChecklist } from '@/types';

/**
 * Document upload with live analysis, from the `MonParcours-Completude` work.
 *
 * Wired to the FastAPI citizen module: each upload is stored, its text
 * extracted, classified against the dossier checklist, and the checklist
 * refreshed. The page holds only view state — the pipeline is all server-side.
 */

// The dossier this page operates on. A fixed demo id until applications are
// created from a real citizen account (see the citizen backend module).
const TEST_APPLICATION_ID = 'TEST-DOSSIER-0001';

const STATUS_STYLES = {
  uploading: { icon: FileText, className: 'bg-primary-fixed text-primary' },
  analysing: { icon: FileText, className: 'bg-primary-fixed text-primary' },
  validated: { icon: CheckCircle2, className: 'bg-success-surface text-success' },
  rejected: { icon: AlertTriangle, className: 'bg-destructive-surface text-destructive' },
} as const;

function QueueItem({ document }: { document: CitizenDocument }) {
  const { icon: Icon, className } = STATUS_STYLES[document.status];
  const classification = document.classification;
  const classificationLabel =
    classification?.decision === 'match'
      ? `Correspond à : ${classification.matched_checklist_document_id}`
      : classification?.decision === 'example_or_template'
        ? 'Document fictif ou modèle détecté'
        : 'Document non attendu ou insuffisant';

  // Authenticity (C4) badge. `FAIBLE` (nothing flagged) shows nothing — a badge
  // on every clean document would be noise; the indicator only appears when the
  // forensic layer found something to look at.
  const risk = document.fraudRisk;
  const showRisk = Boolean(risk) && risk !== 'FAIBLE' && risk !== 'INCONNU';
  const riskTone = risk === 'CRITIQUE' || risk === 'ÉLEVÉ' ? 'error' : 'warning';

  return (
    <li className="flex items-center gap-4 rounded-lg border border-border bg-surface-lowest p-4">
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', className)}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-label-md text-on-surface">{document.fileName}</p>
        {document.status === 'uploading' && (
          <p className="text-body-sm text-on-surface-variant">Envoi sécurisé en cours…</p>
        )}
        {document.status === 'validated' && (
          <>
            <p className="text-body-sm text-success">Document envoyé et extrait avec succès</p>
            {classification ? (
              <p className="text-body-sm text-on-surface-variant">
                {classificationLabel} — confiance {Math.round(classification.confidence * 100)} %
              </p>
            ) : (
              <p className="text-body-sm text-on-surface-variant">
                Classification indisponible : {document.classificationError}
              </p>
            )}
            {showRisk && (
              <span className="mt-1 inline-flex">
                <Badge tone={riskTone}>
                  <ShieldAlert aria-hidden="true" />
                  Authenticité à vérifier — {risk}
                </Badge>
              </span>
            )}
          </>
        )}
        {document.status === 'rejected' && (
          <p className="text-body-sm text-destructive">{document.errorMessage}</p>
        )}
      </div>
      {document.status === 'validated' && (
        <Button variant="ghost" size="icon" aria-label={`Prévisualiser ${document.fileName}`}>
          <Eye aria-hidden="true" />
        </Button>
      )}
    </li>
  );
}

export default function DocumentUploadPage() {
  useDocumentTitle('Dépôt de documents');
  const [queue, setQueue] = useState<CitizenDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [checklist, setChecklist] = useState<PersonalizedChecklist | null>(null);

  const refreshChecklist = () =>
    documentService.getChecklist(TEST_APPLICATION_ID).then(setChecklist).catch(() => undefined);

  useEffect(() => {
    documentService.listDocuments().then(setQueue).catch(() => undefined);
    refreshChecklist();
  }, []);

  const uploadFiles = async (files: File[]) => {
    setIsUploading(true);
    for (const file of files) {
      const temp: CitizenDocument = {
        id: crypto.randomUUID(),
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        uploadedAt: new Date().toISOString(),
        status: 'uploading',
      };
      setQueue((current) => [...current, temp]);

      try {
        const uploaded = await documentService.upload(file);
        setQueue((current) => current.map((item) => (item.id === temp.id ? uploaded : item)));
        refreshChecklist();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'L’envoi du document a échoué.';
        setQueue((current) =>
          current.map((item) =>
            item.id === temp.id ? { ...item, status: 'rejected', errorMessage } : item,
          ),
        );
      }
    }
    setIsUploading(false);
  };

  const requiredDocuments = checklist?.documents ?? [];
  const requiredCount =
    checklist?.requiredDocumentCount ?? requiredDocuments.filter((item) => item.obligatoire).length;
  const receivedCount =
    checklist?.requiredReceivedCount ??
    requiredDocuments.filter((item) => item.obligatoire && item.received).length;
  const receivedTotal = requiredDocuments.filter((item) => item.received).length;
  const latestExtraction = [...queue]
    .reverse()
    .find((item) => item.status === 'validated' && item.extractedTextPreview);

  return (
    <div className="mx-auto max-w-container">
      <PageHeader
        title="Analyse des pièces justificatives"
        description="Vos documents sont analysés automatiquement pour accélérer votre traitement."
        eyebrow={
          <Button asChild variant="link" size="sm" className="px-0">
            <Link to={ROUTES.apl}>
              <ArrowLeft aria-hidden="true" />
              Retour au dossier
            </Link>
          </Button>
        }
      />

      <div className="grid gap-gutter lg:grid-cols-3">
        <div className="flex flex-col gap-gutter lg:col-span-2">
          <Card>
            <CardHeader>
              <SectionHeader
                title="Zone de dépôt"
                as="h2"
                action={<Badge tone="info">PDF, JPG, PNG — 10 Mo max</Badge>}
              />
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <Dropzone onFilesSelected={uploadFiles} disabled={isUploading} />
              {queue.length > 0 && (
                <ul className="flex flex-col gap-3">
                  {queue.map((document) => (
                    <QueueItem key={document.id} document={document} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <SectionHeader title="Extraction des données" as="h2" />
            </CardHeader>
            <CardContent>
              {latestExtraction ? (
                <>
                  <p className="mb-3 text-body-sm text-on-surface-variant">
                    Méthode :{' '}
                    {latestExtraction.extractionMethod === 'native_pdf'
                      ? 'PDF texte (sans IA)'
                      : 'OCR Mistral'}
                  </p>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-low p-4 text-body-sm text-on-surface">
                    {latestExtraction.extractedTextPreview}
                  </pre>
                </>
              ) : (
                <EmptyState
                  icon={ScanLine}
                  title="Aucune donnée extraite"
                  description="Le contenu extrait s’affichera ici après analyse."
                />
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="flex flex-col gap-gutter">
          <AiSuggestionCard title="Assistant" showFeedback={false}>
            Aucune suggestion pour le moment. L’assistant commentera vos pièces une fois analysées.
          </AiSuggestionCard>

          <Card>
            <CardHeader>
              <SectionHeader title="Checklist personnalisée" as="h2" />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p
                className={cn(
                  'rounded-lg px-3 py-2 text-label-md',
                  checklist?.status === 'complete'
                    ? 'bg-success-surface text-success'
                    : 'bg-primary-fixed text-primary',
                )}
              >
                Dossier {checklist?.status === 'complete' ? 'Complet' : 'Incomplet'}
              </p>
              <div className="flex items-baseline justify-between">
                <span className="text-body-sm text-on-surface-variant">Pièces reçues</span>
                <span className="text-label-md text-on-surface">
                  {receivedTotal}/{requiredDocuments.length}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-body-sm text-on-surface-variant">
                  Pièces obligatoires reçues
                </span>
                <span className="text-label-md text-on-surface">
                  {receivedCount}/{requiredCount}
                </span>
              </div>
              <Progress
                value={requiredCount ? (receivedCount / requiredCount) * 100 : 0}
                aria-label={`${receivedCount} pièces obligatoires reçues sur ${requiredCount}`}
              />
              {requiredDocuments.length > 0 ? (
                <ul className="flex flex-col gap-3">
                  {requiredDocuments.map((item) => (
                    <li
                      key={item.id}
                      className={cn(
                        'flex gap-2 text-body-sm',
                        item.received ? 'text-success' : 'text-on-surface-variant',
                      )}
                    >
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>
                        <span className="block text-on-surface">
                          {item.libelle}
                          {!item.obligatoire && ' (facultatif)'}
                        </span>
                        <span>{item.justification}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body-sm text-on-surface-variant">
                  Chargement de votre checklist personnalisée…
                </p>
              )}
              <Button variant="outline" block>
                Sauvegarder et continuer plus tard
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
