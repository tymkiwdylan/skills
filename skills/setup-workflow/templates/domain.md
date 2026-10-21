# Domain docs

How skills consume this repo's domain documentation. `domain-modeling` maintains these files; `grill-with-docs` and `improve-codebase-architecture` reach it.

## Layout

<!-- single-context: keep this block, delete the multi-context one -->
This repo is single-context:

- **`GLOSSARY.md`** at the repo root holds the domain language.
- **`docs/adr/`** holds the ADRs.

<!-- multi-context: keep this block, delete the single-context one -->
This repo is multi-context:

- **`GLOSSARY-MAP.md`** at the repo root lists each bounded context, the code paths it owns, and its ADRs.
- **`docs/domains/<context>/GLOSSARY.md`** holds each context's domain language. Contexts span apps and packages, so glossaries live under `docs/domains/` rather than inside one app.
- **`docs/adr/`** holds every ADR, with one shared numbering. The map says which ADRs belong to which context.

## Read before exploring

<!-- single-context -->
- **`GLOSSARY.md`**, for the terms the task touches.
- The **ADRs** in `docs/adr/` that touch the area you'll change.

<!-- multi-context -->
- **`GLOSSARY-MAP.md`**: find the context(s) owning the paths you'll touch.
- That context's **`GLOSSARY.md`**, for the terms the task touches.
- The **ADRs** the map lists for that context, plus any other ADR that touches the area.

When a term or decision you need is missing, proceed: `domain-modeling` adds it when it actually gets resolved.<  A new context gets its row in `GLOSSARY-MAP.md` first.>

## Use the glossary's terms

When output names a domain concept (an issue title, a test name, a hypothesis, a refactor), use the term the owning glossary defines and avoid the synonyms listed under _Avoid_.< Domain terms in <language> keep the glossary's spelling.> A concept missing from the glossary is either invented language (reconsider) or a real gap (note it for `domain-modeling`).

## Flag ADR conflicts

When output contradicts an ADR, say so explicitly rather than overriding it silently:

> _Contradicts ADR-0004 (orders are event-sourced), but worth reopening because…_
