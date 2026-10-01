# Product Decisions

This repository does not contain a formal product decision history with decision owners and approval dates. The entries below summarize choices explicitly documented in the current product and architecture materials; they are not a complete decision record, and no rationale is inferred where the source does not provide one.

| Documented choice | What it means | Source |
|---|---|---|
| Users bring their own AI provider account and key. | AI requests use a provider connection selected by the user; provider usage is billed by that provider. The architecture documents API-key support for OpenAI, Anthropic, and Gemini. | [AI architecture](../ARCHITECTURE.md) |
| Users choose how an AI key is stored. | The documented options are encrypted server storage or browser-only storage. They have different cross-device and security trade-offs. | [Credential storage](../ARCHITECTURE.md#credential-storage-the-user-chooses) and [Security](../SECURITY.md) |
| Product telemetry is kept separate from user content. | The telemetry documentation describes predefined, content-free product events rather than collecting prompts, notes, or profile text. | [Telemetry](../TELEMETRY.md) |

## Add a Decision

When recording a new product decision, include:

- Date and decision owner
- Decision and the user problem it addresses
- Options considered and rationale
- Expected outcome or measure
- Related research, specification, or implementation link
- Conditions that would cause the decision to be revisited

Do not use this log as a substitute for a roadmap; see [Roadmap](ROADMAP.md).