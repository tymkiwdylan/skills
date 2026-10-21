# <Product> Glossary Map

<Product> is multi-context. Each bounded context has its own glossary under `docs/domains/<context>/GLOSSARY.md`. Find the context that owns the code you're touching, then read its glossary and the ADRs listed with it. All ADRs live in [`docs/adr/`](docs/adr/).

| Context | Glossary | Owns (main code paths) | ADRs |
| --- | --- | --- | --- |
| <Context name> | [`<context>`](docs/domains/<context>/GLOSSARY.md) | `<path/>`, `<path/>` | — |

## Relationships

- **<Context A> → <Context B>**: <how they interact, in one line>

## Rules

- A term belongs to exactly one context. If two contexts need the same word with different meanings, define it in each and note the distinction under _Avoid_.
- Work that crosses contexts uses each context's terms for its own side.
- Add a new context here before creating its glossary. `domain-modeling` maintains these files.
