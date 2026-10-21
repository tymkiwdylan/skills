# Domain docs

How skills consume this repo's domain documentation. Layout: **<single-context | multi-context>**.

## Read before exploring

- <`GLOSSARY.md` at the repo root | `GLOSSARY-MAP.md` at the repo root, which points to one `GLOSSARY.md` per context; read each one relevant to the topic>.
- `docs/adr/`: ADRs that touch the area you are about to change.<  In multi-context repos, also each context's own `docs/adr/`.>

When a file doesn't exist, proceed without it and don't suggest creating it: `domain-modeling` creates glossaries and ADRs when a term or decision actually gets resolved.

## Use the glossary's terms

When output names a domain concept (an issue title, a test name, a hypothesis, a refactor), use the glossary's term and avoid the synonyms it rules out. A concept missing from the glossary is either invented language (reconsider) or a real gap (note it for `domain-modeling`).

## Flag ADR conflicts

When output contradicts an ADR, say so explicitly rather than overriding it silently:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
