import {
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  FileText,
  Info,
  Loader2,
  Sparkles,
  Target,
  X,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';

import { CitizenEmptyState } from '@/components/citizen/CitizenEmptyState';
import { citizenButton } from '@/components/citizen/citizenButton';
import { Dropzone } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { FranceTravailShell } from '@/features/france-travail/components/FranceTravailShell';
import heroImage from '@/assets/ft-analyse-offre.webp';
import {
  FtAside,
  FtCard,
  FtReveal,
  FtScore,
  FtSectionHeading,
  FtStep,
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
 * La page est un parcours en deux temps, elle est donc présentée comme tel :
 * étapes numérotées reliées par un rail, qui se cochent à mesure qu'elles
 * sont remplies. L'ancienne version alignait deux cartes identiques sans dire
 * qu'il fallait les deux pour lancer l'analyse — le bouton se contentait de
 * rester grisé.
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

  return (
    <FranceTravailShell
      eyebrow="Analyse de candidature"
      title="Votre candidature confrontée à l’offre, avant de postuler."
      description="Collez une offre et votre CV : compétences requises, ce qu’il vous manque, les documents à préparer, et une estimation prudente de vos chances."
      image={heroImage}
      // Les visages sont dans le tiers haut : sans ce décalage, le recadrage
      // panoramique ne garderait que les chaises.
      imagePosition="center 38%"
      aside={
        <FtAside
          icon={Target}
          title="Ce dont vous avez besoin"
          description="Rien n’est enregistré : une nouvelle analyse remplace la précédente."
        >
          <ul className="space-y-3">
            {[
              { label: 'Le texte de l’offre', done: hasOffer },
              { label: 'Votre CV', done: cvFile !== null },
            ].map((item) => (
              <li key={item.label} className="flex items-center gap-3 text-body-md">
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ease-standard ${
                    item.done
                      ? 'bg-chart-2 text-marianne-foreground'
                      : 'border border-border-strong text-muted-foreground'
                  }`}
                >
                  {item.done ? (
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                  ) : (
                    <span className="size-1.5 rounded-full bg-current" />
                  )}
                </span>
                <span className={item.done ? 'text-ink' : 'text-muted-foreground'}>
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </FtAside>
      }
    >
      <div className="space-y-gutter">
        <FtStep index={1} eyebrow="Étape 1" title="L’offre d’emploi" done={hasOffer}>
          <div className="space-y-3">
            <Label htmlFor="offer-text">Texte de l’offre</Label>
            <Textarea
              id="offer-text"
              rows={8}
              placeholder="Collez ici le texte de l'offre d'emploi (intitulé, missions, compétences demandées, profil recherché…)"
              value={offerText}
              onChange={(event) => setOfferText(event.target.value)}
              disabled={isAnalyzing}
            />
            <p className="flex items-center gap-2 text-body-sm text-muted-foreground">
              <ClipboardList className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
              Copiez l’annonce entière — plus elle est complète, plus l’analyse est juste.
            </p>
          </div>
        </FtStep>

        <FtStep index={2} eyebrow="Étape 2" title="Votre CV" done={cvFile !== null} isLast>
          {cvFile ? (
            <div className="flex items-center gap-4 rounded-lg border border-brand bg-brand-soft p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand text-marianne-foreground">
                <FileText className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
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
              hint="Ou cliquez pour parcourir votre ordinateur — PDF, JPG, PNG"
              disabled={isAnalyzing}
              onFilesSelected={(files) => setCvFile(files[0] ?? null)}
            />
          )}
        </FtStep>

        {/* Action collante : le bouton reste atteignable pendant qu'on remplit. */}
        <div className="sticky bottom-4 z-10 sm:pl-16">
          <div className="rounded-xl border border-border bg-card p-3 shadow-soft backdrop-blur">
            <button
              type="button"
              onClick={() => void analyze()}
              disabled={!canAnalyze}
              className={citizenButton({ variant: 'marianne', className: 'w-full' })}
            >
              {isAnalyzing ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles aria-hidden="true" />
              )}
              {isAnalyzing ? 'Analyse en cours…' : 'Analyser ma candidature'}
            </button>
            {!canAnalyze && !isAnalyzing && (
              <p className="mt-2 text-center text-body-sm text-muted-foreground">
                {!hasOffer && !cvFile
                  ? 'Complétez les deux étapes ci-dessus'
                  : !hasOffer
                    ? 'Il manque le texte de l’offre'
                    : 'Il manque votre CV'}
              </p>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-body-sm text-destructive">
            {error}
          </p>
        )}

        {result && <ResultPanel result={result} />}
      </div>
    </FranceTravailShell>
  );
}
