import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  FileUser,
  Info,
  Loader2,
  MessageSquareText,
  Sparkles,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { CitizenCard } from '@/components/citizen/CitizenCard';
import { CitizenEmptyState } from '@/components/citizen/CitizenEmptyState';
import { Dropzone } from '@/components/shared';
import { Button } from '@/components/ui/button';
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
 *
 * Passée au design Administral. La maquette design-to-code affichait en plus
 * un score sur 100, des barres de critères et une réécriture avant/après :
 * le backend ne produit rien de tout ça, et inventer ces chiffres pour
 * respecter la maquette aurait menti à l'utilisateur. Seul le langage visuel
 * a été repris.
 */

const STARTER_QUESTIONS = [
  'Je suis agent d’entretien depuis 10 ans, aidez-moi à le présenter',
  'Comment valoriser une expérience sans diplôme ?',
  'Quelles réalisations mettre en avant pour un poste de vendeur ?',
];

function AdviceBlock({
  title,
  items,
  emptyLabel,
  tone,
  icon: Icon,
}: {
  title: string;
  items: string[];
  emptyLabel: string;
  tone: 'success' | 'warning' | 'brand';
  icon: typeof CheckCircle2;
}) {
  const tones = {
    success: { label: 'text-success', dot: 'bg-success' },
    warning: { label: 'text-warning', dot: 'bg-warning' },
    brand: { label: 'text-brand', dot: 'bg-brand' },
  } as const;

  return (
    <CitizenCard className="p-6">
      <p
        className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wide ${tones[tone].label}`}
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {title}
      </p>

      {items.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li
              key={item}
              className="flex items-start gap-3 text-xs leading-relaxed text-muted-foreground"
            >
              <span
                aria-hidden="true"
                className={`mt-1.5 size-1.5 shrink-0 rounded-full ${tones[tone].dot}`}
              />
              {item}
            </li>
          ))}
        </ul>
      )}
    </CitizenCard>
  );
}

function ReviewPanel({ result }: { result: CvReviewResult }) {
  if (!result.available) {
    return (
      <CitizenEmptyState
        icon={Info}
        title="Analyse indisponible"
        description={result.unavailableReason ?? 'Réessayez dans un instant.'}
        tone="error"
      />
    );
  }

  return (
    <div className="space-y-gutter">
      <AdviceBlock
        title="Points forts"
        items={result.pointsForts}
        emptyLabel="Aucun point fort identifié."
        tone="success"
        icon={CheckCircle2}
      />
      <AdviceBlock
        title="Points à améliorer"
        items={result.pointsAAmeliorer}
        emptyLabel="Rien à signaler."
        tone="warning"
        icon={AlertTriangle}
      />
      <AdviceBlock
        title="Conseils"
        items={result.conseils}
        emptyLabel="Aucun conseil supplémentaire."
        tone="brand"
        icon={Sparkles}
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
    <FranceTravailShell
      eyebrow="Coach CV"
      title="Votre CV relu et commenté par l’assistant."
      description="Décrivez votre expérience à l’assistant, ou envoyez directement votre CV pour un retour — ce qui est déjà bien, ce qui manque, et des conseils concrets."
      aside={
        <div className="relative overflow-hidden rounded-2xl border border-brand/20 bg-card/75 p-8 text-center shadow-lg backdrop-blur">
          <div className="pointer-events-none absolute -right-12 -top-12 size-36 rounded-full bg-brand/5 blur-3xl" />
          <div className="relative">
            <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand text-white shadow-md ring-8 ring-brand/10">
              <FileUser className="size-8" aria-hidden="true" />
            </span>
            <p className="mt-6 font-display text-2xl font-extrabold leading-snug text-ink">
              {review?.available ? 'Analyse terminée' : 'Deux façons de commencer'}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {review?.available
                ? 'Vos points forts et les conseils sont détaillés ci-dessous.'
                : 'Racontez votre parcours à l’assistant, ou déposez un CV déjà rédigé.'}
            </p>
          </div>
        </div>
      }
    >
      <div className="grid gap-gutter lg:grid-cols-3">
        <CitizenCard className="flex flex-col lg:col-span-2">
          <div className="flex flex-1 flex-col p-6">
            <ChatWindow controller={controller} starterQuestions={STARTER_QUESTIONS} />
          </div>
        </CitizenCard>

        <aside className="flex flex-col gap-gutter">
          <CitizenCard className="p-6">
            <p className="eyebrow">Ou envoyez votre CV</p>
            <h2 className="mt-3 font-display text-xl font-extrabold leading-tight text-ink">
              Un retour immédiat
            </h2>

            <p className="mt-4 flex items-start gap-3 rounded-xl border border-brand/15 bg-brand-soft/50 p-4 text-xs leading-relaxed text-muted-foreground">
              <MessageSquareText className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
              Indépendant de la conversation à gauche — sur un CV déjà rédigé. L’assistant le
              commente, il ne le réécrit pas à votre place.
            </p>

            <div className="mt-5">
              {cvFile ? (
                <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface p-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    {isReviewing ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <FileText className="size-4" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-label-md text-ink">{cvFile.name}</p>
                    <p className="text-body-sm text-muted-foreground">
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
            </div>

            {error && (
              <p role="alert" className="mt-4 text-body-sm text-destructive">
                {error}
              </p>
            )}
          </CitizenCard>

          {review && <ReviewPanel result={review} />}
        </aside>
      </div>
    </FranceTravailShell>
  );
}
