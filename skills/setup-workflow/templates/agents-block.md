## Agent skills

### Issue tracker

<One line: where issues, specs and tickets live.> See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Triage labels

<One line: the label vocabulary, e.g. `agent-ready` / `HITL` labels plus tracker states.> See [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

### Domain docs

<Single-context: `GLOSSARY.md` and `docs/adr/` | Multi-context: [`GLOSSARY-MAP.md`](GLOSSARY-MAP.md) maps each context to its glossary under `docs/domains/<context>/`, the code it owns, and its ADRs in `docs/adr/`>. Read the owning context's glossary and ADRs before changing code there. See [`docs/agents/domain.md`](docs/agents/domain.md).

### Workflow

<One line: harness, branch and PR conventions.> See [`docs/agents/workflow.md`](docs/agents/workflow.md).

Before claiming work done, committing, or opening a PR, run the `verify` skill (`node .agents/skills/verify/scripts/verify.mjs --run`) and include its `GATE`/`VERDICT` lines in the report or PR body.
