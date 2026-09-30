# Three Doors application architecture

## Goal

Keep the job-seeker decision system maintainable as the product expands across Openings, Roles, People, Career Path, applications, outreach, and decision history.

## Boundaries

```text
app/                    Routes, screen composition, server/client boundaries
components/ui/          Reusable visual primitives
components/<domain>/    Product components for one domain
lib/domain/             Product rules and domain types
lib/data/               Supabase queries and persistence adapters
lib/client/             Browser-only client utilities
lib/supabase/            Supabase client/server setup
supabase/               Database migrations and SQL
 design-system/          Visual and component source of truth
```

## Dependency direction

```text
app screens
   ↓
product components
   ↓
UI primitives

app / server actions
   ↓
lib/domain
   ↓
lib/data
   ↓
Supabase
```

UI components must not import Supabase clients or database queries. Data access must not depend on page components.

## Domain-first product model

The product is event-aware. Application actions such as starting an application should create domain events that can later power history, timelines, analytics, and Career Path without each screen maintaining a separate interpretation of the same state.

The frontend should therefore consume stable domain concepts such as:

- role
- opening
- person/contact
- application
- decision event
- outreach event
- career-path transition

Presentation components map those concepts to the design system; they should not invent persistence rules.

## Refactoring rule

Before adding a major screen:

1. Identify the domain boundary.
2. Extract reusable UI into `components/ui` or `components/<domain>`.
3. Keep data access outside visual components.
4. Add missing semantic design tokens before page-specific styling.
5. Preserve existing behavior with typecheck/tests/build before merge.

## Migration strategy

Do not perform a large-bang rewrite. Existing pages can remain in place while reusable pieces are extracted incrementally. New Decision History UI should be the first feature built entirely on the new component/domain boundaries.
