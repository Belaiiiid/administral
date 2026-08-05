import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

import { APP_CONFIG, FOOTER_LINKS } from '@/app/config/app';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/store/sessionStore';

const ADMIN_REFS = [
  { title: 'CAF', domain: 'caf.fr', href: 'https://www.caf.fr', logo: '/caf-logo.svg' },
  { title: 'France Travail', domain: 'francetravail.fr', href: 'https://www.francetravail.fr', logo: '/france-travail-logo.svg' },
  { title: 'Assurance Maladie', domain: 'ameli.fr', href: 'https://www.ameli.fr', logo: '/assurance-maladie-logo.svg' },
  { title: 'Impôts', domain: 'impots.gouv.fr', href: 'https://www.impots.gouv.fr', logo: '/impots.jpg' },
];

/**
 * Le bleu du fond (`/background.png`), relevé sur l'image elle-même.
 *
 * Le panneau le porte aussi en couleur pleine : là où l'image est rognée ou
 * pas encore chargée, la bordure et les anneaux de focus gardent leur contraste
 * au lieu de sauter d'une teinte à l'autre.
 */
const PANEL_BLUE = '#032564';

/** Le drapeau, en trois filets — repris dans la barre légale. */
function FlagAccent({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex overflow-hidden rounded-[2px]', className)} aria-hidden="true">
      <span className="h-full w-1/3 bg-[#0055A4]" />
      <span className="h-full w-1/3 bg-white" />
      <span className="h-full w-1/3 bg-[#EF4135]" />
    </span>
  );
}

/**
 * Le pied de page de l'espace citoyen et de la page d'accueil publique : un
 * seul panneau bleu roi arrondi, posé sur la page plutôt que collé bord à bord.
 *
 * La ligne d'horizon parisienne vient de l'image de fond, ancrée en bas et
 * recadrée par la largeur : elle court donc sous les deux colonnes sans jamais
 * leur prendre de hauteur. Le contenu tient en deux colonnes — la marque à
 * gauche, les administrations de référence à droite — puis la barre légale.
 *
 * Réservé aux visiteurs non connectés. Une fois la session ouverte le bandeau
 * disparaît : l'espace authentifié est un plan de travail, la rangée de liens
 * partenaires et la barre légale n'y sont que du décor.
 *
 * Filtré ici plutôt qu'aux deux points de montage (`CitizenAppShell`,
 * `PublicLandingPage`), pour que la règle tienne partout où le pied sera repris.
 *
 * ⚠️ Cela retire aussi le seul lien vers « Mentions légales », la déclaration
 * d'accessibilité, « Données personnelles » et « Gestion des cookies » pour un
 * citoyen connecté — les quatre sont obligatoires sur un service public
 * français, tout comme la mention IA (Règlement (UE) 2024/1689, art. 50)
 * placée à côté. Les pages restent accessibles à leurs adresses, mais plus rien
 * dans l'interface connectée n'y mène ; il leur faut un point d'entrée ailleurs
 * (réglages, ou un lien discret dans la coque).
 */
export function CitizenFooter({ className }: { className?: string }) {
  const user = useSessionStore((state) => state.user);

  if (user) return null;

  return (
    <footer className={cn('text-white', className)}>
      <div
        className="relative w-full overflow-hidden bg-bottom bg-no-repeat"
        style={{
          backgroundColor: PANEL_BLUE,
          backgroundImage: 'url(/background.png)',
          // `100% auto` plutôt que `cover` : l'image garde ses proportions et
          // s'étale sur la largeur. `cover` la faisait grossir jusqu'à remplir
          // la hauteur, et la ligne d'horizon arrivait démesurée. Ancrée en
          // bas, seule sa partie haute — un aplat bleu — est rognée.
          backgroundSize: '100% auto',
        }}
      >
        {/* Filet tricolore : la seule ligne de couleur du panneau. */}
        <div className="flex h-1 w-full" aria-hidden="true">
          <span className="h-full flex-1 bg-[#0055A4]" />
          <span className="h-full flex-1 bg-white" />
          <span className="h-full flex-1 bg-[#EF4135]" />
        </div>

        <div className="relative z-10 mx-auto grid max-w-7xl gap-8 px-6 py-12 lg:grid-cols-[minmax(0,25%)_minmax(0,75%)] lg:gap-12">
          {/* ── Marque ─────────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Le logo est dessiné sur blanc, comme les logos des
                administrations ci-contre : même pastille claire, même rayon —
                la marque et ses partenaires se posent de la même façon. */}
            <span className="inline-flex rounded-2xl bg-white p-3">
              <img
                src="/administral-mark.png"
                alt="Ad'Ministral"
                className="h-14 w-auto object-contain"
              />
            </span>

            <p className="max-w-xs text-sm leading-relaxed text-white/75">
              Toutes vos démarches administratives au même endroit, sans chercher
              le bon guichet.
            </p>

            {/* Mention de transparence IA — Règlement (UE) 2024/1689, art. 50.
                Posée sous la promesse de marque : l'assistant est annoncé là où
                le service se présente, pas noyé dans la barre légale. */}
            <img
              src="https://digital-strategy.ec.europa.eu/sites/default/files/2026-06/AI%20LABELS_3x2_AI%20GENERATED_black.png?destination=/media/10207/edit"
              alt="Contenu généré par l'IA — icône officielle de l'UE"
              className="h-9 w-auto rounded-md bg-white px-1.5 py-0.5"
              loading="lazy"
            />
          </div>

          {/* ── Références ─────────────────────────────────────────────── */}
          <div className="lg:border-l lg:border-white/15 lg:pl-12">
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/75">
              <span aria-hidden="true">🏛️</span>
              Références administratives
            </h2>

            <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {ADMIN_REFS.map((ref) => (
                <li key={ref.title}>
                  <a
                    href={ref.href}
                    target="_blank"
                    rel="noreferrer"
                    style={{ ['--tw-ring-offset-color' as string]: PANEL_BLUE }}
                    className={cn(
                      'flex h-full items-center gap-3 rounded-2xl border border-white/15 bg-white/5 p-3 backdrop-blur-sm',
                      'transition-all duration-200 hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/10 hover:shadow-lg hover:shadow-black/20',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2',
                    )}
                  >
                    {/* Les logos officiels sont dessinés pour du papier blanc :
                        une pastille claire plutôt que le bleu du panneau. */}
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white">
                      <img src={ref.logo} alt="" aria-hidden="true" className="size-5 object-contain" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">
                        {ref.title}
                      </span>
                      <span className="block truncate text-xs text-white/75">{ref.domain}</span>
                    </span>
                    <ExternalLink className="size-4 shrink-0 text-white/75" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Barre légale ───────────────────────────────────────────────── */}
        <div className="relative z-10 border-t border-white/15">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-6 py-4 text-xs text-white/75 lg:flex-row lg:justify-between">
            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              <FlagAccent className="h-3 w-5" />
              <span>© {new Date().getFullYear()} {APP_CONFIG.administration}</span>
              <span aria-hidden="true" className="text-white/30">·</span>
              <span>Tous droits réservés</span>
            </p>

            <nav
              aria-label="Liens de pied de page"
              className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2"
            >
              {FOOTER_LINKS.map((link) => (
                <Link
                  key={link.id}
                  to={link.href}
                  style={{ ['--tw-ring-offset-color' as string]: PANEL_BLUE }}
                  className="rounded-sm transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
}
