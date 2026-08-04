import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface RevealProps {
  children: ReactNode;
  /** Staggers siblings — 80ms apart reads as a sequence, not a glitch. */
  delayMs?: number;
  /** Direction the block travels in from. */
  from?: 'bottom' | 'left' | 'right';
  className?: string;
}

const HIDDEN_OFFSET: Record<NonNullable<RevealProps['from']>, string> = {
  bottom: 'translate-y-8',
  left: '-translate-x-8',
  right: 'translate-x-8',
};

/**
 * Fades a block in the first time it is scrolled into view.
 *
 * Starts visible and only hides itself once the observer is actually wired up,
 * so a browser without `IntersectionObserver` — or a crash before the effect
 * runs — shows the content rather than a blank page. Motion is handled by
 * Tailwind transitions, which the global `prefers-reduced-motion` rule in
 * `src/index.css` already neutralises for citizens who ask for less movement.
 */
export function Reveal({ children, delayMs = 0, from = 'bottom', className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(true);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;

    // Already on screen at mount (above the fold): leave it visible.
    if (node.getBoundingClientRect().top < window.innerHeight) {
      setArmed(true);
      return;
    }

    setArmed(true);
    setShown(false);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: shown ? `${delayMs}ms` : '0ms' }}
      className={cn(
        armed && 'transition-all duration-700 ease-out',
        shown ? 'translate-x-0 translate-y-0 opacity-100' : `opacity-0 ${HIDDEN_OFFSET[from]}`,
        className,
      )}
    >
      {children}
    </div>
  );
}
