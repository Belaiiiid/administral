import { FileText, Info, Loader2, MessageSquareText, X } from 'lucide-react';
import { useState } from 'react';

import { Dropzone, EmptyState, PageHeader, SectionHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ChatWindow } from '@/features/chatbot/components/ChatWindow';
import { FranceTravailShell } from '@/features/france-travail/components/FranceTravailShell';
import { useCvCoachChat } from '@/features/france-travail/hooks/useCvCoachChat';
import { cvCoachService } from '@/services/cvCoachService';
import type { CvReviewResult } from '@/types';

/**
 * "Coach CV" — France Travail's second accompagnement tool, alongside
 * "Analyser une offre" (`JobMatchPage`). Two independent ways to get the
 * same kind of structured feedback (strengths / gaps / advice, never a
 * rewritten CV): describe your experience in a real conversation (left,
 * `ChatWindow` + `useCvCoachChat` — same chat surface the APL assistant
 * uses, pointed at a different backend), or send an existing CV directly
 * (right) for a one-shot review.
 */

const STARTER_QUESTIONS = [
  'Je suis agent d’entretien depuis 10 ans, aidez-moi à le présenter',
  'Comment valoriser une expérience sans diplôme ?',
  'Quelles réalisations mettre en avant pour un poste de vendeur ?',
];

function AdviceList({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: string[];
  emptyLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <SectionHeader title={title} as="h3" />
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">{emptyLabel}</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item} className="flex items-start gap-2 text-body-sm text-on-surface">
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#6B367D]"
                />
                {item}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewPanel({ result }: { result: CvReviewResult }) {
  if (!result.available) {
    return (
      <EmptyState
        icon={Info}
        title="Analyse indisponible"
        description={result.unavailableReason ?? 'Réessayez dans un instant.'}
      />
    );
  }

  return (
    <div className="space-y-gutter">
      <AdviceList
        title="Points forts"
        items={result.pointsForts}
        emptyLabel="Aucun point fort identifié."
      />
      <AdviceList
        title="Points à améliorer"
        items={result.pointsAAmeliorer}
        emptyLabel="Rien à signaler."
      />
      <AdviceList
        title="Conseils"
        items={result.conseils}
        emptyLabel="Aucun conseil supplémentaire."
      />
    </div>
  );
}

export default function CvCoachPage() {
  useDocumentTitle('Coach CV — France Travail');
  const controller = useCvCoachChat();

  const [cvFile, setCvFile] = useState<File | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [review, setReview] = useState<CvReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reviewCv = async (file: File) => {
    setCvFile(file);
    setIsReviewing(true);
    setError(null);
    setReview(null);
    try {
      const result = await cvCoachService.review(file);
      setReview(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "L'analyse a échoué.");
    } finally {
      setIsReviewing(false);
    }
  };

  const clearCv = () => {
    setCvFile(null);
    setReview(null);
    setError(null);
  };

  return (
    <FranceTravailShell>
      <PageHeader
        title="Coach CV"
        description="Décrivez votre expérience à l'assistant, ou envoyez directement votre CV pour un retour — ce qui est déjà bien, ce qui manque, et des conseils concrets."
      />

      <div className="grid gap-gutter lg:grid-cols-3">
        <Card className="flex flex-col lg:col-span-2">
          <CardContent className="flex flex-1 flex-col p-6">
            <ChatWindow controller={controller} starterQuestions={STARTER_QUESTIONS} />
          </CardContent>
        </Card>

        <aside className="flex flex-col gap-gutter">
          <Card>
            <CardHeader>
              <SectionHeader title="Ou envoyez votre CV" as="h3" />
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="flex items-start gap-2 text-body-sm text-on-surface-variant">
                <MessageSquareText className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Indépendant de la conversation à gauche — un retour immédiat sur un CV déjà rédigé.
              </p>

              {cvFile ? (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-lowest p-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary">
                    {isReviewing ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <FileText className="size-4" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-label-md text-on-surface">{cvFile.name}</p>
                    <p className="text-body-sm text-on-surface-variant">
                      {isReviewing ? 'Analyse en cours…' : `${(cvFile.size / 1024).toFixed(0)} Ko`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Retirer le CV"
                    disabled={isReviewing}
                    onClick={clearCv}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </div>
              ) : (
                <Dropzone
                  title="Glissez votre CV ici"
                  hint="Ou cliquez pour parcourir votre ordinateur — PDF, JPG, PNG"
                  compact
                  onFilesSelected={(files) => {
                    if (files[0]) void reviewCv(files[0]);
                  }}
                />
              )}

              {error && (
                <p role="alert" className="text-body-sm text-destructive">
                  {error}
                </p>
              )}
            </CardContent>
          </Card>

          {review && <ReviewPanel result={review} />}
        </aside>
      </div>
    </FranceTravailShell>
  );
}
