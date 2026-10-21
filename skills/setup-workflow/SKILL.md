---
name: setup-workflow
description: "Configure a repo for this skill collection: harness, issue tracker, triage labels, domain docs, branch and PR conventions, verify gates, and the upstream skills it builds on. Run once per repo before create-tickets, implement-tickets or verify; rerun to change a choice."
disable-model-invocation: true
---

# Setup workflow

Write the per-repo configuration the other skills read, then install the skills. The skills stay generic; everything project-specific lives in what this writes:

| File | Read by |
| --- | --- |
| `docs/agents/issue-tracker.md` | `create-tickets`, `implement-tickets`, `to-spec`, `triage` |
| `docs/agents/triage-labels.md` | `create-tickets`, `implement-tickets`, `triage` |
| `docs/agents/domain.md` | every skill that explores code |
| `docs/agents/workflow.md` | `create-tickets`, `implement-tickets`, `verify` |
| `.agents/config/verify.json` | `verify` |
| `## Agent skills` block in `CLAUDE.md` or `AGENTS.md` | every agent session |

Templates for each are in [`templates/`](templates/). This is a guided setup, not a script: explore, propose, confirm, then write.

## 1. Explore

Read what exists; assume nothing.

- `git remote -v`, the default branch, and `git log --merges -20` / `git log --oneline -50`: GitHub or GitLab, squash or merge commits, commit-subject style, branch naming.
- `CLAUDE.md` and `AGENTS.md`: which exists, whether `CLAUDE.md` only imports `AGENTS.md`, any existing `## Agent skills` block, and every "after you change X, run Y" rule.
- `docs/agents/` and `.agents/config/`: earlier output of this skill or of `setup-matt-pocock-skills`. Update it in place.
- `package.json` scripts (root and workspaces), `Makefile`, `justfile`, `pyproject.toml`, `Cargo.toml`, `go.mod`, and CI workflows: the real typecheck, lint, test and build commands, and which paths each covers.
- Monorepo signals (`pnpm-workspace.yaml`, `workspaces`, a populated `packages/*`), `GLOSSARY.md` / `GLOSSARY-MAP.md`, `docs/adr/`.
- Harness: whether `mcp__t3-code__*` tools (or `t3-code` MCP tools under another prefix) are available in this session.
- Tracker access: Linear MCP servers in this session (`get_workspace` on each), or `gh auth status`.

Done when you can propose an answer for every section below.

## 2. Ask, one section at a time

Lead each section with the recommended answer so the user can accept it in a word. Skip a section the exploration settled, and say what you found instead.

**A. Harness.** "Are you running agents through T3 Code?" Recommend `t3code` when T3 tools are available, `plain` otherwise. `t3code` means T3 Code on Claude Code; skills then use T3 worktree subagents and PR watching. `plain` falls back to `git worktree`, `gh` and polling.

**B. Issue tracker.** Linear, GitHub, local markdown, or other. Recommend the tracker the team already uses: a Linear server with matching issues in recent commits (`ABC-123`), otherwise the git remote's host, otherwise local markdown.
- Linear: confirm the MCP server name, workspace `urlKey` (from `get_workspace`), team key, workflow states (`list_issue_statuses`) and project policy.
- GitHub: confirm `owner/repo` and whether issue dependencies and sub-issues are enabled.
- Local: confirm the directory (default `.scratch/`).
- Other: ask for one paragraph describing the workflow and write `issue-tracker.md` from it.

**C. Triage labels.** Recommend `agent-ready` / `HITL` for ready-for-agent / ready-for-human, tracker states for `needs-triage` and `wontfix`, and the default classification labels. On a tracker that already has labels (`list_issue_labels`, `gh label list`), map to the existing strings instead of creating near-duplicates.

**D. Domain docs.** Single-context unless exploration found monorepo signals or a `GLOSSARY-MAP.md`; then confirm multi-context.

**E. Workflow conventions.** Propose each from git history: language, base branch, branch naming, commit style, merge strategy, integration-branch pattern, the full-suite commands, and notifications (`none` unless the user names a mechanism). The full suite must be commands that exist today; never invent one.

**F. Verify gates.** Propose `.agents/config/verify.json` gates from the commands found in step 1. Each gate maps changed paths to one command:

```json
{
  "name": "test:web-related",
  "why": "vitest tests importing the changed web modules",
  "when": [{ "paths": ["apps/web/src/**/*.{ts,tsx}"], "exclude": ["**/*.d.ts"], "status": ["A", "M", "R", "C", "?"] }],
  "run": ["pnpm", "exec", "vitest", "related", "--run", "--passWithNoTests", "{files}"],
  "cwd": "apps/web"
}
```

Order gates cheap-first (builds that others depend on, then typecheck, lint, tests). Use `{files}` only for commands that accept file arguments. Turn each mechanical AGENTS.md rule into a `rules` entry (a regex applied to added lines) or, when a regex can't express it, into a gate that runs the project's linter. The full contract is in the `verify` skill.

**G. Upstream skills.** Show the default set from [`upstream.json`](upstream.json) with each excluded skill and why. Add `react-useeffect` only when the repo uses React. Note any already-installed skill that collides with one of this collection (`to-tickets`, `implement`, `implement-spec`, `setup-matt-pocock-skills`) and offer to remove it.

## 3. Confirm

Show drafts of every file from the table above, filled in from the templates with the placeholders (`<…>`) resolved. Let the user edit before anything is written.

## 4. Write and install

1. **Pick the instructions file.** Edit `CLAUDE.md` if it exists, unless it only imports `AGENTS.md`; then edit `AGENTS.md`. Else edit `AGENTS.md` if it exists. If neither exists, ask which to create. Replace an existing `## Agent skills` block in place; don't touch surrounding sections.
2. **Write** `docs/agents/{issue-tracker,triage-labels,domain,workflow}.md` and `.agents/config/verify.json`.
3. **Install this collection**: `npx skills add tymkiwdylan/skills -s create-tickets implement-tickets verify setup-workflow -a claude-code codex -y`.
4. **Install upstream**: one `npx skills add <source> -s <skill> <skill> … -a claude-code codex -y` per source in `upstream.json`. Both commands write `skills-lock.json`; commit it so `npx skills update -p` and `npx skills experimental_install` work for the team.
5. **Labels**: create the agreed labels that don't exist yet in the tracker (Linear `create_issue_label`, `gh label create`). Creating labels is authorized by this skill; renaming or deleting existing ones is not.

Done when every file is written and both installs report success.

## 5. Prove it

Run `node .agents/skills/verify/scripts/verify.mjs --plan --base <a ref ~20 commits back>` so the plan exercises real recent changes. Show the planned gates and the files that triggered them, and fix the config until every area the user expects appears. Then run `--run` on a clean tree with the default base and report the `VERDICT`.

Finish with what was written and installed, the labels created, and which skills now read which file. Mention that `docs/agents/*.md` and `.agents/config/verify.json` can be edited directly; rerunning this skill is only for switching trackers or starting over.
