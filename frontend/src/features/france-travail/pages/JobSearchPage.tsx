import {
  ArrowRight,
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

import { CitizenCard } from '@/components/citizen/CitizenCard';
import { CitizenEmptyState } from '@/components/citizen/CitizenEmptyState';
import { citizenButton } from '@/components/citizen/citizenButton';
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
 *
 * Passée au design Administral : cartes `CitizenCard`, pastille de score et
 * barre colorée reprises de la maquette design-to-code. Le filtre par contrat
 * est purement client — il trie ce que le backend a déjà renvoyé et ne
 * relance aucune recherche.
 */

const EXAMPLE_PROMPT =
  'Je suis ingénieur en IA générative et je veux trouver les jobs disponibles à Paris';

/** Vert au-dessus de 66 %, bleu de marque au-dessus de 33 %, ambre en dessous. */
function scoreTone(score: number) {
  if (score >= 66) return { chip: 'bg-success-surface text-success', bar: 'bg-success' };
  if (score >= 33) return { chip: 'bg-brand-soft text-brand', bar: 'bg-brand' };
  return { chip: 'bg-warning-surface text-warning', bar: 'bg-warning' };
}

function OfferCard({ offer }: { offer: JobOffer }) {
  const tone = offer.score !== null ? scoreTone(offer.score) : null;

  return (
    <CitizenCard interactive className="flex h-full flex-col p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-bold leading-snug text-ink">{offer.intitule}</h3>
          {offer.entreprise && (
            <p className="mt-1 text-xs font-semibold text-muted-foreground">{offer.entreprise}</p>
          )}
        </div>
        {tone && (
          <span
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold tabular-nums ${tone.chip}`}
          >
            {offer.score} %
          </span>
        )}
      </div>

      {tone && (
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-border/60">
          <div
            className={`h-full rounded-full transition-all duration-500 ${tone.bar}`}
            style={{ width: `${offer.score}%` }}
          />
        </div>
      )}

      <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
        {offer.lieuLibelle && (
          <div className="flex items-center gap-2">
            <MapPin className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
            <dd>{offer.lieuLibelle}</dd>
          </div>
        )}
        {offer.typeContrat && (
          <div className="flex items-center gap-2">
            <BriefcaseBusiness className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
            <dd>{offer.typeContrat}</dd>
          </div>
        )}
      </dl>

      {offer.raison && (
        <p className="mt-5 flex items-start gap-3 rounded-xl border border-brand/15 bg-brand-soft/50 p-4 text-xs leading-relaxed text-muted-foreground">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
          {offer.raison}
        </p>
      )}

      <p className="mt-5 flex-1 text-xs leading-relaxed text-muted-foreground">
        {offer.description}
      </p>

      {offer.url && (
        <div className="mt-6 border-t border-border/60 pt-4">
          <a
            href={offer.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-brand transition-all hover:gap-3"
          >
            Voir l&rsquo;offre sur France Travail
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        </div>
      )}
    </CitizenCard>
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
      aside={
        <div className="relative overflow-hidden rounded-2xl border border-brand/20 bg-card/75 p-8 text-center shadow-lg backdrop-blur">
          <div className="pointer-events-none absolute -right-12 -top-12 size-36 rounded-full bg-chart-2/5 blur-3xl" />
          <div className="relative">
            <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-chart-2 text-white shadow-md ring-8 ring-chart-2/10">
              <Target className="size-8" aria-hidden="true" />
            </span>
            <p className="mt-6 font-display text-5xl font-extrabold tabular-nums text-chart-2">
              {result?.available ? result.offres.length : '—'}
            </p>
            <p className="mt-3 text-sm font-semibold leading-snug text-muted-foreground">
              {result?.available
                ? 'Offres réellement ouvertes aujourd’hui'
                : 'Lancez une recherche pour voir vos offres'}
            </p>
            {result?.motsCles && (
              <p className="mt-4 inline-flex rounded-full bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand">
                {result.motsCles}
                {result.departement ? ` · ${result.departement}` : ''}
              </p>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-gutter">
        <CitizenCard className="p-6">
          <p className="eyebrow">Votre recherche</p>
          <h2 className="mt-3 font-display text-xl font-extrabold leading-tight text-ink">
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
          </div>

          {contracts.length > 1 && (
            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border/60 pt-5">
              <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand">
                <SlidersHorizontal className="size-3.5" aria-hidden="true" />
                Contrat
              </span>
              {contracts.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setContract(item)}
                  aria-pressed={item === contract}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    item === contract
                      ? 'bg-brand text-white'
                      : 'bg-brand-soft text-brand hover:bg-brand/15'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </CitizenCard>

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
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="eyebrow">Résultats classés par pertinence</p>
                <h2 className="mt-3 font-display text-2xl font-extrabold leading-tight text-ink">
                  {visible.length} offre{visible.length > 1 ? 's' : ''} pour votre profil
                </h2>
              </div>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                Source : API Offres d’emploi France Travail
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </p>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              {visible.map((offer) => (
                <OfferCard key={offer.id} offer={offer} />
              ))}
            </div>
          </div>
        )}
      </div>
    </FranceTravailShell>
  );
}
