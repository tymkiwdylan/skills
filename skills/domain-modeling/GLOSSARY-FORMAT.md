# GLOSSARY.md Format

## Structure

```md
# {Context Name}

{One or two sentence description of what this context is and why it exists.}

## Language

**Order**:
{A one or two sentence description of the term}
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request

**Customer**:
A person or organization that places orders.
_Avoid_: Client, buyer, account
```

## Rules

- **Be opinionated.** When multiple words exist for the same concept, pick the best one and list the others under `_Avoid_`.
- **Keep definitions tight.** One or two sentences max. Define what it IS, not what it does.
- **Only include terms specific to this project's context.** General programming concepts (timeouts, error types, utility patterns) don't belong even if the project uses them extensively. Before adding a term, ask: is this a concept unique to this context, or a general programming concept? Only the former belongs.
- **Group terms under subheadings** when natural clusters emerge. If all terms belong to a single cohesive area, a flat list is fine.

## Single vs multi-context repos

**Single context (most repos):** One `GLOSSARY.md` at the repo root.

**Multiple contexts:** A `GLOSSARY-MAP.md` at the repo root lists the contexts, the code each one owns, its ADRs, and how the contexts relate. Glossaries live at `docs/domains/<context>/GLOSSARY.md`:

```md
# Glossary Map

{Product} is multi-context. Find the context that owns the code you're touching, then read its glossary and the ADRs listed with it. All ADRs live in [`docs/adr/`](docs/adr/).

| Context | Glossary | Owns (main code paths) | ADRs |
| --- | --- | --- | --- |
| Ordering | [`ordering`](docs/domains/ordering/GLOSSARY.md) | `apps/api/orders/`, `apps/web/src/features/checkout/` | 0001 |
| Billing | [`billing`](docs/domains/billing/GLOSSARY.md) | `apps/api/billing/`, `packages/invoicing/` | 0002, 0004 |
| Fulfillment | [`fulfillment`](docs/domains/fulfillment/GLOSSARY.md) | `apps/warehouse/` | — |

## Relationships

- **Ordering → Fulfillment**: Ordering emits `OrderPlaced` events; Fulfillment consumes them to start picking
- **Fulfillment → Billing**: Fulfillment emits `ShipmentDispatched` events; Billing consumes them to generate invoices

## Rules

- A term belongs to exactly one context. If two contexts need the same word with different meanings, define it in each and note the distinction under _Avoid_.
- Work that crosses contexts uses each context's terms for its own side.
- Add a new context here before creating its glossary.
```

Keep the "Owns" column to real paths, so an agent can go from a changed file to its context.

The skill infers which structure applies:

- If `GLOSSARY-MAP.md` exists, read it to find contexts
- If only a root `GLOSSARY.md` exists, single context
- If neither exists, create a root `GLOSSARY.md` lazily when the first term is resolved

When multiple contexts exist, infer which one the current topic relates to. If unclear, ask.
