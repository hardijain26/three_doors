# Three Doors component library

This file defines the implementation boundary between the visual design system and product-specific UI.

## Layers

### 1. UI primitives — `components/ui`

Small, reusable components whose behavior is primarily visual and interaction-oriented.

Current primitives:

- `Button` — primary, tonal, outlined, text, accent, and danger variants.
- `Card` — outlined, elevated, and tight surface variants.
- `StatusChip` — default, positive, warning, hot, and muted status tones.

These components must use semantic CSS classes/tokens from `app/globals.css`. Do not add page-specific colors, spacing, radii, or shadows inside primitives.

### 2. Product components — `components/<domain>`

Components that encode Three Doors product concepts, for example:

- `components/roles/RoleCard`
- `components/roles/ApplicationStatus`
- `components/roles/DecisionTimeline`
- `components/people/PersonCard`
- `components/openings/OpeningCard`
- `components/career-path/CareerPath`

Product components may compose UI primitives but should not redefine primitive visual rules.

### 3. Screens — `app/<route>`

Routes own composition, data loading boundaries, URL state, and page-level layout. Screens should not contain large reusable visual implementations.

## Component contract

Every reusable component should define:

- semantic HTML where applicable
- keyboard behavior
- visible focus behavior
- disabled/loading/error states where relevant
- mobile behavior at 375px
- light/dark behavior through semantic tokens
- accessible names for icon-only actions
- a small, explicit prop surface

## State model

Product state should come from domain data rather than visual styling. For example, application state should be represented by application/decision events and mapped to a presentation tone by the product component.

Do not make database calls from `components/ui`.

## Token rule

If a component needs a visual value that is not already represented by the design system, add a semantic token to `app/globals.css` and document it in `MASTER.md` before using it.

Hard-coded hex colors, arbitrary spacing values, and one-off radii are not allowed in reusable UI components.
