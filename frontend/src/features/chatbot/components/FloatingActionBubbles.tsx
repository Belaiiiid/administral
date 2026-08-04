import { useEffect, useState, type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';

import { APP_CONFIG } from '@/app/config/app';
import { ROUTES } from '@/app/router/paths';
import { useChatbotUiStore } from '@/features/chatbot/store/chatbotUiStore';
import { cn } from '@/lib/utils';

interface BubbleSpec {
  id?: string;
  label: string;
  iconSrc: string;
  onClick: () => void;
  className?: string;
}

/**
 * True for mouse / trackpad only.
 *
 * The orbit's only pause mechanism is hover, and touch screens have no
 * hover — there, both CTAs would be permanently moving targets with no way
 * to stop them (WCAG 2.2.2). Coarse pointers keep the static stack.
 */
function useFinePointer() {
  const query = '(hover: hover) and (pointer: fine)';
  const [isFine, setIsFine] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setIsFine(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isFine;
}

function BubbleButton({
  id,
  label,
  iconSrc,
  onClick,
  className,
  tooltip = 'left',
}: BubbleSpec & { tooltip?: 'left' | 'above' }) {
  return (
    <div className="group relative flex items-center">
      <button
        id={id}
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          'flex size-14 items-center justify-center rounded-full shadow-soft ring-1 ring-black/5 transition-transform duration-200 ease-out hover:scale-125 focus-visible:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
          className,
        )}
      >
        <img src={iconSrc} alt="" aria-hidden="true" className="size-7 object-contain" />
      </button>

      {/* Visual-only role hint: it repeats the button's `aria-label`, so it is
          hidden from assistive tech rather than announced twice. */}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute whitespace-nowrap rounded-md bg-ink px-3 py-1.5 text-label-sm text-white opacity-0 shadow-soft transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100',
          // La pile vit dans le coin bas-droit : l'étiquette part vers la
          // gauche, sinon elle sort du viewport. En orbite (coin bas-gauche)
          // elle reste au-dessus, cf. commentaire d'`OrbitBubbles`.
          tooltip === 'left' ? 'right-full mr-3' : 'bottom-full left-0 mb-3',
        )}
      >
        {label}
      </span>
    </div>
  );
}

/**
 * The bubbles in orbit — see `.orbit-*` in src/index.css for the 3D chain
 * and the hover pause. The ellipse's long axis is vertical, so the travel
 * reads top-to-bottom. Landing page only, mouse-only (`useFinePointer`).
 */
