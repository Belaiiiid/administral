import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/**
 * Design tokens extracted from /design-preference (système « République Assistée »).
 * See docs/design-analysis.md §3 — the token values are the source of truth.
 *
 * Colors are wired to CSS variables declared in src/index.css so that the
 * accessibility preferences (high contrast, etc.) can override them at runtime
 * without rebuilding the utility classes.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--on-primary)',
          container: 'var(--primary-container)',
          fixed: 'var(--primary-fixed)',
          'fixed-dim': 'var(--primary-fixed-dim)',
          'on-fixed': 'var(--on-primary-fixed)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--on-secondary)',
          fixed: 'var(--secondary-fixed)',
          'fixed-dim': 'var(--secondary-fixed-dim)',
          'on-fixed': 'var(--on-secondary-fixed)',
        },
        // AI accent — the #003593 / #f0f4ff pairing used by recommendation cards
        ai: {
          DEFAULT: 'var(--accent-ai)',
          surface: 'var(--accent-ai-surface)',
        },

        // Surfaces (tonal layering)
        background: 'var(--background)',
        surface: {
          DEFAULT: 'var(--surface)',
          lowest: 'var(--surface-container-lowest)',
          low: 'var(--surface-container-low)',
          container: 'var(--surface-container)',
          high: 'var(--surface-container-high)',
          highest: 'var(--surface-container-highest)',
          inverse: 'var(--inverse-surface)',
        },

        // Text
        'on-surface': {
          DEFAULT: 'var(--on-surface)',
          variant: 'var(--on-surface-variant)',
        },
        muted: {
          DEFAULT: 'var(--surface-container-low)',
          foreground: 'var(--text-muted)',
        },

        // Borders
        border: {
          DEFAULT: 'var(--border-subtle)',
          strong: 'var(--outline-variant)',
        },
        outline: {
          DEFAULT: 'var(--outline)',
          variant: 'var(--outline-variant)',
        },
        ring: 'var(--primary)',

        // Status
        success: {
          DEFAULT: 'var(--success)',
          surface: 'var(--success-surface)',
          foreground: 'var(--on-success)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          surface: 'var(--warning-surface)',
          foreground: 'var(--on-warning)',
        },
        destructive: {
          DEFAULT: 'var(--error)',
          surface: 'var(--error-surface)',
          foreground: 'var(--on-error)',
          strong: 'var(--status-error)',
        },

        // République Française identity (tricolore)
        rf: {
          blue: '#000091',
          white: '#ffffff',
          red: '#e1000f',
        },

        // Administral design system — citizen-facing interfaces only (scoped
        // under `.citizen-scope`, see src/index.css). New tokens, so they are
        // safe to declare globally: nothing outside that scope ever uses them.
        brand: {
          DEFAULT: 'var(--admtl-brand)',
          soft: 'var(--admtl-brand-soft)',
        },
        marianne: {
          DEFAULT: 'var(--admtl-marianne)',
          foreground: 'var(--admtl-marianne-foreground)',
        },
        ink: 'var(--admtl-ink)',
        foreground: 'var(--admtl-foreground)',
        card: {
          DEFAULT: 'var(--admtl-card)',
          foreground: 'var(--admtl-card-foreground)',
          // Translucide — pour une carte posée sur une photo. Voir index.css.
          veil: 'var(--admtl-card-veil)',
        },
        'chart-2': 'var(--admtl-chart-2)',
        'chart-3': 'var(--admtl-chart-3)',

        // Third-party brand identity — see `--brand-whatsapp` in index.css.
        whatsapp: 'var(--brand-whatsapp)',
      },

      fontFamily: {
        // Both driven by CSS variables so `.citizen-scope` (src/index.css) can
        // swap in DM Sans / Plus Jakarta Sans for the Administral redesign
        // without touching `font-sans` / `font-display` anywhere else.
        sans: ['var(--font-sans)', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['var(--font-display)', 'Manrope', 'Inter', 'system-ui', 'sans-serif'],
      },

      // Typographic scale from DESIGN.md — size / line-height / weight / tracking
      fontSize: {
        display: ['36px', { lineHeight: '44px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': [
          '28px',
          { lineHeight: '36px', letterSpacing: '-0.01em', fontWeight: '600' },
        ],
        'headline-lg-mobile': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'headline-md': ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-md': ['14px', { lineHeight: '20px', letterSpacing: '0.01em', fontWeight: '600' }],
        'label-sm': ['12px', { lineHeight: '16px', fontWeight: '500' }],
      },

      // 8px base grid
      spacing: {
        gutter: '24px',
        'margin-mobile': '16px',
        'margin-desktop': '32px',
        sidebar: '256px',
        header: '64px',
      },

      maxWidth: {
        container: '1200px',
        form: '800px',
        prose: '720px',
      },

      screens: {
        /*
         * Height-based, not width-based: `short:` compacts a layout that must
         * fit the viewport without scrolling (the sign-in card) on a laptop or
         * a browser with a lot of chrome. Everything it touches only loses
         * whitespace, never content — a citizen who zooms in still gets a
         * scrollbar rather than a clipped form.
         */
        short: { raw: '(max-height: 820px)' },
        /* Second tier for a 1366×768 laptop, where browser chrome and the
         * taskbar leave roughly 600px. Declared after `short` so its rules are
         * emitted later and win where both apply. */
        shorter: { raw: '(max-height: 680px)' },
      },

      borderRadius: {
        // Named explicitly to resolve the DESIGN.md / tailwind-config ambiguity.
        //
        // Variable-driven so a scope can retune the whole scale at once — the
        // agent back-office squares everything off (`.agent-scope`, index.css).
        // Fallbacks are the charter values (§6.1), so every other area is
        // unaffected. `rounded-full` is Tailwind's own and stays round.
        sm: 'var(--radius-sm, 4px)', // checkboxes, tags
        DEFAULT: 'var(--radius-md, 8px)', // buttons, inputs
        md: 'var(--radius-md, 8px)',
        lg: 'var(--radius-lg, 8px)',
        xl: 'var(--radius-xl, 12px)', // cards
        '2xl': 'var(--radius-2xl, 16px)', // large outer containers
      },

      boxShadow: {
        // The single soft technical shadow — no other elevation exists.
        soft: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'soft-hover': '0 4px 12px rgb(0 0 0 / 0.05)',
      },

      transitionTimingFunction: {
        standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },

      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        // Sweeping bar used by the landing "Génération en cours…" panel.
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(300%)' },
        },
        /*
         * Continuous horizontal ticker. The track renders its items twice, so
         * translating by exactly -50% lands on the start of the second copy —
         * which is pixel-identical to the start of the first, hence seamless.
         */
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        'accordion-up': 'accordion-up 200ms cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [animate],
};

export default config;
