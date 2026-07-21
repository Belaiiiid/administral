import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, FileText, ScanLine } from 'lucide-react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import {
  AiSuggestionCard,
  Dropzone,
  EmptyState,
  PageHeader,
  SectionHeader,
} from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/utils';
import type { CitizenDocument, ExtractedField, RequiredDocument } from '@/types';

/** All three lists are populated by `documentService`; nothing is faked here. */
const QUEUE: CitizenDocument[] = [];
const EXTRACTED: ExtractedField[] = [];
const REQUIRED: RequiredDocument[] = [];

const STATUS_STYLES = {
  uploading: { icon: FileText, className: 'bg-primary-fixed text-primary' },
  analysing: { icon: FileText, className: 'bg-primary-fixed text-primary' },
  validated: { icon: CheckCircle2, className: 'bg-success-surface text-success' },
  rejected: { icon: AlertTriangle, className: 'bg-destructive-surface text-destructive' },
} as const;

function QueueItem({ document }: { document: CitizenDocument }) {
  const { icon: Icon, className } = STATUS_STYLES[document.status];

  return (
    <li className="flex items-center gap-4 rounded-lg border border-border bg-surface-lowest p-4">
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', className)}>
        <Icon className="size-5" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-label-md text-on-surface">{document.fileName}</p>

        {document.status === 'analysing' && (
          <div className="mt-2 flex items-center gap-3">
            <Progress
              value={document.progress ?? 0}
              className="flex-1"
              aria-label={`Analyse en cours : ${document.progress} %`}
            />
            <span className="shrink-0 text-body-sm text-on-surface-variant">
              {document.progress} %
            </span>
          </div>
        )}

        {document.status === 'validated' && (
          <p className="text-body-sm text-success">Document validé — données extraites</p>
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
      {document.status === 'rejected' && (
        <Button variant="destructive" size="sm">
          Réessayer
        </Button>
      )}
    </li>
  );
}

/** Upload + analysis skeleton. No file is actually transmitted. */
export default function DocumentUploadPage() {
  useDocumentTitle('Dépôt de documents');

  const receivedCount = REQUIRED.filter((item) => item.received).length;
  const completion = REQUIRED.length > 0 ? (receivedCount / REQUIRED.length) * 100 : 0;

  return (
    <div className="mx-auto max-w-container">
      <PageHeader
        title="Analyse des pièces justificatives"
        description="Vos documents sont analysés en temps réel pour accélérer votre traitement."
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
                action={<Badge tone="info">Formats PDF, JPG, PNG</Badge>}
              />
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <Dropzone />

              {QUEUE.length > 0 && (
                <ul className="flex flex-col gap-3">
                  {QUEUE.map((document) => (
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
            <CardContent className={EXTRACTED.length > 0 ? undefined : 'px-0'}>
              {EXTRACTED.length > 0 ? (
                <dl className="grid gap-4 sm:grid-cols-2">
                  {EXTRACTED.map((field) => (
                    <div key={field.id} className="rounded-lg bg-surface-low p-4">
                      <dt className="mb-1 text-label-sm uppercase tracking-wider text-on-surface-variant">
                        {field.label}
                      </dt>
                      <dd className="text-headline-md text-on-surface">{field.value}</dd>
                      <p className="mt-1 flex items-center gap-1 text-body-sm text-success">
                        <CheckCircle2 className="size-4" aria-hidden="true" />
                        Confiance {Math.round(field.confidence * 100)} %
                      </p>
                    </div>
                  ))}
                </dl>
              ) : (
                <EmptyState
                  icon={ScanLine}
                  title="Aucune donnée extraite"
                  description="Les informations lues dans vos documents s’afficheront ici après analyse."
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
              <SectionHeader title="État du dossier" as="h2" />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between">
                <span className="text-body-sm text-on-surface-variant">Pièces reçues</span>
                <span className="text-label-md text-on-surface">
                  {receivedCount}/{REQUIRED.length}
                </span>
              </div>
              <Progress
                value={completion}
                aria-label={`${receivedCount} pièces reçues sur ${REQUIRED.length}`}
              />

              {REQUIRED.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {REQUIRED.map((item) => (
                    <li
                      key={item.id}
                      className={cn(
                        'flex items-center gap-2 text-body-sm',
                        item.received ? 'text-success' : 'text-on-surface-variant',
                      )}
                    >
                      <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                      {item.label}
                      <span className="sr-only">{item.received ? ' — reçue' : ' — manquante'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body-sm text-on-surface-variant">
                  La liste des pièces attendues dépend de votre demande.
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
