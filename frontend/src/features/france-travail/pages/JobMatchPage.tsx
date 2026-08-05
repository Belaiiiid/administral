import {
  Check,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  FileText,
  Info,
  Loader2,
  Target,
  X,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';

import { CitizenCard } from '@/components/citizen/CitizenCard';
import { CitizenEmptyState } from '@/components/citizen/CitizenEmptyState';
import { CitizenPageHeader } from '@/components/citizen/CitizenPageHeader';
import { citizenButton } from '@/components/citizen/citizenButton';
import { Dropzone } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  FtCard,
  FtReveal,
  FtScore,
  FtSectionHeading,
} from '@/features/france-travail/components/FtVisuals';
import { jobMatchService } from '@/services/jobMatchService';
import type { JobMatchAnalysis } from '@/types';

/**
 * "Analyser une offre" — France Travail's accompagnement tool: paste a job
 * offer, provide a CV, and get back required/matched/missing skills, the
 * documents worth preparing for *this* application, and a prudent match
 * score. Stateless by design — nothing is saved, a new offer just replaces
 * the previous result on screen.
 *
 * Reprend le gabarit des pages citoyen (« Déposer un dossier », « Suivre un
 * dossier ») : une colonne, en-tête sur fond clair, progression, puis l'action.
 * Le bandeau photo et l'encart latéral « Ce dont vous avez besoin » ont disparu
 * — ce dernier ne faisait que redire, en liste, ce que la barre de progression
 * et les pastilles numérotées portent déjà.
 */

function SkillChips({
  title,
  skills,
  icon: Icon,
  tone,
}: {
  title: string;
  skills: string[];
  icon: typeof CheckCircle2;
  tone: 'success' | 'warning';
}) {
  return (
    <FtCard accent={tone} className="h-full p-6">
      <p
        className={`flex items-center gap-2 text-label-sm uppercase tracking-wide ${
          tone === 'success' ? 'text-success' : 'text-warning'
        }`}
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {title}
        <span className="ml-auto rounded-full bg-surface px-2 py-0.5 tabular-nums text-muted-foreground">
          {skills.length}
        </span>
      </p>

      {skills.length === 0 ? (
        <p className="mt-4 text-body-sm text-muted-foreground">Aucune.</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {skills.map((skill) => (
            <span
              key={skill}
              className={`rounded-full px-3 py-1.5 text-label-sm ${
                tone === 'success'
                  ? 'bg-success-surface text-success'
                  : 'bg-warning-surface text-warning-foreground'
              }`}
            >
              {skill}
            </span>
          ))}
        </div>
      )}
    </FtCard>
  );
}

function ResultPanel({ result }: { result: JobMatchAnalysis }) {
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
      <FtSectionHeading
        eyebrow="Résultat de l'analyse"
        title="Votre candidature face à cette offre"
        icon={Target}
      />

      <FtReveal>
        <FtCard accent="brand" className="p-6">
          <div className="grid gap-8 sm:grid-cols-[auto_1fr] sm:items-center">
            <FtScore value={result.scorePourcentage} label="Estimation prudente, à titre indicatif" />
            {result.explication && (
              <p className="text-body-sm leading-relaxed text-muted-foreground sm:border-l sm:border-border sm:pl-8">
                {result.explication}
              </p>
            )}
          </div>
        </FtCard>
      </FtReveal>

      <div className="grid gap-6 sm:grid-cols-2">
        <FtReveal index={1}>
          <SkillChips
            title="Compétences correspondantes"
            skills={result.competencesCorrespondantes}
            icon={CheckCircle2}
            tone="success"
          />
        </FtReveal>
        <FtReveal index={2}>
          <SkillChips
            title="Compétences manquantes"
            skills={result.competencesManquantes}
            icon={XCircle}
            tone="warning"
          />
        </FtReveal>
      </div>

      <FtReveal index={3}>
        <FtCard className="p-6">
          <p className="flex items-center gap-2 text-label-sm uppercase tracking-wide text-brand">
            <FileCheck2 className="size-3.5" aria-hidden="true" />
            Documents à préparer pour cette candidature
          </p>

          {result.documentsAPreparer.length === 0 ? (
            <p className="mt-4 text-body-sm text-muted-foreground">Aucune recommandation.</p>
          ) : (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {result.documentsAPreparer.map((doc) => (
                <li
                  key={doc}
                  className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3 text-body-sm text-muted-foreground transition-colors hover:border-brand"
                >
                  <FileText className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                  {doc}
                </li>
              ))}
            </ul>
          )}
        </FtCard>
      </FtReveal>
    </div>
  );
}

/**
 * La pastille numérotée posée au-dessus de chaque carte : contour vide tant que
 * le champ est vide, pleine et cochée dès qu'il est rempli. Même bascule que la
 * barre de progression, à un endroit où le regard est déjà.
 */
function StepMarker({ index, done }: { index: number; done: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full text-label-sm font-semibold transition-colors duration-200 ease-standard',
        // Fond `#f6fbff` dans les deux états : c'est le cercle qui reste
        // constant, et la coche qui marque le passage à « rempli ».
        'bg-[#f6fbff]',
        done ? 'text-[#3158b0]' : 'border border-[#3158b0]/30 text-[#3158b0]',
      )}
    >
      {done ? <Check className="size-4" strokeWidth={3} /> : index}
    </span>
  );
}

function StepLabel({ index, done, children }: { index: number; done: boolean; children: string }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <StepMarker index={index} done={done} />
      <h2 className="font-sans text-headline-md font-bold text-[#102a74]">{children}</h2>
    </div>
  );
}

