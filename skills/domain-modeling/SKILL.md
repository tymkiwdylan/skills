---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing a GLOSSARY.md, or recording or editing an ADR.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline: challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* `GLOSSARY.md` for vocabulary is not this skill: that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

## File structure

Most repos have a single context:

```
/
├── GLOSSARY.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

If a `GLOSSARY-MAP.md` exists at the root, the repo has multiple contexts. The map lists each context, its glossary, the code paths it owns, and its ADRs. Contexts usually span apps and packages, so their glossaries live under `docs/domains/`, and all ADRs share one numbering in `docs/adr/`:

```
/
├── GLOSSARY-MAP.md                   ← context → glossary, owned code paths, ADRs
├── docs/
│   ├── adr/                          ← every ADR, one numbering
│   │   ├── 0001-orders-are-event-sourced.md
│   │   └── 0002-billing-owns-the-invoice-lifecycle.md
│   └── domains/
│       ├── ordering/GLOSSARY.md
│       └── billing/GLOSSARY.md
├── apps/
└── packages/
```

Follow the map's links when it points somewhere else; the map is the source of truth for where each glossary lives. `docs/agents/domain.md`, when present, records which layout the repo chose.

In a multi-context repo:

- Find the context that owns the code under discussion from the map's code paths. When the topic spans contexts, each side uses its own context's terms.
- A term belongs to exactly one context. When two contexts need the same word with different meanings, define it in each and note the distinction under _Avoid_.
- A new context gets its row in `GLOSSARY-MAP.md` before its glossary is created.
- When an ADR belongs to a context, add its number to that context's row.

Create terms and ADRs lazily: only when you have something to write. If no glossary exists, create it when the first term is resolved. If no `docs/adr/` exists, create it when the first ADR is needed.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `GLOSSARY.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account': do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible. Which is right?"

### Update GLOSSARY.md inline

When a term is resolved, update `GLOSSARY.md` right there. Don't batch these up: capture them as they happen. Use the format in [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md).

`GLOSSARY.md` should be totally devoid of implementation details. Do not treat `GLOSSARY.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).
