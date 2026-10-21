# Notice

## Vendored from mattpocock/skills

These skills come from [mattpocock/skills](https://github.com/mattpocock/skills) by Matt Pocock, MIT licensed, at commit [`5beb35b`](https://github.com/mattpocock/skills/tree/5beb35b040e3de97e54fa9e386d7e42d15c295c2). Each folder carries a copy of the upstream `LICENSE`.

| Skill | Upstream path | Changes |
| --- | --- | --- |
| `grilling` | `skills/productivity/grilling` | None |
| `grill-with-docs` | `skills/engineering/grill-with-docs` | None |
| `review-diff` | `skills/engineering/code-review` | Renamed from `code-review` (the Claude Code built-in has that name). Reviews a PR against its base; reads the spec from tracker IDs and `create-tickets` tickets; adds `AGENTS.md`/`CLAUDE.md`, `docs/agents/workflow.md` and the owning glossary and ADRs to the standards sources, and skips what `verify` already enforces. |
| `domain-modeling` | `skills/engineering/domain-modeling` | The multi-context layout is a `GLOSSARY-MAP.md` table (context, glossary, owned code paths, ADRs), with glossaries in `docs/domains/<context>/` and one ADR numbering in `docs/adr/`. Adds the one-context-per-term rules and checks the base branch for ADR number collisions. |

The `docs/agents/issue-tracker.md`, `triage-labels.md` and `domain.md` files that `setup-workflow` writes follow the shape of upstream's `setup-matt-pocock-skills`, so the upstream skills `setup-workflow` installs read them unchanged.

To pull in upstream changes, diff each folder against the new upstream commit, keep the changes listed above, and update the commit here.