export default function JobMatchPage() {
  useDocumentTitle('Analyser une offre — France Travail');

  const [offerText, setOfferText] = useState('');
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<JobMatchAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasOffer = offerText.trim().length > 0;
  const canAnalyze = hasOffer && cvFile !== null && !isAnalyzing;

  const analyze = async () => {
    if (!cvFile) return;
    setIsAnalyzing(true);
    setError(null);
    setResult(null);
    try {
      const analysis = await jobMatchService.analyze(offerText, cvFile);
      setResult(analysis);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "L'analyse a échoué.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const hasCv = cvFile !== null;
  const completed = (hasOffer ? 1 : 0) + (hasCv ? 1 : 0);

  return (
    <div className="mx-auto max-w-container pb-24">
      <CitizenPageHeader
        eyebrow="Analyse de candidature"
        title="Votre candidature confrontée à l’offre, avant de postuler."
        description="Compétences requises, ce qu’il vous manque, documents à préparer, et une estimation prudente de vos chances."
        // Même recette que « Déposer un dossier » / « Suivre un dossier
        // déposé » : police sans, taille `display`, bleu #102a74 — sinon les
        // titres du même parcours n'ont ni la même police ni la même taille.
        titleClassName="font-sans text-[#102a74] sm:text-display"
        className="mb-8"
      />

      {/* Progression globale — le même compteur que les pastilles numérotées,
          dérivé des deux mêmes booléens : les deux ne peuvent pas diverger. */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="text-label-md text-on-surface">Progression</p>
          <p className="text-label-md tabular-nums text-muted-foreground">{completed}/2</p>
        </div>
        <Progress
          value={(completed / 2) * 100}
          className="h-[5px]"
          aria-label={`${completed} élément sur 2 complété`}
        />
      </div>

      {/* `items-stretch` par défaut sur une grille : les deux cartes prennent la
          hauteur de la plus haute, sans hauteur fixe à maintenir. */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col">
          <StepLabel index={1} done={hasOffer}>
            L’offre d’emploi
          </StepLabel>
          <CitizenCard className="flex flex-1 flex-col p-6">
            <Textarea
              id="offer-text"
              aria-label="Texte de l’offre d’emploi"
              rows={10}
              placeholder="Collez ici le texte de l'offre d'emploi (intitulé, missions, compétences demandées, profil recherché…)"
              value={offerText}
              onChange={(event) => setOfferText(event.target.value)}
              disabled={isAnalyzing}
              // Une annonce entière dépasse la carte : le champ garde sa
              // hauteur et défile, plutôt que de repousser le bouton hors écran.
              className="flex-1 resize-none overflow-y-auto"
            />
            <p className="mt-3 flex items-start gap-2 text-body-sm text-muted-foreground">
              <ClipboardList className="mt-0.5 size-3.5 shrink-0 text-[#3158b0]" aria-hidden="true" />
              Copiez l’annonce entière — plus elle est complète, plus l’analyse est juste.
            </p>
          </CitizenCard>
        </section>

        <section className="flex flex-col">
          <StepLabel index={2} done={hasCv}>
            Votre CV
          </StepLabel>
          <CitizenCard className="flex flex-1 flex-col p-6">
            {cvFile ? (
              <div className="flex flex-1 items-center gap-4 rounded-lg border border-brand bg-brand-soft p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand text-marianne-foreground">
                  <FileText className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  {/* `truncate` : un nom de fichier à rallonge coupe au lieu
                      d'élargir la carte et de désaligner les deux colonnes. */}
                  <p className="truncate text-label-md text-ink">{cvFile.name}</p>
                  <p className="text-body-sm text-muted-foreground">
                    {(cvFile.size / 1024).toFixed(0)} Ko
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Retirer le CV"
                  disabled={isAnalyzing}
                  onClick={() => setCvFile(null)}
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
            ) : (
              <Dropzone
                title="Glissez votre CV ici"
                hint="Ou parcourez votre ordinateur — PDF, JPG, PNG"
                disabled={isAnalyzing}
                onFilesSelected={(files) => setCvFile(files[0] ?? null)}
                // Le bouton « Sélectionner des fichiers » appartient à
                // `Dropzone`, qui n'expose pas son style : on l'atteint par un
                // variant descendant plutôt que d'ouvrir une prop pour un seul
                // appelant.
                className="flex-1 [&_svg]:text-[#3158b0] [&_button]:bg-[#102c6d] [&_button]:text-white [&_button:hover]:opacity-90"
              />
            )}
          </CitizenCard>
        </section>
      </div>

      <div className="mt-8 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={!canAnalyze}
          // `cn` et non l'argument `className` de `cva` : ce dernier concatène,
          // `bg-brand` restait donc dans la liste et gagnait selon l'ordre des
          // règles CSS. `cn` (tailwind-merge) écarte la classe remplacée.
          className={cn(
            citizenButton(),
            'w-full bg-[#102c6d] px-8 text-white hover:opacity-90 sm:w-auto',
          )}
        >
          {isAnalyzing && <Loader2 className="animate-spin" aria-hidden="true" />}
          {isAnalyzing ? 'Analyse en cours…' : 'Analyser ma candidature'}
        </button>

        {!isAnalyzing &&
          (canAnalyze ? (
            <p className="flex items-center gap-2 text-body-sm text-success">
              <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
              Tout est prêt — lancez l’analyse.
            </p>
          ) : (
            <p className="text-body-sm text-muted-foreground">
              Complétez les deux éléments ci-dessus
            </p>
          ))}
      </div>

      {error && (
        <p role="alert" className="mt-6 text-body-sm text-destructive">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-10">
          <ResultPanel result={result} />
        </div>
      )}
    </div>
  );
}
