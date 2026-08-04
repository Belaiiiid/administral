import { BookOpen, FileText, Send, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { citizenButton } from '@/components/citizen/citizenButton';
import { CitizenCard, CitizenCardBody, CitizenCardHeader } from '@/components/citizen/CitizenCard';
import { CitizenEmptyState } from '@/components/citizen/CitizenEmptyState';
import { CitizenPageHeader } from '@/components/citizen/CitizenPageHeader';
import { CitizenStatusBadge } from '@/components/citizen/CitizenStatusBadge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useChatbotUiStore } from '@/features/chatbot/store/chatbotUiStore';
import { documentService } from '@/services/documentService';
import type { CitizenDocument, DocumentAnalysisStatus, ProcessStatus } from '@/types';
import { useVoicePage } from '@/features/voice/context/VoicePageContext';

/** The analysis pipeline has more states than the badge vocabulary exposes. */
const ANALYSIS_STATUS_TO_PROCESS: Record<DocumentAnalysisStatus, ProcessStatus> = {
  uploading: 'in_progress',
  analysing: 'in_progress',
  validated: 'validated',
  rejected: 'rejected',
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('fr-FR');
}

/** Documents list + documentation centre. */
export default function DocumentsPage() {
  useDocumentTitle('Documents');

  // Wired to the FastAPI citizen module: the list is the real persisted state,
  // refetched on delete so the table stays in sync with PostgreSQL.
  const [documents, setDocuments] = useState<CitizenDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [docQuestion, setDocQuestion] = useState('');
  const askAssistant = useChatbotUiStore((state) => state.ask);

  const submitDocQuestion = (event: React.FormEvent) => {
    event.preventDefault();
    const question = docQuestion.trim();
    if (!question) return;
    askAssistant(question); // opens the floating assistant and sends the question
    setDocQuestion('');
  };

  const refresh = () =>
    documentService.listDocuments().then(setDocuments).catch(() => undefined);

  useEffect(() => {
    refresh().finally(() => setIsLoading(false));
  }, []);

  // Register page content for the voice assistant
  useVoicePage({
    readableText:
      'Page Mes documents. Vous retrouvez ici toutes vos pièces justificatives déposées et leur statut d\'analyse. ' +
      `Vous avez actuellement ${documents.length} document${documents.length !== 1 ? 's' : ''}. ` +
      'Vous pouvez également déposer un nouveau document ou consulter le centre de documentation.',
    actions: [
      {
        id: 'navigate_dossier',
        label: 'deposer un document',
        description: 'Aller à la page de dépôt de dossier',
        intent: { type: 'navigate', target: 'dossier' },
        sensitive: false,
      },
    ],
  });

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await documentService.remove(id);
      setDocuments((current) => current.filter((doc) => doc.id !== id));
    } catch {
      // Refetch to resync with the server if the optimistic removal was wrong.
      await refresh();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-container">
      <CitizenPageHeader
        backTo={ROUTES.portal}
        eyebrow="Vos pièces"
        title="Mes documents"
        description="Retrouvez vos pièces justificatives et la documentation officielle."
        actions={
          <Link to={ROUTES.dossier} className={citizenButton()}>
            <Upload aria-hidden="true" />
            Déposer un document
          </Link>
        }
      />

      <Tabs defaultValue="files">
        <TabsList className="border-border/60">
          <TabsTrigger
            value="files"
            className="text-label-md text-muted-foreground data-[state=active]:border-brand data-[state=active]:text-brand"
          >
            Mes pièces
          </TabsTrigger>
          <TabsTrigger
            value="docs"
            className="text-label-md text-muted-foreground data-[state=active]:border-brand data-[state=active]:text-brand"
          >
            Documentation
          </TabsTrigger>
        </TabsList>

        {/* Uploaded documents */}
        <TabsContent value="files">
          <CitizenCard>
            <CitizenCardHeader title="Pièces déposées" icon={FileText} />
            {isLoading ? (
              <CitizenCardBody>
                <DocumentsSkeleton />
              </CitizenCardBody>
            ) : documents.length > 0 ? (
              <div className="w-full overflow-x-auto">
                <table className="w-full caption-bottom border-collapse">
                  <caption className="sr-only">
                    Liste de vos pièces justificatives avec leur statut d’analyse
                  </caption>
                  <thead className="border-b border-border/60">
                    <tr>
                      <Th>Document</Th>
                      <Th>Type</Th>
                      <Th>Date</Th>
                      <Th>Statut</Th>
                      <Th>
                        <span className="sr-only">Actions</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {documents.map((doc) => (
                      <tr key={doc.id} className="transition-colors hover:bg-surface">
                        <td className="px-4 py-4 sm:px-6">
                          <button
                            type="button"
                            onClick={() =>
                              window.open(
                                documentService.previewUrl(doc.id),
                                '_blank',
                                'noopener,noreferrer',
                              )
                            }
                            className="flex items-center gap-3 text-left text-label-md text-brand hover:underline"
                          >
                            <FileText className="size-4 shrink-0" aria-hidden="true" />
                            {doc.fileName}
                          </button>
                        </td>
                        <td className="px-4 py-4 sm:px-6 text-sm text-muted-foreground">{doc.mimeType}</td>
                        <td className="px-4 py-4 sm:px-6 text-sm text-muted-foreground">
                          {formatDate(doc.uploadedAt)}
                        </td>
                        <td className="px-4 py-4 sm:px-6">
                          <CitizenStatusBadge status={ANALYSIS_STATUS_TO_PROCESS[doc.status]} />
                        </td>
                        <td className="px-4 py-4 sm:px-6 text-right">
                          <button
                            type="button"
                            aria-label={`Supprimer ${doc.fileName}`}
                            disabled={deletingId === doc.id}
                            onClick={() => handleDelete(doc.id)}
                            className={citizenButton({ variant: 'ghost', size: 'icon' })}
                          >
                            <Trash2 aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <CitizenCardBody>
                <CitizenEmptyState
                  icon={FileText}
                  title="Aucune pièce déposée"
                  description="Déposez vos justificatifs pour les retrouver ici et suivre leur analyse."
                  actions={
                    <Link to={ROUTES.dossier} className={citizenButton()}>
                      <Upload aria-hidden="true" />
                      Déposer un document
                    </Link>
                  }
                />
              </CitizenCardBody>
            )}
          </CitizenCard>
        </TabsContent>

        {/* Documentation centre */}
        <TabsContent value="docs">
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl bg-marianne p-8 text-marianne-foreground">
              <h2 className="font-display text-headline-lg-mobile leading-tight">
                Centre de documentation
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-marianne-foreground/80">
                Posez votre question à l’assistant : il répond à partir des sources officielles
                (service-public.fr, caf.fr) et cite ses références.
              </p>
            </div>

            {/* Inline assistant — the real documentation resource. Empty "Guides"
                and "FAQ" placeholders were removed: there is no admin-content
                backend to fill them, and the RAG assistant already answers from
                the official corpus. */}
            <CitizenCard className="border-l-4 border-l-brand bg-brand-soft">
              <div className="flex flex-col gap-4 p-6 md:flex-row md:items-center">
                <div className="flex-1">
                  <p className="eyebrow flex items-center gap-2">
                    <BookOpen className="size-3.5" aria-hidden="true" />
                    Assistance
                  </p>
                  <h2 className="mt-2 font-display text-lg font-bold text-ink">
                    Besoin d’une réponse rapide ?
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Posez votre question à l’assistant.
                  </p>
                </div>
                <form className="flex w-full gap-2 md:w-auto" onSubmit={submitDocQuestion}>
                  <label htmlFor="doc-question" className="sr-only">
                    Votre question
                  </label>
                  <Input
                    id="doc-question"
                    value={docQuestion}
                    onChange={(event) => setDocQuestion(event.target.value)}
                    placeholder="Posez votre question…"
                    className="bg-card md:w-64"
                  />
                  <button
                    type="submit"
                    disabled={docQuestion.trim().length === 0}
                    className={citizenButton()}
                  >
                    <Send aria-hidden="true" />
                    <span className="sr-only sm:not-sr-only">Poser</span>
                  </button>
                </form>
              </div>
            </CitizenCard>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="px-4 py-3 text-left text-label-sm uppercase tracking-wider text-muted-foreground sm:px-6"
    >
      {children}
    </th>
  );
}

function DocumentsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="flex-1">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}
