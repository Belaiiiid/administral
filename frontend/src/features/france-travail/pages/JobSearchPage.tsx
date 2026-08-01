import { Briefcase, ExternalLink, Info, Loader2, MapPin, Search } from 'lucide-react';
import { useState } from 'react';

import { EmptyState, PageHeader, SectionHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { FranceTravailShell } from '@/features/france-travail/components/FranceTravailShell';
import { jobSearchService } from '@/services/jobSearchService';
import type { JobOffer, JobSearchResult } from '@/types';

/**
 * "Rechercher un emploi" — France Travail's third accompagnement tool.
 * A free-text prompt ("je suis ingénieur en IA générative et je veux
 * trouver les jobs disponibles à Paris") is turned into search criteria and
 * matched against **real, currently-open** France Travail offers — never
 * invented listings. Relevance scores are a judgment on top of real data,
 * not the data itself: an offer with `score: null` is still a real offer,
 * just one the scoring step couldn't rate.
 */

const EXAMPLE_PROMPT =
  'Je suis ingénieur en IA générative et je veux trouver les jobs disponibles à Paris';

function scoreTone(score: number): 'success' | 'info' | 'neutral' {
  if (score >= 66) return 'success';
  if (score >= 33) return 'info';
  return 'neutral';
}

function OfferCard({ offer }: { offer: JobOffer }) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-headline-md text-primary">{offer.intitule}</h3>
            {offer.entreprise && (
              <p className="text-body-sm text-on-surface-variant">{offer.entreprise}</p>
            )}
          </div>
          {offer.score !== null && (
            <Badge tone={scoreTone(offer.score)}>{offer.score}% de correspondance</Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-on-surface-variant">
          {offer.lieuLibelle && (
            <span className="flex items-center gap-1">
              <MapPin className="size-4" aria-hidden="true" />
              {offer.lieuLibelle}
            </span>
          )}
          {offer.typeContrat && (
            <span className="flex items-center gap-1">
              <Briefcase className="size-4" aria-hidden="true" />
              {offer.typeContrat}
            </span>
          )}
        </div>

        {offer.raison && (
          <p className="flex items-start gap-2 rounded-lg bg-surface-container p-3 text-body-sm text-on-surface-variant">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {offer.raison}
          </p>
        )}

        <p className="text-body-sm text-on-surface-variant">{offer.description}</p>

        {offer.url && (
          <Button asChild variant="outline-primary" size="sm">
            <a href={offer.url} target="_blank" rel="noopener noreferrer">
              Voir l'offre
              <ExternalLink aria-hidden="true" />
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ResultsPanel({ result }: { result: JobSearchResult }) {
  if (!result.available) {
    return (
      <EmptyState
        icon={Info}
        title="Recherche indisponible"
        description={result.unavailableReason ?? 'Réessayez dans un instant.'}
      />
    );
  }

  if (result.offres.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="Aucune offre ne correspond"
        description="Essayez d'élargir votre recherche — un métier plus général, ou sans préciser de ville."
      />
    );
  }

  return (
    <div className="space-y-gutter">
      <SectionHeader
        title={`${result.offres.length} offre${result.offres.length > 1 ? 's' : ''} trouvée${result.offres.length > 1 ? 's' : ''}`}
        as="h3"
      />
      {result.offres.map((offer) => (
        <OfferCard key={offer.id} offer={offer} />
      ))}
    </div>
  );
}

export default function JobSearchPage() {
  useDocumentTitle('Rechercher un emploi — France Travail');
  const [prompt, setPrompt] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<JobSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!prompt.trim() || isSearching) return;
    setIsSearching(true);
    setError(null);
    setResult(null);
    try {
      const data = await jobSearchService.search(prompt);
      setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La recherche a échoué.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <FranceTravailShell>
      <PageHeader
        title="Rechercher un emploi"
        description="Décrivez ce que vous cherchez en une phrase — métier, ville, tout autre détail — et retrouvez de vraies offres France Travail actuellement ouvertes, classées par pertinence."
      />

      <div className="space-y-gutter">
        <Card>
          <CardHeader>
            <SectionHeader title="Votre recherche" as="h3" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="job-search-prompt">Décrivez ce que vous cherchez</Label>
            <Textarea
              id="job-search-prompt"
              rows={4}
              placeholder={EXAMPLE_PROMPT}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              disabled={isSearching}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void search();
                }
              }}
            />
            <Button
              onClick={() => void search()}
              disabled={!prompt.trim() || isSearching}
              className="bg-[#6B367D] text-white hover:bg-[#6B367D]/90"
            >
              {isSearching ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Search aria-hidden="true" />
              )}
              {isSearching ? 'Recherche en cours…' : 'Rechercher'}
            </Button>
          </CardContent>
        </Card>

        {error && (
          <p role="alert" className="text-body-sm text-destructive">
            {error}
          </p>
        )}

        {result && <ResultsPanel result={result} />}
      </div>
    </FranceTravailShell>
  );
}
