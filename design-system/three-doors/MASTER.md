# Three Doors design system

Responsive Material 3-inspired visual system for the Three Doors job-search
outreach tracker. This is the shared source of truth for application UI. Use
semantic tokens rather than hard-coded colors, spacing, or radii.

## Product direction

- **Personality:** calm, capable, focused, and encouraging; professional enough
  for a job search without feeling like an enterprise CRM.
- **Framework:** Material 3 semantic color roles, tonal surfaces, clear component
  hierarchy, rounded shapes, visible interaction states, and responsive layouts.
- **Brand adaptation:** retain a confident blue as the primary brand hue, with
  green reserved for positive outcomes and progress. This is a web adaptation
  of Material 3 Expressive guidance, not an Android component port.
- **Typography:** Plus Jakarta Sans for interface and body copy; system monospace
  only for compact technical metadata. Use weight and hierarchy before adding
  decorative type.
- **Motion:** emphasized easing `cubic-bezier(.2, 0, 0, 1)`, normally 200ms;
  motion must be removed for `prefers-reduced-motion`.

## Color roles

Use the CSS custom properties in `app/globals.css`. Light and dark schemes map
the same semantic roles so components never need theme-specific color values.

| Role | Light | Use |
| --- | --- | --- |
| `--bg` | `#F7F9FF` | App canvas |
| `--card` | `#FFFFFF` | Main content surface |
| `--surface-low` | `#F1F3F9` | Navigation and low-emphasis containers |
| `--surface-high` | `#E6E9F0` | Hover/pressed states and raised containers |
| `--surface-highest` | `#E0E3EA` | Stronger tonal separation |
| `--primary` | `#005E8A` | Primary actions, links, focus ring |
| `--on-primary` | `#FFFFFF` | Text/icons on primary |
| `--primary-soft` | `#C9E6FF` | Selected and filled-tonal backgrounds |
| `--on-primary-soft` | `#001D31` | Content on primary-soft |
| `--secondary` | `#4F616E` | Secondary accents |
| `--accent` | `#386A20` | Positive actions and progress |
| `--danger` | `#BA1A1A` | Destructive actions and errors |
| `--warn` | `#785900` | Caution and due-state feedback |
| `--line` / `--border` | `#C2C7D0` / `#727780` | Dividers / component outlines |

Dark mode is provided by both the system preference and `data-theme="dark"`;
`data-theme="light"` opts out of the system dark preference. Keep semantic
foreground/background pairs together when adding or changing a role.

## Shape, spacing, and layout

- Shape tokens: `--r-sm` 8px, `--r` 12px, `--r-lg` 20px, `--r-xl` 28px,
  `--r-pill` 999px.
- Spacing follows a 4px base scale: `--s1` through `--s8` (4, 8, 12, 16, 24,
  32, 48, 64px).
- Interactive targets are at least 44px high. Compact icon controls may be
  40px only when their clickable area is expanded accessibly.
- Use flexible grids and allow content to reflow at 375, 768, 1024, and 1440px.
- Use tonal surface changes before adding shadows. Reserve strong elevation for
  overlays that need to sit above page content.

## Components

- **Buttons:** `.btn.primary` for the main action; `.btn.tonal` for a related
  action; `.btn.outlined` for lower emphasis; `.btn.text` for low-emphasis
  actions. Native `<button>` elements share the same styles. Keep labels clear.
- **Cards:** `.card` is an outlined content surface; `.card.elevated` and
  `.surface-container` provide tonal separation without heavy shadows.
- **Navigation:** `.tab` links use pill geometry; `.tab.on` indicates the active
  destination with the primary container role.
- **Chips:** `.chip` is for compact status or filter labels, not primary actions.
- **Forms:** use semantic labels, 44px minimum controls, clear focus indicators,
  and visible error text associated with the invalid field.
- **Feedback:** `.msg` and `.chip` variants `ok`, `warn`, `hot`, and `mute`
  communicate status using text as well as color.

## Interaction and accessibility

- Preserve keyboard operation and visible `:focus-visible` outlines on every
  interactive control. The focus ring uses `--ring`.
- Hover, active, selected, disabled, and error states must remain distinguishable
  in both color schemes; do not communicate status by color alone.
- Keep body text contrast at WCAG AA (4.5:1 for normal text); verify new color
  pairs rather than assuming a semantic role guarantees contrast.
- Provide accessible names for icon-only buttons, meaningful heading order,
  semantic landmarks, and a skip link.
- Respect reduced-motion preferences and do not use motion as the only state cue.
- Check keyboard navigation and narrow layouts at 375px before shipping UI.

## Implementation

Global tokens and component primitives live in `app/globals.css`, with the root
document theme colors in `app/layout.tsx`. Prefer these shared primitives when
building pages; add a new semantic token here and in CSS before using it in a
page-specific style. Keep UI work in Server Components unless interaction
requires a Client Component.
