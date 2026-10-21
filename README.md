# skills

Agent skills for one way of shipping software with coding agents: plan in the tracker, implement in isolated worktrees, prove every change from real gate output, and keep a human at every merge into the base branch. The skills are project-agnostic; `setup-workflow` writes each repo's specifics into a few files the skills read at runtime.

## The workflow

**Large features: spec → ticket map → parallel workers → integration branch.**

1. A spec lands in the tracker (`to-spec`), and decisions go into the repo's docs (`grill-with-docs`, `domain-modeling`).
2. `create-tickets` splits it into a ticket map: stable IDs (`M2-B1-T03`), acceptance criteria, ownership, and native blocking edges.
3. `implement-tickets` runs each dependency wave through workers in their own worktrees. Every ticket PR targets an integration branch, is reviewed by the parent, and merges only when the full suite passes on the exact merge candidate.
4. The integration PR to the base branch stays a draft until a human merges it.

**Single fixes: issue → worktree → test-first fix → PR.**

1. One issue, one worktree, one branch.
2. `diagnosing-bugs` until the loop goes red, then `tdd` for the smallest green change.
3. `verify` before the PR; its `GATE`/`VERDICT` block goes in the PR body.
4. Findings from a review of a merged PR become follow-up PRs, not amendments.

## Skills

| Skill | What it does |
| --- | --- |
| [`setup-workflow`](skills/setup-workflow/SKILL.md) | Configures a repo: harness, tracker, labels, domain docs, conventions, verify gates. Installs everything below. Run by hand (`/setup-workflow`). |
| [`create-tickets`](skills/create-tickets/SKILL.md) | Turns an approved plan into a dependency-aware ticket map in Linear, GitHub Issues or local markdown. |
| [`implement-tickets`](skills/implement-tickets/SKILL.md) | Implements a ticket map through parallel worktree workers, parent review and full-suite merge gates. |
| [`verify`](skills/verify/SKILL.md) | Maps the diff to the repo's required gates, runs them, and prints a verdict a reviewer can trust. |

`setup-workflow` also installs these upstream skills, pinned in the target repo's `skills-lock.json`: `tdd`, `diagnosing-bugs`, `grilling`, `grill-with-docs`, `domain-modeling`, `codebase-design`, `improve-codebase-architecture`, `prototype`, `writing-for-agents`, `handoff`, `to-spec` and `triage` from [mattpocock/skills](https://github.com/mattpocock/skills), plus `react-useeffect` from [softaworks/agent-toolkit](https://github.com/softaworks/agent-toolkit) in React repos. [`upstream.json`](skills/setup-workflow/upstream.json) lists them, along with the upstream skills left out because this collection replaces them.

## Install

In the repo you want to set up:

```bash
npx skills add tymkiwdylan/skills -s setup-workflow -a claude-code codex -y
```

Then run `/setup-workflow` in your agent. It explores the repo, proposes an answer for each choice, shows you every file before writing it, installs the rest of the skills, and finishes by running `verify --plan` against recent history so you can check the gates.

Update later with `npx skills update -p`. Teammates restore the pinned set with `npx skills experimental_install`.

## What setup writes

| File | Holds |
| --- | --- |
| `docs/agents/issue-tracker.md` | Where issues live and the exact operations for that tracker |
| `docs/agents/triage-labels.md` | The label or state string for each triage role and ticket classification |
| `docs/agents/domain.md` | Glossary and ADR layout |
| `docs/agents/workflow.md` | Harness, language, branches, commits, PR rules, merge strategy, full-suite commands, notifications |
| `.agents/config/verify.json` | Gates (changed paths → command) and added-line rules for `verify` |
| `## Agent skills` in `CLAUDE.md` or `AGENTS.md` | Pointers to all of the above |

The `issue-tracker.md`, `triage-labels.md` and `domain.md` files use the same shape as `setup-matt-pocock-skills`, so the upstream skills read them unchanged.

## Harness

`workflow.md` names the harness, and `implement-tickets` adapts to it:

- **`t3code`**: T3 Code on Claude Code. Workers are worktree subagents, PRs are linked to the thread, and the thread waits on `watch_pull_request` instead of polling.
- **`plain`**: any other harness. Workers run in `git worktree` checkouts, and CI is watched with `gh pr checks --watch`.

## Roadmap

- `live-qa`: browser QA of a change in the running app, with a doctor check, login adapters and a defect report.
- `autofix`: an unattended lane from a labelled bug to a reviewed PR or a hand-back.
- Runner templates for scheduling those lanes.

## Development

```bash
npm test
```

Runs the `verify` engine tests and the repo checks in [`test/repo.test.mjs`](test/repo.test.mjs): frontmatter, links, template validity, upstream collisions, the install list, and a guard against project-specific names.

## License

[MIT](LICENSE)
