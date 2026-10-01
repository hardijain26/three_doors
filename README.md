# Three Doors

Three Doors helps job seekers organize opportunities, track target roles and contacts, prepare tailored application materials, and manage outreach. AI features use a provider connection chosen by the user.

## Product guide

- [Product overview](docs/product/OVERVIEW.md): audience, problem, and core workflow
- [Features and limits](docs/product/FEATURES.md): what the product currently supports
- [Roadmap](docs/product/ROADMAP.md): roadmap information recorded in this repository
- [Product decisions](docs/product/DECISIONS.md): documented decisions and their sources
- [Glossary](docs/product/GLOSSARY.md): product terms in plain language

## Engineering reference

- [Application architecture](docs/PRODUCT-ARCHITECTURE.md): application boundaries and dependency direction
- [AI architecture](docs/ARCHITECTURE.md): providers, gateway, authentication, and key storage
- [Security](docs/SECURITY.md): key handling, isolation, and known gaps
- [Telemetry](docs/TELEMETRY.md): event catalogue and data-collection rules
- [Design-system master](design-system/MASTER.md) and [component contract](design-system/COMPONENTS.md)

## For contributors

### Run locally

Use Node.js 22 or later. Copy `.env.example` to `.env.local` and fill in the required values, then run:

```sh
npm install
npm run dev
```

### Checks

```sh
npm test
npm run typecheck
npm run build
```

### UI/UX design

The project uses a responsive, web-adapted Material 3 design system. The design-system documents above define the source of truth for tokens, components, and accessibility rules.

UI UX Pro Max is installed as a project-local GitHub Copilot prompt. In Copilot Chat, run `/ui-ux-pro-max` followed by the UI/UX task. The prompt's local search scripts require Python 3.
