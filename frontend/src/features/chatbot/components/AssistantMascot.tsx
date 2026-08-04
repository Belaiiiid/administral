import { cn } from '@/lib/utils';

/**
 * La mascotte de l'assistant — le chat pixelisé, à la place du pictogramme de
 * robot, partout où une réponse est attribuée à l'assistant.
 *
 * Une image et non un SVG en ligne : l'asset est une animation. Elle est posée
 * sur une surface claire (`bg-primary-fixed`), le dessin étant sombre — sur le
 * bleu profond qui portait l'icône vectorielle, il disparaîtrait.
 */
export function AssistantMascot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary-fixed',
        className,
      )}
    >
      <img src="/chat_bleu.gif" alt="" className="size-7 object-contain" />
    </span>
  );
}

/**
 * La même mascotte, sans sa pastille : pour les hôtes qui fournissent déjà le
 * cadre autour de l'icône (`EmptyState` et son cercle bordé).
 */
export function AssistantMascotGlyph({ className }: { className?: string }) {
  return <img src="/chat_bleu.gif" alt="" aria-hidden="true" className={cn('object-contain', className)} />;
}
