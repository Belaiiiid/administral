import { cva } from 'class-variance-authority';

/**
 * Administral button classes — citizen area only. A `cva` helper rather than a
 * component so it can be spread onto `<button>`, `<Link>` and `<a>` alike,
 * which the citizen pages all need. The agent back-office keeps `components/ui/button`.
 */
export const citizenButton = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-white shadow-sm hover:opacity-90 active:scale-[0.98]',
        marianne: 'bg-marianne text-marianne-foreground shadow-sm hover:opacity-90',
        outline: 'border border-brand/40 bg-background text-ink hover:bg-brand-soft',
        ghost: 'text-muted-foreground hover:bg-surface hover:text-ink',
      },
      size: {
        sm: 'h-9 px-3 text-xs',
        md: 'h-11 px-5',
        icon: 'size-10 rounded-lg',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);
