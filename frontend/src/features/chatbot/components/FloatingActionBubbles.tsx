import { useLocation } from 'react-router-dom';

import { APP_CONFIG } from '@/app/config/app';
import { ROUTES } from '@/app/router/paths';
import { useChatbotUiStore } from '@/features/chatbot/store/chatbotUiStore';
import { cn } from '@/lib/utils';

interface BubbleButtonProps {
  id?: string;
  label: string;
  iconSrc: string;
  onClick: () => void;
  className?: string;
}

function BubbleButton({ id, label, iconSrc, onClick, className }: BubbleButtonProps) {
  return (
    <div className="group relative flex items-center">
      <button
        id={id}
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          'flex size-14 items-center justify-center rounded-full shadow-lg ring-1 ring-black/5 transition-transform duration-200 ease-out hover:scale-125 focus-visible:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
          className,
        )}
      >
        <img src={iconSrc} alt="" aria-hidden="true" className="size-7 object-contain" />
      </button>

      {/* Visual-only role hint: it repeats the button's `aria-label`, so it is
          hidden from assistive tech rather than announced twice. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-md transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </div>
  );
}

/**
 * Two floating bubbles, bottom-left, on every citizen page — WhatsApp
 * (redirects to the real bot number) and Mistral (opens the assistant panel,
 * `FloatingChatbot`, via the same `chatbotUiStore` it already toggles from
 * its own launcher).
 *
 * Hidden on the chatbot page itself (`/chat` — already *is* the assistant)
 * and while the assistant panel is open (its own header close button takes
 * over, and the bubbles would sit right behind the panel).
 */
export function FloatingActionBubbles({
  offsetForSidebar = false,
  onAssistantClick,
  hidden = false,
}: {
  /** True in a shell that fixes a 256px nav rail to the left on `lg+` (see
   * `w-sidebar`) — shifts the bubbles clear of it instead of sitting on top
   * of its own bottom links (profile, sign out). */
  offsetForSidebar?: boolean;
  /**
   * Replaces the default action of the Mistral bubble (toggling
   * `FloatingChatbot`). The public landing page has no floating panel — it
   * embeds its own assistant — so it starts that one instead.
   */
  onAssistantClick?: () => void;
  /** Force-hides the bubbles, for a host that opens its own assistant inline. */
  hidden?: boolean;
}) {
  const isOpen = useChatbotUiStore((state) => state.isOpen);
  const toggle = useChatbotUiStore((state) => state.toggle);
  const location = useLocation();

  if (hidden || isOpen || location.pathname === ROUTES.chat) return null;

  return (
    <div
      className={cn(
        'fixed bottom-5 left-5 z-40 flex flex-col gap-3',
        offsetForSidebar && 'lg:left-[calc(theme(spacing.sidebar)+1.25rem)]',
      )}
    >
      <BubbleButton
        label="Discuter sur WhatsApp"
        iconSrc="/whatsapp-logo.svg"
        onClick={() => window.open(APP_CONFIG.whatsappBotUrl, '_blank', 'noopener,noreferrer')}
        className="bg-[#25D366]"
      />
      <BubbleButton
        id="assistant-launcher-bubble"
        label="Parler à l’assistant"
        iconSrc="/mistral-logo.svg"
        onClick={onAssistantClick ?? toggle}
        className="border border-border/60 bg-white"
      />
    </div>
  );
}
