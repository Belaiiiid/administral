---
name: République Assistée
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f4'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#45464f'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f0f1f1'
  outline: '#757680'
  outline-variant: '#c5c6d0'
  surface-tint: '#3559b6'
  primary: '#000929'
  on-primary: '#ffffff'
  primary-container: '#001d59'
  on-primary-container: '#6485e5'
  inverse-primary: '#b4c5ff'
  secondary: '#a1385f'
  on-secondary: '#ffffff'
  secondary-container: '#fd81a9'
  on-secondary-container: '#76153e'
  tertiary: '#050c18'
  on-tertiary: '#ffffff'
  tertiary-container: '#1b222f'
  on-tertiary-container: '#828999'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#15409d'
  secondary-fixed: '#ffd9e1'
  secondary-fixed-dim: '#ffb1c6'
  on-secondary-fixed: '#3f001c'
  on-secondary-fixed-variant: '#821f47'
  tertiary-fixed: '#dbe2f4'
  tertiary-fixed-dim: '#bfc6d8'
  on-tertiary-fixed: '#141c28'
  on-tertiary-fixed-variant: '#404755'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
typography:
  display:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  mono:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1200px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style

The design system is engineered for the French public sector, specifically for AI-powered administrative assistance. It bridges the gap between traditional government authority and modern efficiency. The aesthetic is **Corporate Modern**, drawing heavily from the structured precision of Linear and the clarity of Stripe.

The design narrative focuses on **Minimal Cognitive Load**. In the context of housing benefits (APL), users are often in stressful situations; the UI must act as a calming, reliable guide. The style avoids all decorative flourishes—no gradients, no blurs, and no unnecessary motion. Instead, it relies on mathematical precision, generous whitespace, and a high-contrast typographic hierarchy to communicate trustworthiness and accessibility.

## Colors

The palette is rooted in a deep Navy and Royal Blue to evoke the institutional stability of French government services, now updated with a more vibrant primary blue and sophisticated secondary accents.

- **Primary:** Deep Royal Blue (#003593) used for main actions, active states, and brand presence.
- **Secondary:** A muted rose-magenta (#D46087) reserved for specific institutional accents and highlighting key information.
- **Tertiary:** A soft periwinkle-grey (#DCE3F5) used for subtle containment and background layering.
- **Backgrounds:** A pure white (#FFFFFF) base provides a clean, clinical starting point, ensuring maximum clarity for interactive cards and input surfaces.
- **Text:** High-contrast charcoal (#091F4E) ensures WCAG AAA compliance for readability, while muted text (#64748B) handles secondary metadata.

## Typography

This design system uses **Inter** exclusively to ensure maximum legibility across all digital interfaces. The scale is built on a tight melodic progression to maintain an enterprise-grade feel.

- **Headlines:** Use tighter letter-spacing and heavier weights to anchor sections.
- **Body:** Optimized for long-form reading of administrative text.
- **Labels:** Used for form headers, button text, and small metadata. 
- **Mobile scaling:** Headlines automatically downscale at the 768px breakpoint to prevent awkward line breaks in narrow viewports.

## Layout & Spacing

The layout utilizes a **Fixed Grid** model for desktop to maintain readability of dense information, switching to a fluid model for mobile devices.

- **The 8px Rule:** All margins, paddings, and component heights must be multiples of 8px.
- **Grid:** A 12-column grid is used for dashboards, while a centered 8-column layout (max 800px) is preferred for step-by-step application forms to keep the user focused.
- **Safe Areas:** Interactive elements must maintain a minimum 44px tap target height, even if their visual footprint is smaller.

## Elevation & Depth

This design system rejects physical metaphors in favor of **Tonal Layering** and **Soft Technical Shadows**.

- **Depth Level 0 (Background):** #FFFFFF. The clean slate canvas.
- **Depth Level 1 (Cards/Surface):** White surfaces with a subtle 1px #DCE3F5 border. This is the primary interactive layer.
- **Shadows:** Use a single, soft shadow style: `0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)`. Shadows provide just enough separation from the background to define the object's perimeter without suggesting floating.
- **Active States:** Elements may lift slightly on hover (increased shadow spread) but must never use inner shadows or glows.

## Shapes

The shape language is strictly defined by a **8px (0.5rem) default corner radius** for all primary containers and buttons. This "Rounded" setting strikes a balance between the approachable nature of a personal assistant and the professional structure of a government tool.

- **Small elements (Checkboxes/Tags):** Use a 4px (0.25rem) radius.
- **Standard elements (Buttons/Inputs/Cards):** Use an 8px (0.5rem) radius.
- **Large containers:** Maintain a 16px (1rem) radius for major outer containers.

## Components

### Buttons & Inputs
- **Primary Button:** Solid #003593 with white text. 8px radius. High-contrast hover state (darken 10%).
- **Inputs:** White background, 1px border using #DCE3F5. On focus, the border changes to #003593 with a 2px outer ring at 20% opacity.

### AI Recommendation Cards
- Styled with a subtle #003593 left-accent border (4px width). 
- Use the Tertiary light blue tint (#DCE3F5) for the background to distinguish AI suggestions from standard user-generated content.
- Include "Is this helpful?" feedback buttons (thumbs up/down) in the footer.

### Chat & Messaging
- **User Bubbles:** White background with #DCE3F5 border.
- **AI Bubbles:** Subtle grey background (#F1F3F5) to denote "system" or "assistant" identity.
- Use Lucide icons for all message actions (copy, regenerate, info).

### Progress & Timelines
- **Application Steps:** Horizontal stepper for desktop, vertical for mobile.
- **Status Indicators:** Use semantic colors—Success (Green), Error (Red), and the Royal Blue (#003593) for 'In Progress'. 

### Data & Widgets
- **Tables:** No vertical borders. Use 1px #DCE3F5 horizontal dividers.
- **Dashboard Widgets:** White cards with 8px radius and "Soft" shadow. Headlines should be `label-sm` in all caps for a technical, organized appearance.

### Upload Components
- Large "Dropzone" areas with dashed 2px borders in #DCE3F5. 
- Active "drag-over" state changes border color to #003593 and adds a subtle blue background tint.