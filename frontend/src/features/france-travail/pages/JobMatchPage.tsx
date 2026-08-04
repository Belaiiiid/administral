import { CheckCircle2, FileText, Info, Loader2, Sparkles, Target, X, XCircle } from 'lucide-react';
import { useState } from 'react';

import { CitizenCard } from '@/components/citizen/CitizenCard';
import { CitizenEmptyState } from '@/components/citizen/CitizenEmptyState';
import { citizenButton } from '@/components/citizen/citizenButton';
import { Dropzone } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { FranceTravailShell } from '@/features/france-travail/components/FranceTravailShell';
import { jobMatchService } from '@/services/jobMatchService';
import type { JobMatchAnalysis } from '@/types';

/**
 * "Analyser une offre" — France Travail's accompagnement tool: paste a job
 * offer, provide a CV, and get back required/matched/missing skills, the
 * documents worth preparing for *this* application, and a prudent match
 * score. Stateless by design — nothing is saved, a new offer just replaces
 * the previous result on screen.
 *
 * Passée au design Administral : grand score en `font-display` et barre
 * colorée à la place de l'anneau de progression, compétences en pastilles.
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
    <CitizenCard className="h-full p-6">
      <p
        className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wide ${
          tone === 'success' ? 'text-success' : 'text-warning'
        }`}
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {title}
      </p>

      {skills.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">Aucune.</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {skills.map((skill) => (
            <span
              key={skill}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                tone === 'success'
                  ? 'bg-success-surface text-success'
                  : 'bg-warning-surface text-warning'
              }`}
            >
              {skill}
            </span>
          ))}
        </div>
      )}
    </CitizenCard>
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

  const score = result.scorePourcentage ?? 0;
  const bar = score >= 66 ? 'bg-success' : score >= 33 ? 'bg-brand' : 'bg-warning';

  return (
    <div className="space-y-gutter">
      <CitizenCard className="p-6">
        <p className="eyebrow">Estimation de correspondance</p>
        <h2 className="mt-3 font-display text-2xl font-extrabold leading-tight text-ink">
          Vos chances sur cette offre
        </h2>

        <div className="mt-6 flex items-baseline gap-2">
          <span className="font-display text-5xl font-extrabold tabular-nums text-ink">
            {result.scorePourcentage ?? '—'}
          </span>
          {result.scorePourcentage !== null && (
            <span className="text-lg font-semibold text-muted-foreground">%</span>
          )}
        </div>

        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-border/60">
          <div
            className={`h-full rounded-full transition-all duration-500 ${bar}`}
            style={{ width: `${score}%` }}
          />
        </div>

        <p className="mt-5 inline-flex rounded-full bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand">
          Estimation prudente, à titre indicatif
        </p>

        {result.explication && (
          <p className="mt-5 text-body-sm leading-relaxed text-muted-foreground">
            {result.explication}
          </p>
        )}
      </CitizenCard>

      <div className="grid gap-6 sm:grid-cols-2">
        <SkillChips
          title="Compétences correspondantes"
          skills={result.competencesCorrespondantes}
          icon={CheckCircle2}
          tone="success"
        />
        <SkillChips
          title="Compétences manquantes"
          skills={result.competencesManquantes}
          icon={XCircle}
          tone="warning"
        />
      </div>

      <CitizenCard className="p-6">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-brand">
          <FileText className="size-3.5" aria-hidden="true" />
          Documents à préparer pour cette candidature
        </p>

        {result.documentsAPreparer.length === 0 ? (
          <p className="mt-4 text-xs text-muted-foreground">Aucune recommandation.</p>
        ) : (
          <ul className="mt-5 space-y-3">
            {result.documentsAPreparer.map((doc) => (
              <li
                key={doc}
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-surface p-3 text-xs leading-relaxed text-muted-foreground"
              >
                <FileText className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                {doc}
              </li>
            ))}
          </ul>
        )}
      </CitizenCard>
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

  const canAnalyze = offerText.trim().length > 0 && cvFile !== null && !isAnalyzing;

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
      aside={
        <div className="relative overflow-hidden rounded-2xl border border-brand/20 bg-card/75 p-8 text-center shadow-lg backdrop-blur">
          <div className="pointer-events-none absolute -right-12 -top-12 size-36 rounded-full bg-brand/5 blur-3xl" />
          <div className="relative">
            <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand text-white shadow-md ring-8 ring-brand/10">
              <Target className="size-8" aria-hidden="true" />
            </span>
            <p className="mt-6 font-display text-5xl font-extrabold tabular-nums text-brand">
              {result?.available && result.scorePourcentage !== null ? (
                <>
                  {result.scorePourcentage}
                  <span className="text-2xl text-muted-foreground">%</span>
                </>
              ) : (
                '—'
              )}
            </p>
            <p className="mt-3 text-sm font-semibold leading-snug text-muted-foreground">
              {result?.available
                ? 'Correspondance avec cette offre'
                : 'Envoyez une offre et votre CV pour obtenir une estimation'}
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-gutter">
        <CitizenCard className="p-6">
          <p className="eyebrow">Étape 1</p>
          <h2 className="mt-3 font-display text-xl font-extrabold leading-tight text-ink">
            L’offre d’emploi
          </h2>
          <div className="mt-6 space-y-3">
            <Label htmlFor="offer-text">Texte de l’offre</Label>
            <Textarea
              id="offer-text"
              rows={8}
              placeholder="Collez ici le texte de l'offre d'emploi (intitulé, missions, compétences demandées, profil recherché…)"
              value={offerText}
              onChange={(event) => setOfferText(event.target.value)}
              disabled={isAnalyzing}
            />
          </div>
        </CitizenCard>

        <CitizenCard className="p-6">
          <p className="eyebrow">Étape 2</p>
          <h2 className="mt-3 font-display text-xl font-extrabold leading-tight text-ink">
            Votre CV
          </h2>
          <div className="mt-6">
            {cvFile ? (
              <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-surface p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
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
          </div>
        </CitizenCard>

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
