import { BookOpen, FileText, Send, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { EmptyState, PageHeader, SectionHeader, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { documentService } from '@/services/documentService';
import type { CitizenDocument, DocumentAnalysisStatus, ProcessStatus } from '@/types';

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
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = () =>
    documentService.listDocuments().then(setDocuments).catch(() => undefined);

  useEffect(() => {
    refresh();
  }, []);

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
      <PageHeader
        title="Mes documents"
        description="Retrouvez vos pièces justificatives et la documentation officielle."
        actions={
          <Button asChild>
            <Link to={ROUTES.documentsUpload}>
              <Upload aria-hidden="true" />
              Déposer un document
            </Link>
          </Button>
        }
      />

      <Tabs defaultValue="files">
        <TabsList>
          <TabsTrigger value="files">Mes pièces</TabsTrigger>
          <TabsTrigger value="docs">Documentation</TabsTrigger>
        </TabsList>

        {/* Uploaded documents */}
        <TabsContent value="files">
          <Card>
            <CardHeader>
              <SectionHeader title="Pièces déposées" as="h2" />
            </CardHeader>
            <CardContent className="px-0">
              {documents.length > 0 ? (
                <Table>
                  <caption className="sr-only">
                    Liste de vos pièces justificatives avec leur statut d’analyse
                  </caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() =>
                              window.open(
                                documentService.previewUrl(doc.id),
                                '_blank',
                                'noopener,noreferrer',
                              )
                            }
                            className="flex items-center gap-3 text-left text-primary hover:underline"
                          >
                            <FileText className="size-5 shrink-0" aria-hidden="true" />
                            {doc.fileName}
                          </button>
                        </TableCell>
                        <TableCell className="text-on-surface-variant">{doc.mimeType}</TableCell>
                        <TableCell className="text-on-surface-variant">
                          {formatDate(doc.uploadedAt)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={ANALYSIS_STATUS_TO_PROCESS[doc.status]} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Supprimer ${doc.fileName}`}
                            disabled={deletingId === doc.id}
                            onClick={() => handleDelete(doc.id)}
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  icon={FileText}
                  title="Aucune pièce déposée"
                  description="Déposez vos justificatifs pour les retrouver ici et suivre leur analyse."
                  actions={
                    <Button asChild>
                      <Link to={ROUTES.documentsUpload}>
                        <Upload aria-hidden="true" />
                        Déposer un document
                      </Link>
                    </Button>
                  }
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documentation centre */}
        <TabsContent value="docs">
          <div className="flex flex-col gap-gutter">
            <div className="rounded-xl bg-primary-container p-8 text-white">
              <h2 className="mb-2 text-headline-lg">Centre de documentation</h2>
              <p className="max-w-2xl text-body-md text-white/80">
                Retrouvez ici les guides et réponses officielles publiés par les administrations
                rattachées à votre compte.
              </p>
            </div>

            <Card>
              <CardHeader>
                <SectionHeader title="Guides" as="h2" />
              </CardHeader>
              <CardContent className="px-0">
                <EmptyState
                  icon={BookOpen}
                  title="Aucun guide disponible"
                  description="Les guides publiés par les administrations s’afficheront ici."
                />
              </CardContent>
            </Card>

            {/* Inline assistant */}
            <Card className="border-l-4 border-l-ai bg-ai-surface">
              <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center">
                <div className="flex-1">
                  <p className="mb-1 flex items-center gap-2 text-label-sm uppercase tracking-widest text-ai">
                    <BookOpen className="size-4" aria-hidden="true" />
                    Assistance
                  </p>
                  <h2 className="text-headline-md text-on-surface">Besoin d’une réponse rapide ?</h2>
                  <p className="text-body-sm text-on-surface-variant">
                    Posez votre question à l’assistant.
                  </p>
                </div>
                <form
                  className="flex w-full gap-2 md:w-auto"
                  onSubmit={(event) => event.preventDefault()}
                >
                  <label htmlFor="doc-question" className="sr-only">
                    Votre question
                  </label>
                  <Input id="doc-question" placeholder="Posez votre question…" className="md:w-64" />
                  <Button type="submit">
                    <Send aria-hidden="true" />
                    <span className="sr-only sm:not-sr-only">Poser</span>
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* FAQ */}
            <Card>
              <CardHeader>
                <SectionHeader title="Questions fréquentes" as="h2" />
              </CardHeader>
              <CardContent className="px-0">
                <EmptyState
                  icon={BookOpen}
                  title="Aucune question publiée"
                  description="La foire aux questions sera alimentée par les administrations rattachées."
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
