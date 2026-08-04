import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  FileUser,
  Info,
  Loader2,
  MessagesSquare,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { CitizenEmptyState } from '@/components/citizen/CitizenEmptyState';
import { Dropzone } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ChatWindow } from '@/features/chatbot/components/ChatWindow';
import { FranceTravailShell } from '@/features/france-travail/components/FranceTravailShell';
import heroImage from '@/assets/ft-coach-cv.webp';
import {
  FtAside,
  FtCard,
  FtReveal,
  FtSectionHeading,
} from '@/features/france-travail/components/FtVisuals';
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
 * Les deux voies sont annoncées comme telles — deux cartes marquées « ou »
 * plutôt que deux blocs muets côte à côte : rien à l'écran ne disait qu'elles
 * étaient indépendantes, et un utilisateur pouvait croire devoir faire les
 * deux.
 *
 * La maquette design-to-code montrait en plus un score sur 100 et une
 * réécriture avant/après. Le backend ne produit ni l'un ni l'autre, et
 * inventer ces chiffres pour respecter la maquette aurait menti.
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
    success: { label: 'text-success', dot: 'bg-success', accent: 'success' },
    warning: { label: 'text-warning', dot: 'bg-warning', accent: 'warning' },
    brand: { label: 'text-brand', dot: 'bg-brand', accent: 'brand' },
  } as const;

  return (
    <FtCard accent={tones[tone].accent} className="p-6">
      <p
        className={`flex items-center gap-2 text-label-sm uppercase tracking-wide ${tones[tone].label}`}
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {title}
        <span className="ml-auto rounded-full bg-surface px-2 py-0.5 tabular-nums text-muted-foreground">
          {items.length}
        </span>
      </p>

      {items.length === 0 ? (
        <p className="mt-4 text-body-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li
              key={item}
              className="flex items-start gap-3 text-body-sm text-muted-foreground"
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
    </FtCard>
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
    <div className="space-y-4">
      <FtReveal>
        <AdviceBlock
          title="Points forts"
          items={result.pointsForts}
          emptyLabel="Aucun point fort identifié."
          tone="success"
          icon={CheckCircle2}
        />
      </FtReveal>
      <FtReveal index={1}>
        <AdviceBlock
          title="Points à améliorer"
          items={result.pointsAAmeliorer}
          emptyLabel="Rien à signaler."
          tone="warning"
          icon={AlertTriangle}
        />
      </FtReveal>
      <FtReveal index={2}>
        <AdviceBlock
          title="Conseils"
          items={result.conseils}
          emptyLabel="Aucun conseil supplémentaire."
          tone="brand"
          icon={Sparkles}
        />
      </FtReveal>
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
      image={heroImage}
      // Le groupe occupe la moitié basse de la photo ; ce cadrage garde les
      // visages plutôt que le plafond du plateau.
      imagePosition="center 45%"
      aside={
        <FtAside
          icon={FileUser}
          title={review?.available ? 'Analyse terminée' : 'Deux façons de commencer'}
          description={
            review?.available
              ? 'Vos points forts et les conseils sont détaillés à droite.'
              : 'Racontez votre parcours à l’assistant, ou déposez un CV déjà rédigé. Les deux sont indépendants.'
          }
        />
      }
    >
      <div className="grid gap-gutter lg:grid-cols-[1.6fr_1fr]">
        {/* Voie 1 — la conversation */}
        <div className="space-y-5">
          <FtSectionHeading
            eyebrow="Première façon"
            title="Racontez votre parcours"
            icon={MessagesSquare}
          />
          <FtCard accent="brand" className="flex min-h-[32rem] flex-col">
            <div className="flex flex-1 flex-col p-6">
              <ChatWindow controller={controller} starterQuestions={STARTER_QUESTIONS} />
            </div>
          </FtCard>
        </div>

        {/* Voie 2 — le dépôt de CV */}
        <div className="space-y-5">
          <FtSectionHeading
            eyebrow="Ou, au choix"
            title="Envoyez votre CV"
            icon={UploadCloud}
          />

          <FtCard className="p-6">
            <p className="flex items-start gap-3 rounded-lg border-l-2 border-brand bg-brand-soft p-4 text-body-sm text-muted-foreground">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
              Indépendant de la conversation — sur un CV déjà rédigé. L’assistant le commente, il
              ne le réécrit pas à votre place.
            </p>

            <div className="mt-5">
              {cvFile ? (
                <div className="flex items-center gap-3 rounded-lg border border-brand bg-brand-soft p-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand text-marianne-foreground">
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
          </FtCard>

          {review && <ReviewPanel result={review} />}
        </div>
      </div>
    </FranceTravailShell>
  );
}
