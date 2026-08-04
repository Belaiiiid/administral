import {
  BriefcaseBusiness,
  ExternalLink,
  Info,
  Loader2,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { CitizenEmptyState } from '@/components/citizen/CitizenEmptyState';
import { citizenButton } from '@/components/citizen/citizenButton';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { FranceTravailShell } from '@/features/france-travail/components/FranceTravailShell';
import heroImage from '@/assets/ft-recherche-emploi.avif';
import {
  FtAside,
  FtCard,
  FtReveal,
  FtSectionHeading,
} from '@/features/france-travail/components/FtVisuals';
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
 *
 * Les offres arrivent en fondu décalé plutôt que d'apparaître en bloc : sur
 * une liste classée par pertinence, l'ordre d'entrée fait lire de haut en bas
 * dans le bon sens. Le filtre par contrat est purement client — il trie ce
 * que le backend a déjà renvoyé et ne relance aucune recherche.
 */

const EXAMPLE_PROMPT =
  'Je suis ingénieur en IA générative et je veux trouver les jobs disponibles à Paris';

/** Vert au-dessus de 66 %, bleu de marque au-dessus de 33 %, ambre en dessous. */
function scoreTone(score: number) {
  if (score >= 66)
    return { chip: 'bg-success-surface text-success', bar: 'bg-success', accent: 'success' } as const;
  if (score >= 33)
    return { chip: 'bg-brand-soft text-brand', bar: 'bg-brand', accent: 'brand' } as const;
  return { chip: 'bg-warning-surface text-warning', bar: 'bg-warning', accent: 'warning' } as const;
}

function OfferCard({ offer }: { offer: JobOffer }) {
  const tone = offer.score !== null ? scoreTone(offer.score) : null;

  return (
    <FtCard interactive accent={tone?.accent} className="flex h-full flex-col p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-headline-md text-ink">{offer.intitule}</h3>
          {offer.entreprise && (
            <p className="mt-1 text-label-sm text-muted-foreground">{offer.entreprise}</p>
          )}
        </div>
        {tone && (
          <span
            className={`shrink-0 rounded-full px-3 py-1.5 text-label-sm tabular-nums ${tone.chip}`}
          >
            {offer.score} %
          </span>
        )}
      </div>

      {tone && (
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ease-out ${tone.bar}`}
            style={{ width: `${offer.score}%` }}
          />
        </div>
      )}

      <dl className="mt-5 flex flex-wrap gap-2 text-label-sm">
        {offer.lieuLibelle && (
          <div className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-muted-foreground">
            <MapPin className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
            <dd>{offer.lieuLibelle}</dd>
          </div>
        )}
        {offer.typeContrat && (
          <div className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-muted-foreground">
            <BriefcaseBusiness className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
            <dd>{offer.typeContrat}</dd>
          </div>
        )}
      </dl>

      {offer.raison && (
        <p className="mt-5 flex items-start gap-3 rounded-lg border-l-2 border-brand bg-brand-soft p-4 text-body-sm text-muted-foreground">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
          {offer.raison}
        </p>
      )}

      <p className="mt-5 flex-1 text-body-sm text-muted-foreground">
        {offer.description}
      </p>

      {offer.url && (
        <div className="mt-6 border-t border-border pt-4">
          <a
            href={offer.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-label-md text-brand transition-all hover:gap-3"
          >
            Voir l&rsquo;offre sur France Travail
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        </div>
      )}
    </FtCard>
  );
}

export default function JobSearchPage() {
  useDocumentTitle('Rechercher un emploi — France Travail');

  const [prompt, setPrompt] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<JobSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contract, setContract] = useState('Tous');

  const search = async () => {
    if (!prompt.trim() || isSearching) return;
    setIsSearching(true);
    setError(null);
    setResult(null);
    setContract('Tous');
    try {
      const data = await jobSearchService.search(prompt);
      setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La recherche a échoué.');
    } finally {
      setIsSearching(false);
    }
  };

  /** Types de contrat réellement présents dans les résultats, jamais devinés. */
  const contracts = useMemo(() => {
    const found = new Set<string>();
    result?.offres.forEach((offer) => {
      if (offer.typeContrat) found.add(offer.typeContrat);
    });
    return ['Tous', ...[...found].sort()];
  }, [result]);

  const visible = useMemo(() => {
    if (!result) return [];
    if (contract === 'Tous') return result.offres;
    return result.offres.filter((offer) => offer.typeContrat === contract);
  }, [result, contract]);

  return (
    <FranceTravailShell
      eyebrow="Recherche d'offres"
      title="Les offres qui correspondent vraiment à votre profil."
      description="Décrivez ce que vous cherchez en une phrase — métier, ville, tout autre détail — et retrouvez de vraies offres France Travail actuellement ouvertes, classées par pertinence."
      image={heroImage}
      // Contre-plongée : l'intérêt graphique est haut, vers le ciel et les
      // arêtes des tours.
      imagePosition="center 35%"
      aside={
        <FtAside
          icon={Target}
          tone="chart"
          value={result?.available ? result.offres.length : undefined}
          title={result?.available ? 'Offres ouvertes aujourd’hui' : 'Aucune recherche lancée'}
          description={
            result?.available
              ? 'Toutes réellement ouvertes chez France Travail, classées par pertinence.'
              : 'Décrivez ce que vous cherchez ci-dessous pour voir vos offres.'
          }
        >
          {result?.motsCles && (
            <p className="inline-flex rounded-full bg-brand-soft px-3 py-1.5 text-label-sm text-brand">
              {result.motsCles}
              {result.departement ? ` · ${result.departement}` : ''}
            </p>
          )}
        </FtAside>
      }
    >
      <div className="space-y-gutter">
        <FtCard accent="brand" className="p-6">
          <p className="eyebrow">Votre recherche</p>
          <h2 className="mt-3 font-display text-headline-md text-ink">
            Décrivez ce que vous cherchez
          </h2>

          <div className="mt-6 space-y-3">
            <Label htmlFor="job-search-prompt">En une phrase, comme à un conseiller</Label>
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
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void search()}
                disabled={!prompt.trim() || isSearching}
                className={citizenButton({ variant: 'marianne' })}
              >
                {isSearching ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Search aria-hidden="true" />
                )}
                {isSearching ? 'Recherche en cours…' : 'Rechercher'}
              </button>
              {!prompt && (
                <button
                  type="button"
                  onClick={() => setPrompt(EXAMPLE_PROMPT)}
                  className="text-label-sm text-brand underline-offset-4 hover:underline"
                >
                  Essayer un exemple
                </button>
              )}
            </div>
          </div>

          {contracts.length > 1 && (
            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-5">
              <span className="mr-1 inline-flex items-center gap-1.5 text-label-sm uppercase tracking-wide text-brand">
                <SlidersHorizontal className="size-3.5" aria-hidden="true" />
                Contrat
              </span>
              {contracts.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setContract(item)}
                  aria-pressed={item === contract}
                  className={`rounded-full px-3.5 py-1.5 text-label-sm transition-all duration-200 ${
                    item === contract
                      ? 'bg-brand text-marianne-foreground shadow-soft'
                      : 'bg-brand-soft text-brand hover:bg-brand-soft'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </FtCard>

        {error && (
          <p role="alert" className="text-body-sm text-destructive">
            {error}
          </p>
        )}

        {result && !result.available && (
          <CitizenEmptyState
            icon={Info}
            title="Recherche indisponible"
            description={result.unavailableReason ?? 'Réessayez dans un instant.'}
            tone="error"
          />
        )}

        {result?.available && visible.length === 0 && (
          <CitizenEmptyState
            icon={Search}
            title="Aucune offre ne correspond"
            description={
              result.offres.length === 0
                ? "Essayez d'élargir votre recherche — un métier plus général, ou sans préciser de ville."
                : 'Aucune offre pour ce type de contrat. Retirez le filtre pour toutes les voir.'
            }
          />
        )}

        {result?.available && visible.length > 0 && (
          <div className="space-y-8">
            <FtSectionHeading
              eyebrow="Classées par pertinence"
              title={`${visible.length} offre${visible.length > 1 ? 's' : ''} pour votre profil`}
              icon={BriefcaseBusiness}
              action={
                <p className="text-body-sm text-muted-foreground">
                  Source : API Offres d’emploi France Travail
                </p>
              }
            />

            <div className="grid gap-6 lg:grid-cols-2">
              {visible.map((offer, index) => (
                <FtReveal key={offer.id} index={index} className="h-full">
                  <OfferCard offer={offer} />
                </FtReveal>
              ))}
            </div>
          </div>
        )}
      </div>
    </FranceTravailShell>
  );
}