function OrbitBubbles({ bubbles }: { bubbles: BubbleSpec[] }) {
  return (
    // `pointer-events-none` so the orbit's empty area never swallows a click
    // meant for the page behind it; only the bubbles themselves take pointer
    // events back (`:hover` still reaches this element through them).
    <div className="orbit-system pointer-events-none fixed bottom-4 left-4 z-40 h-[200px] w-[130px]">
      <div className="orbit-plane">
        {bubbles.map((bubble, index) => (
          <div
            key={bubble.label}
            className="orbit-slot"
            // +90° so a stopped orbit (reduced motion) leaves the bubbles at
            // the top and bottom of the ellipse. At 0° they would sit at its
            // narrow sides — barely 58px apart — and overlap.
            style={
              { '--slot-angle': `${90 + (360 / bubbles.length) * index}deg` } as CSSProperties
            }
          >
            <div className="orbit-despin">
              <div className="orbit-face pointer-events-auto">
                <BubbleButton {...bubble} tooltip="above" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * How far to raise the stacked bubbles so they rest on top of the footer
 * instead of covering it.
 *
 * The alternative — reserving a permanent ~144px band at the bottom of the
 * footer — made the footer a third taller on every page for a collision that
 * only happens once the page is scrolled to the very end.
 */
function useFooterLift(): number {
  const [lift, setLift] = useState(0);
  const { pathname } = useLocation();

  useEffect(() => {
    const footer = document.querySelector('footer');
    if (!footer) {
      setLift(0);
      return;
    }

    const update = () => {
      const visibleFooter = window.innerHeight - footer.getBoundingClientRect().top;
      // Never push them past the top of the viewport on a short screen.
      const ceiling = Math.max(0, window.innerHeight - 200);
      setLift(Math.min(Math.max(0, visibleFooter), ceiling));
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const observer = new ResizeObserver(update);
    observer.observe(document.body);

    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      observer.disconnect();
    };
  }, [pathname]);

  return lift;
}

/**
 * Vrai pendant qu'on fait défiler la page, faux ~700 ms après le dernier
 * événement de scroll.
 *
 * Les deux bulles sont fixes : posées sur le contenu, elles masquent en
 * permanence le coin bas-droit — exactement la zone qu'on lit en faisant
 * défiler. Plutôt que de les rendre plus petites (elles deviendraient une cible
 * tactile hors norme) ou de les cacher pour de bon, on les efface pendant le
 * geste et on les ramène dès qu'il s'arrête : elles ne gênent pas la lecture en
 * mouvement et restent joignables à l'arrêt.
 */
function useIsScrolling(delay = 700): boolean {
  const [isScrolling, setIsScrolling] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const onScroll = () => {
      setIsScrolling(true);
      clearTimeout(timer);
      timer = setTimeout(() => setIsScrolling(false), delay);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(timer);
    };
  }, [delay]);

  return isScrolling;
}

/**
 * Two floating bubbles, bottom-right, on every citizen page — WhatsApp
 * (redirects to the real bot number) and Mistral (opens the assistant panel,
 * `FloatingChatbot`, via the same `chatbotUiStore` it already toggles from
 * its own launcher).
 *
 * Hidden on the chatbot page itself (`/chat` — already *is* the assistant)
 * and while the assistant panel is open (its own header close button takes
 * over, and the bubbles would sit right behind the panel).
 */
export function FloatingActionBubbles({
  onAssistantClick,
  hidden = false,
  orbit = false,
}: {
  /**
   * Replaces the default action of the Mistral bubble (toggling
   * `FloatingChatbot`). The public landing page has no floating panel — it
   * embeds its own assistant — so it starts that one instead.
   */
  onAssistantClick?: () => void;
  /** Force-hides the bubbles, for a host that opens its own assistant inline. */
  hidden?: boolean;
  /**
   * Sets the bubbles orbiting a central core instead of stacking them. Opted
   * into by the public landing page only: it is a showcase surface, whereas
   * the pages behind it are where a citizen is filling in a real dossier and
   * peripheral motion is just noise. Ignored on touch (see `useFinePointer`).
   */
  orbit?: boolean;
}) {
  const isOpen = useChatbotUiStore((state) => state.isOpen);
  const toggle = useChatbotUiStore((state) => state.toggle);
  const location = useLocation();
  const isFinePointer = useFinePointer();
  // Called before any early return — hook order must stay stable across renders.
  const lift = useFooterLift();
  const isScrolling = useIsScrolling();
  // Le survol et le focus l'emportent sur le retrait : une bulle qu'on vise à
  // la souris ou qu'on atteint au clavier ne doit pas se dérober.
  const [isEngaged, setIsEngaged] = useState(false);

  if (hidden || isOpen || location.pathname === ROUTES.chat) return null;

  const bubbles: BubbleSpec[] = [
    {
      label: 'Discuter sur WhatsApp',
      iconSrc: '/whatsapp-logo.svg',
      onClick: () => window.open(APP_CONFIG.whatsappBotUrl, '_blank', 'noopener,noreferrer'),
      className: 'bg-whatsapp',
    },
    {
      id: 'assistant-launcher-bubble',
      label: 'Parler à l’assistant',
      iconSrc: '/mistral-logo.svg',
      onClick: onAssistantClick ?? toggle,
      className: 'border border-border/60 bg-surface-lowest',
    },
  ];

  if (orbit && isFinePointer) {
    return <OrbitBubbles bubbles={bubbles} />;
  }

  // Retrait pendant le défilement : les bulles glissent vers la droite en
  // laissant dépasser une amorce (assez pour rester visibles et cliquables) et
  // s'estompent, puis reviennent quand le geste s'arrête. Combiné au
  // relèvement au-dessus du pied de page, tout tient dans une seule
  // `transform` — deux règles concurrentes s'écraseraient l'une l'autre.
  const retreat = isScrolling && !isEngaged;

  return (
    <div
      style={{ transform: `translate(${retreat ? '60%' : '0'}, -${lift}px)` }}
      onMouseEnter={() => setIsEngaged(true)}
      onMouseLeave={() => setIsEngaged(false)}
      onFocusCapture={() => setIsEngaged(true)}
      onBlurCapture={() => setIsEngaged(false)}
      className={cn(
        'fixed bottom-5 right-5 z-40 flex flex-col gap-3 transition-all duration-300 ease-out',
        retreat && 'opacity-50',
      )}
    >
      {bubbles.map((bubble) => (
        <BubbleButton key={bubble.label} {...bubble} />
      ))}
    </div>
  );
}
