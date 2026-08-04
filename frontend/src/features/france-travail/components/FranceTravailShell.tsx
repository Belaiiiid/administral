import type { ReactNode } from 'react';

interface FranceTravailShellProps {
  eyebrow: string;
  title: string;
  description: string;
  /** Photo de fond du bandeau, importée depuis `src/assets`. */
  image: string;
  /**
   * Cadrage de la photo. Le bandeau est très panoramique (~1200 × 300) alors
   * que les sources sont en 3:2 : `object-cover` en coupe l'essentiel, et
   * c'est ce réglage qui décide de ce qui reste visible.
   */
  imagePosition?: string;
  /** Encart optionnel à droite du titre (score, chiffre clé, statut…). */
  aside?: ReactNode;
  children: ReactNode;
}

/**
 * Bandeau commun aux pages France Travail.
 *
 * ⚠️ Aucun modificateur d'opacité sur les tokens (`text-brand/70`,
 * `via-background/85`…). Les variables de la charte contiennent une couleur
 * complète en `oklch()`, pas des canaux : Tailwind 3 ne génère alors
 * **aucune règle**, et la propriété retombe silencieusement sur la valeur
 * héritée. Le voile posé sur la photo n'utilise donc que des tokens pleins et
 * le mot-clé `transparent`, dont l'alpha est réel.
 *
 * La photo n'apparaît qu'à partir de `lg`. En dessous, le texte occupe toute
 * la largeur : aucun voile ne pourrait le protéger sans masquer la photo de
 * toute façon.
 *
 * La marge basse tient compte de `FloatingActionBubbles`, en position fixe en
 * bas à gauche, qui recouvrait le dernier bloc.
 */
export function FranceTravailShell({
  eyebrow,
  title,
  description,
  image,
  imagePosition = 'center',
  aside,
  children,
}: FranceTravailShellProps) {
  return (
    <div className="-mx-4 -my-6 bg-surface px-4 py-6 sm:-mx-6 sm:px-6">
      <div className="mx-auto max-w-container">
        <section className="relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-10 shadow-soft sm:px-10">
          <img
            src={image}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 hidden size-full object-cover lg:block"
            style={{ objectPosition: imagePosition }}
          />
          {/*
            Réglage mesuré, pas choisi à l'œil : blanc plein jusqu'à 40 % de la
            largeur puis fondu jusqu'à 85 %.

            `LandingHero` éteint son voile à 60 % (`lg:w-3/5`), ce qui marche
            chez lui parce que sa colonne de texte s'arrête avant et que sa
            photo est claire à cet endroit. Ici la colonne va jusqu'à 59 % et
            deux des trois photos y sont sombres : le titre tombait à 1,0:1,
            littéralement invisible. Étendre le fondu jusqu'à 85 % ramène le
            pire cas à 6,0:1 tout en montrant plus de photo qu'un voile qui
            s'arrête tôt — 37 % contre 20 %.
          */}
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 hidden w-full bg-gradient-to-r from-card from-40% to-transparent to-85% lg:block"
          />
          {/* Raccord avec le bas de la carte. */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 hidden h-20 bg-gradient-to-t from-card to-transparent lg:block"
          />
          {/*
            Sous `lg`, la photo est masquée. Le texte y occupe toute la largeur :
            aucun voile ne le protégerait sans rendre la photo invisible de
            toute façon. On garde le voile de marque à la place.
          */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-28 -top-32 size-80 rounded-full bg-brand-soft blur-3xl lg:hidden"
          />
          {/* Filet de marque : signe la zone, par-dessus la photo. */}
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-brand" />

          <div className="relative grid gap-10 lg:grid-cols-[1.35fr_0.65fr] lg:items-center">
            <div>
              <div className="mb-7 flex items-center gap-4">
                <span className="flex h-14 w-24 shrink-0 items-center justify-center rounded-lg border border-border bg-card p-2.5 shadow-soft">
                  <img
                    src="/france-travail-logo.svg"
                    alt="France Travail"
                    className="max-h-9 max-w-full object-contain"
                  />
                </span>
                <div>
                  <p className="eyebrow">{eyebrow}</p>
                  <p className="mt-1 text-label-sm text-muted-foreground">
                    France Travail — ex-Pôle emploi
                  </p>
                </div>
              </div>

              <h1 className="max-w-2xl font-display text-headline-lg-mobile text-ink sm:text-display">
                {title}
              </h1>
              <p className="mt-4 max-w-xl text-body-md text-on-surface-variant">{description}</p>
            </div>

            {/* Carte opaque : elle se pose sur la partie visible de la photo. */}
            {aside && <div className="w-full lg:justify-self-end">{aside}</div>}
          </div>
        </section>

        {/* La bulle flottante passe au-dessus du contenu : on lui laisse la place. */}
        <div className="mt-8 pb-24">{children}</div>
      </div>
    </div>
  );
}
