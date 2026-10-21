# Workflow

How work moves through this repo, from issue to merged PR. `create-tickets`, `implement-tickets` and `verify` read this file. Edit it directly when a convention changes; rerun `setup-workflow` only to start over.

## Harness

**Harness: <t3code | plain>**

- `t3code`: agents run in T3 Code on Claude Code. Skills use T3 orchestration (worktree subagents, `link_pull_request`, `watch_pull_request`).
- `plain`: any other harness. Skills fall back to `git worktree`, `gh` and polling.

## Language

Tickets, PR titles and bodies, and commit subjects are written in **<language>**. Domain terms keep the spelling the glossary uses.

## Branches

- Base branch: `<main>`.
- Single fixes and tickets: <the tracker's branch name, e.g. Linear `gitBranchName` | `<type>/<issue-id>-<slug>`>.
- Multi-ticket features run on an integration branch, `<feat/<feature-slug>>`. Ticket PRs target the integration branch, and the integration PR to the base branch stays a draft until a human merges it.

## Commits

<Conventional commits with a scope and the issue ID: `fix(billing): keep the invoice total after a refund (ABC-123)`.>

## Pull requests

- The body states the problem, the root cause or approach, the change, the test that proves it, any tradeoff the engineer accepted, the `verify` `GATE`/`VERDICT` block, and a tracker magic word (`Fixes ABC-123` for work the PR completes, `Refs ABC-123` otherwise).
- Findings from a review of a merged PR land as follow-up PRs, not amendments.
- Merge strategy: <squash for ticket and fix PRs; merge commit for integration PRs>.

## Full suite

Commands that must pass on the exact merge candidate before a ticket PR merges:

```bash
<pnpm lint>
<pnpm test>
```

## Verification

- Gates: `node .agents/skills/verify/scripts/verify.mjs --run`, configured in `.agents/config/verify.json`.
- UI behaviour proof: <none | the live-QA skill to run for UI changes>.

## Notifications

**Notify: <none | push | skill:<name>>**

How `implement-tickets` tells the engineer about a new batch of blockers. `push` uses the harness push-notification tool; `skill:<name>` runs that skill; `none` reports blockers in the thread only.
