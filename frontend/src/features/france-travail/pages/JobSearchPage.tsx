import {
  BriefcaseBusiness,
  ExternalLink,
  Info,
  Loader2,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { CitizenCard } from '@/components/citizen/CitizenCard';
import { CitizenEmptyState } from '@/components/citizen/CitizenEmptyState';
import { citizenButton } from '@/components/citizen/citizenButton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
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

/**
 * Amorces cliquables — quatre phrases entières, pas des mots-clés : le champ
 * attend une description, et un exemple qui ne s'écrit pas comme la réponse
 * attendue apprend la mauvaise chose.
 */
const EXAMPLE_PROMPTS = [
  EXAMPLE_PROMPT,
  'Je cherche un poste de vendeur en CDI à Lyon',
  'Aide-soignante, temps partiel, autour de Nantes',
  'Développeur web junior, télétravail possible',
];

/** Vert au-dessus de 66 %, bleu de marque au-dessus de 33 %, ambre en dessous. */
function scoreTone(score: number) {
  if (score >= 66)
    return { chip: 'bg-success-surface text-success', bar: 'bg-success', accent: 'success' } as const;
  if (score >= 33)
    return { chip: 'bg-brand-soft text-brand', bar: 'bg-brand', accent: 'brand' } as const;
  return {
    chip: 'bg-warning-surface text-warning-foreground',
    bar: 'bg-warning',
    accent: 'warning',
  } as const;
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
    <div className="mx-auto max-w-container pb-24">
      {/* En-tête sur fond clair, même grammaire que « Analyser une offre » et
          « Coach CV » : une pastille, un titre, un sous-titre. */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-2 rounded-full bg-[#f6fbff] px-3 py-1.5 text-label-sm font-semibold uppercase tracking-wide text-[#3158b0]">
          <Search className="size-3.5" aria-hidden="true" />
          Recherche d’offres
        </span>
        <h1 className="mt-4 font-display text-headline-lg-mobile font-bold leading-tight text-[#102a74] sm:text-4xl">
          Les offres qui correspondent vraiment à votre profil.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Décrivez ce que vous cherchez en une phrase — métier, ville, tout autre détail — et
          retrouvez de vraies offres France Travail, classées par pertinence.
        </p>
      </div>

      <div className="space-y-gutter">
        <CitizenCard className="p-6">
          <h2 className="flex items-center gap-3 font-sans text-headline-md font-bold text-[#373848]">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#f6fbff] text-[#3158b0]">
              <Search className="size-4" aria-hidden="true" />
            </span>
            Décrivez ce que vous cherchez, comme à un conseiller
          </h2>

          <Textarea
            id="job-search-prompt"
            aria-label="Décrivez ce que vous cherchez"
            rows={4}
            placeholder={EXAMPLE_PROMPT}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            disabled={isSearching}
            className="mt-5 resize-none"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void search();
              }
            }}
          />

          {/* Exemples : des boutons de même hauteur dans une rangée qui se
              replie, jamais un lien texte au milieu de boutons. */}
          <ul className="mt-4 flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  onClick={() => setPrompt(example)}
                  disabled={isSearching}
                  className="inline-flex h-9 items-center rounded-full bg-[#f6fbff] px-4 text-label-sm text-[#3158b0] transition-colors hover:bg-[#e6f0fb] disabled:opacity-50"
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => void search()}
              disabled={!prompt.trim() || isSearching}
              className={cn(
                citizenButton(),
                'bg-[#102c6d] px-8 text-white hover:opacity-90',
              )}
            >
              {isSearching ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Search aria-hidden="true" />
              )}
              {isSearching ? 'Recherche en cours…' : 'Rechercher'}
            </button>
          </div>
        </CitizenCard>

        {/* L'emplacement des résultats, annoncé tant qu'il est vide : les offres
            s'affichent ici même, il n'y a pas d'autre page à atteindre. */}
        {!result && !error && !isSearching && (
          <p className="flex items-start gap-3 rounded-2xl bg-[#f6fbff] p-5 text-body-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-[#3158b0]" aria-hidden="true" />
            Aucune recherche lancée pour le moment — vos offres correspondantes apparaîtront ici,
            classées par pertinence.
          </p>
        )}

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

            {/* Filtre par contrat : il vit avec les résultats qu'il trie, plus
                dans la carte de recherche — il n'y avait rien à filtrer avant
                d'avoir cherché. Purement client, aucune requête relancée. */}
            {contracts.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 inline-flex items-center gap-1.5 text-label-sm uppercase tracking-wide text-[#3158b0]">
                  <SlidersHorizontal className="size-3.5" aria-hidden="true" />
                  Contrat
                </span>
                {contracts.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setContract(item)}
                    aria-pressed={item === contract}
                    className={cn(
                      'inline-flex h-9 items-center rounded-full px-4 text-label-sm transition-colors duration-200',
                      item === contract
                        ? 'bg-[#102c6d] text-white'
                        : 'bg-[#f6fbff] text-[#3158b0] hover:bg-[#e6f0fb]',
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}

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
    </div>
  );
}
