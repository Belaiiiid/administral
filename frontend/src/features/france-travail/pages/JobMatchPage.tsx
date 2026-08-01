import { CheckCircle2, FileText, Info, Loader2, Sparkles, X, XCircle } from 'lucide-react';
import { useState } from 'react';

import { CircularProgress, Dropzone, EmptyState, PageHeader, SectionHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
 */

function SkillList({
  title,
  skills,
  icon: Icon,
  tone,
}: {
  title: string;
  skills: string[];
  icon: typeof CheckCircle2;
  tone: 'success' | 'neutral';
}) {
  return (
    <Card>
      <CardHeader>
        <SectionHeader title={title} as="h3" />
      </CardHeader>
      <CardContent>
        {skills.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">Aucune.</p>
        ) : (
          <ul className="space-y-2">
            {skills.map((skill) => (
              <li key={skill} className="flex items-start gap-2 text-body-sm text-on-surface">
                <Icon
                  className={tone === 'success' ? 'mt-0.5 size-4 shrink-0 text-success' : 'mt-0.5 size-4 shrink-0 text-on-surface-variant'}
                  aria-hidden="true"
                />
                {skill}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ResultPanel({ result }: { result: JobMatchAnalysis }) {
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
      <Card>
        <CardContent className="flex flex-col items-center gap-4 pt-6 sm:flex-row sm:items-start">
          <CircularProgress
            value={result.scorePourcentage}
            label="Correspondance"
            progressClassName="stroke-[#E04580] text-[#E04580]"
          />
          <div className="flex-1 space-y-2">
            <Badge tone={
              (result.scorePourcentage ?? 0) >= 66
                ? 'success'
                : (result.scorePourcentage ?? 0) >= 33
                  ? 'info'
                  : 'neutral'
            }>
              Estimation prudente, à titre indicatif
            </Badge>
            {result.explication && (
              <p className="text-body-sm text-on-surface-variant">{result.explication}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-gutter sm:grid-cols-2">
        <SkillList
          title="Compétences correspondantes"
          skills={result.competencesCorrespondantes}
          icon={CheckCircle2}
          tone="success"
        />
        <SkillList
          title="Compétences manquantes"
          skills={result.competencesManquantes}
          icon={XCircle}
          tone="neutral"
        />
      </div>

      <Card>
        <CardHeader>
          <SectionHeader title="Documents à préparer pour cette candidature" as="h3" />
        </CardHeader>
        <CardContent>
          {result.documentsAPreparer.length === 0 ? (
            <p className="text-body-sm text-on-surface-variant">Aucune recommandation.</p>
          ) : (
            <ul className="space-y-2">
              {result.documentsAPreparer.map((doc) => (
                <li key={doc} className="flex items-start gap-2 text-body-sm text-on-surface">
                  <FileText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  {doc}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
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
    <FranceTravailShell>
      <PageHeader
        title="Analyser une offre d'emploi"
        description="Collez une offre et votre CV : compétences requises, ce qu'il vous manque, les documents à préparer, et une estimation de vos chances."
      />

      <div className="space-y-gutter">
        <Card>
          <CardHeader>
            <SectionHeader title="L'offre d'emploi" as="h3" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="offer-text">Texte de l'offre</Label>
            <Textarea
              id="offer-text"
              rows={8}
              placeholder="Collez ici le texte de l'offre d'emploi (intitulé, missions, compétences demandées, profil recherché…)"
              value={offerText}
              onChange={(event) => setOfferText(event.target.value)}
              disabled={isAnalyzing}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionHeader title="Votre CV" as="h3" />
          </CardHeader>
          <CardContent>
            {cvFile ? (
              <div className="flex items-center gap-4 rounded-lg border border-border bg-surface-lowest p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary">
                  <FileText className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-label-md text-on-surface">{cvFile.name}</p>
                  <p className="text-body-sm text-on-surface-variant">
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
          </CardContent>
        </Card>

        <Button
          block
          onClick={analyze}
          disabled={!canAnalyze}
          className="bg-[#6B367D] text-white hover:bg-[#6B367D]/90"
        >
          {isAnalyzing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
          {isAnalyzing ? 'Analyse en cours…' : 'Analyser ma candidature'}
        </Button>

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
