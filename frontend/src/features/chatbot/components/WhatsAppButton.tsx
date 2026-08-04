import { useCallback, useRef, useState } from 'react';

import { APP_CONFIG } from '@/app/config/app';
import { cn } from '@/lib/utils';

const PREFILLED_MESSAGE = 'Bonjour, j’ai une question sur les APL.';
const BUTTON_SIZE = 56; // px — matches size-14
const DRAG_THRESHOLD = 6; // px of pointer travel before a press counts as a drag, not a click

/**
 * Click-to-chat launcher opening a real WhatsApp conversation with the
 * `apl-whatsapp` bot — a separate channel from `FloatingChatbot`, which stays
 * in-page.
 *
 * Draggable so it never permanently blocks page content it happens to land
 * on; position lives in component state only (resets on reload) rather than
 * persisting, since a stray placement should never survive a refresh.
 * `draggable={false}` turns off the browser's native link-drag (which would
 * otherwise fight the pointer-based dragging here); `onClick` cancels
 * navigation when the press moved past the threshold, so a drag never also
 * opens WhatsApp.
 */
export function WhatsAppButton() {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const didDrag = useRef(false);

  const clamp = useCallback((top: number, left: number) => {
    const maxTop = window.innerHeight - BUTTON_SIZE;
    const maxLeft = window.innerWidth - BUTTON_SIZE;
    return {
      top: Math.min(Math.max(top, 0), maxTop),
      left: Math.min(Math.max(left, 0), maxLeft),
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLAnchorElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    dragOffset.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    dragStart.current = { x: event.clientX, y: event.clientY };
    didDrag.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLAnchorElement>) => {
    if (!dragOffset.current || !dragStart.current) return;
    const traveled = Math.hypot(
      event.clientX - dragStart.current.x,
      event.clientY - dragStart.current.y,
    );
    if (traveled > DRAG_THRESHOLD) didDrag.current = true;
    if (!didDrag.current) return;
    setPosition(clamp(event.clientY - dragOffset.current.y, event.clientX - dragOffset.current.x));
  };

  const handlePointerUp = () => {
    dragOffset.current = null;
    dragStart.current = null;
  };

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (didDrag.current) {
      event.preventDefault();
      didDrag.current = false;
    }
  };

  const href = `https://wa.me/${APP_CONFIG.whatsappNumber}?text=${encodeURIComponent(PREFILLED_MESSAGE)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      draggable={false}
      aria-label="Discuter sur WhatsApp"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      style={position ? { top: position.top, left: position.left } : undefined}
      className={cn(
        'fixed z-40 flex size-14 cursor-grab touch-none items-center justify-center rounded-full bg-whatsapp text-white shadow-soft transition-transform hover:scale-105 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-whatsapp focus-visible:ring-offset-2',
        !position && 'bottom-5 left-5',
      )}
    >
      <span
        aria-hidden="true"
        className="motion-safe:animate-ping absolute inset-0 rounded-full bg-whatsapp opacity-75"
      />
      <svg viewBox="0 0 24 24" aria-hidden="true" className="relative size-7" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.36.101 11.943c0 2.105.549 4.161 1.595 5.976L0 24l6.335-1.652a11.882 11.882 0 0 0 5.71 1.447h.006c6.582 0 11.94-5.359 11.943-11.943a11.87 11.87 0 0 0-3.474-8.403" />
      </svg>
    </a>
  );
}
