import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { APP_CONFIG } from '@/app/config/app';
import { ROUTES } from '@/app/router/paths';
import administralLogo from '@/assets/administral-logo.png';
import { CitizenBackButton } from '@/components/citizen/CitizenBackButton';
import { PartnerLogos } from '@/components/layout/PartnerLogos';
import { SkipLink } from '@/components/layout/SkipLink';
import { cn } from '@/lib/utils';
import { VoicePageProvider } from '@/features/voice/context/VoicePageContext';
import { VoiceAssistantProvider } from '@/features/voice/components/VoiceAssistantProvider';

/**
 * Centred, chrome-free layout for the entry journey (login, registration).
 * Matches the login mockup: logo above a single ~520px card.
 * Voice providers are included so the assistant can help users fill in
 * their credentials (email only — password is masked and never read aloud).
 *
 * Connexion et inscription font exception : leur carte porte son propre en-tête
 * (marque, titre) pour coller au design de référence, donc l'en-tête de cette
 * coquille est sauté sur ces deux routes plutôt que doublé. Les autres pages
 * d'entrée — mot de passe oublié/réinitialisé, confirmation d'e-mail — sont
 * inchangées.
 */
export function AuthLayout() {
  const { pathname } = useLocation();
  const isLogin = pathname === ROUTES.login;
  const isRegister = pathname === ROUTES.register;
  /**
   * Connexion et inscription partagent la même carte : palette `.login-scope`,
   * bouton retour en pastille, en-tête porté par la carte, et le même verrou de
   * défilement.
   */
  const isSignCard = isLogin || isRegister;

  /*
   * Verrou de défilement demandé pour /login et /register : `html` et `body` à
   * 100vh, `overflow: hidden`. Posé en effet plutôt qu'en CSS global parce que
   * les deux éléments sont hors de l'arbre React — et retiré au démontage,
   * sinon toute page visitée ensuite hériterait du verrou.
   *
   * Contrepartie assumée : au-delà d'un certain zoom, ou sur une fenêtre très
   * basse, le bas de la carte est coupé sans moyen d'y accéder. Les variantes
   * `short:` / `shorter:` des deux cartes repoussent ce seuil en rognant les
   * blancs, jamais le contenu. Voir la note au commanditaire.
   */
  useEffect(() => {
    if (!isSignCard) return;
    const { documentElement: html, body } = document;
    const previous = {
      htmlHeight: html.style.height,
      htmlOverflow: html.style.overflow,
      bodyHeight: body.style.height,
      bodyOverflow: body.style.overflow,
    };

    html.style.height = '100vh';
    html.style.overflow = 'hidden';
    body.style.height = '100vh';
    body.style.overflow = 'hidden';

    return () => {
      html.style.height = previous.htmlHeight;
      html.style.overflow = previous.htmlOverflow;
      body.style.height = previous.bodyHeight;
      body.style.overflow = previous.bodyOverflow;
    };
  }, [isSignCard]);

  return (
    <VoicePageProvider>
      <VoiceAssistantProvider>
        {/* `relative` anchors the absolutely-positioned back button below. */}
        <div
          className={cn(
            'relative flex flex-col px-margin-mobile py-12',
            // Fond et palette communs aux deux écrans à carte.
            isSignCard ? 'login-scope bg-surface-low' : 'bg-background',
            // Connexion et inscription tiennent dans la fenêtre, sans défilement
            // possible : `h-screen` + `overflow-hidden`, en écho au verrou posé
            // sur `html`/`body` ci-dessus. Les autres pages d'entrée gardent
            // `min-h-screen` et défilent normalement.
            isSignCard ? 'h-screen overflow-hidden short:py-6 shorter:py-3' : 'min-h-screen',
          )}
        >
          <SkipLink />

          {/*
            Pinned to the page corner rather than stacked above the card: in the
            flow it pushed the whole centred entry journey down and read as part
            of it. Leaving here goes back to wherever they came from, or to the
            public landing page for someone who opened /login directly.
          */}
          {/* La pastille elle-même est portée par `CitizenBackButton` : il ne
              reste ici que le positionnement. `fixed` et non `absolute` sur les
              deux écrans à carte — le conteneur n'y défile plus, les deux se
              valent visuellement, mais `fixed` tient la promesse « 24px du bord
              de l'écran » quelle que soit la mise en page autour. */}
          {isSignCard ? (
            <CitizenBackButton fallbackTo={ROUTES.home} className="fixed left-6 top-6 z-20" />
          ) : (
            <CitizenBackButton
              fallbackTo={ROUTES.home}
              className="absolute left-4 top-6 md:left-8 md:top-8"
            />
          )}

          <div
            className={cn(
              'mx-auto flex w-full flex-1 flex-col justify-center',
              isSignCard ? 'max-w-[470px]' : 'max-w-[520px]',
            )}
          >
            {!isSignCard && (
              <div className="mb-8 flex flex-col items-center gap-3 text-center">
                <Link to={ROUTES.home} className="flex items-center gap-3 rounded-lg">
                  <img src={administralLogo} alt="Administral" className="h-14 w-14 shrink-0 object-contain" />
                  <span className="flex flex-col text-left leading-tight">
                    <span className="text-headline-md text-primary">ADMINISTRAL</span>
                    <span className="text-label-sm uppercase tracking-widest text-on-surface-variant">
                      Service Public
                    </span>
                  </span>
                </Link>
                <p className="text-body-md text-on-surface-variant">{APP_CONFIG.tagline}</p>
                <PartnerLogos className="gap-6" logoClassName="h-14" mistralMark="wordmark" />
              </div>
            )}

            <main id="main-content" tabIndex={-1} className="focus:outline-none">
              <Outlet />
            </main>
          </div>

          {/* Retirés de la connexion et de l'inscription : la fenêtre y est
              verrouillée, la carte doit tenir seule. Gardés sur les autres pages
              d'entrée — « Mentions légales » et la déclaration d'accessibilité
              sont obligatoires sur un service public français, elles restent
              joignables depuis là et depuis le pied de page de l'accueil. */}
          {!isSignCard && (
            <nav aria-label="Liens utiles" className="mt-8">
              <ul className="flex flex-wrap justify-center gap-6">
                <li>
                  <Link to="/accessibilite" className="text-body-sm text-on-surface-variant hover:underline">
                    Accessibilité
                  </Link>
                </li>
                <li>
                  <Link to="/mentions-legales" className="text-body-sm text-on-surface-variant hover:underline">
                    Mentions légales
                  </Link>
                </li>
                <li>
                  <Link to={ROUTES.chat} className="text-body-sm text-on-surface-variant hover:underline">
                    Besoin d'aide ?
                  </Link>
                </li>
              </ul>
            </nav>
          )}
        </div>
      </VoiceAssistantProvider>
    </VoicePageProvider>
  );
}
