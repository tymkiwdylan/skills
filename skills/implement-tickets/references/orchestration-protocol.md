# Orchestration protocol

Operational record and templates for `SKILL.md`, which stays authoritative.

## Integration record

Before dispatch, record: the repository path and remote, the pushed base ref and SHA, the feature branch, the ticket source, the authoritative source paths, the exact full-suite commands, CI requirements, and the merge strategy. Per ticket, track dependencies, owner, classification, worker checkout and branch, PR, review findings, candidate SHA, verification result and merge SHA.

Keep externally blocked implementation separate from live operational gates. Neither makes incomplete implementation review-ready. Leave uncommitted source documents in place; when workers need them, give exact paths or a read-only snapshot rather than bringing unrelated changes into PRs.

## Tracker synchronization

Use the operations in `docs/agents/issue-tracker.md` and the label strings in `docs/agents/triage-labels.md`.

**Guard.** Before the first write of a session, confirm you are on the configured tracker: Linear `get_workspace` matches the `urlKey`; GitHub `gh repo view` matches the repo. On a mismatch, or when the configured tracker is unavailable, make no writes and report it. Never fall back to another configured workspace.

**Single writer.** Only the parent changes ticket state, labels, assignee and relations. Workers read their ticket, may comment on it, and reference its identifier in their branch and PR.

**State transitions.**

| Event | Tracker change |
| --- | --- |
| All blockers merged; the ticket enters the next wave | `Backlog` → `Todo` |
| Worker dispatched | `In Progress`; assignee = the agent user where the tracker has one; comment with the branch and start SHA |
| Ticket PR opened | Link the PR; `In Review` where that state exists, otherwise stay `In Progress` |
| Review findings sent | Comment summarizing them (no secrets or real data) |
| Merged after the full-suite gate | `Done`; comment with the merge SHA and the gate evidence |
| Blocked | The blocker protocol in `SKILL.md`; never `Canceled` |

On GitHub, states without a native equivalent are labels (`in-progress`, `in-review`), and `Done` is closing the issue as completed. On local markdown, they are the `Status:` line.

Promote dependents to `Todo` right after each merge, so the next wave is visible. Don't move `gate`, `HITL`, `external-blocked` or `deferred` tickets to `In Progress` for a worker. For a `HITL` ticket, the parent may attach prepared evidence and leave it assigned to the engineer.

**Branches and PRs.** Name ticket branches per `workflow.md`, falling back to the tracker's branch name or `feat/<ticket-id-lowercase>` (for example `feat/m2-b1-t03`). Put both the ticket ID and the tracker identifier in the PR title: `M2-B1-T03 (ABC-231): home pricing and closing CTA`.

**Scope changes.** When review shows a ticket is wrong or incomplete, comment the defect on the ticket and create or update tickets only within accepted scope. New scope needs the engineer: record it as a `HITL` ticket.

## Worker prompt

Adapt with verified values before sending:

```text
Implement ticket {ticket ID} from {tracker identifier and URL, or ticket file path}.
Read the ticket per docs/agents/issue-tracker.md; do not change its state,
labels or relations. Reference {tracker identifier} in the PR.
Repository checkout: {isolated absolute worktree path}.
Start commit: {current remote feature branch SHA}.
Your unique branch: {ticket branch}. PR base: {feature branch}.
Read {applicable AGENTS.md / CLAUDE.md paths}, docs/agents/workflow.md and {authoritative source paths}.
Exploration notes, if any: {path outside the repo}; read them before exploring yourself.
Acceptance and demonstration: {ticket criteria or exact source location}.
Owned files/modules: {ownership}. Shared contracts: {stable contracts}.
Prerequisites already merged: {tickets and merge SHAs}.
Focused checks: {existing relevant commands}.
Full-suite commands: {from workflow.md}.
Preserve unrelated changes; implement only this ticket. Do not change scope,
weaken checks, merge into the base branch, or run production actions.
If a prerequisite or business decision is missing, report it before guessing.
Commit coherent checkpoints. Run the verify skill and paste its GATE/VERDICT
block in the PR. Push your branch and open a PR to the feature branch with
acceptance evidence and limitations. Do not merge your PR.
Return its URL, commits, checks, demonstration evidence and unresolved risks.
Stay available for review fixes on the same branch and checkout.
```

## Ticket PR template

Use the repository PR template when one is required, keeping this information:

```markdown
{Ticket ID} ({tracker identifier}): {concrete problem and resulting behaviour}

Ticket: {link}
Base: {feature branch}

Acceptance coverage:
- {criterion → implementation and observable evidence}

Validation:
- {exact command, result and tested commit}
- {demonstration and evidence path}
- {verify GATE/VERDICT block}

Risks and remaining work:
- {material limitation or external gate, if any}

{magic word from workflow.md, e.g. Fixes ABC-231}
```

Never claim the parent's integration gate passed from worker-only checks.

## Exact-candidate gate

Review every commit and the full diff against the ticket. Send findings to the original worker with severity, affected code, the observed failure, and the required behaviour or verification. Re-review the fixes.

For each proposed merge:

1. `git fetch origin`, then record the feature head and ticket head SHAs.
2. Build the candidate in a throwaway worktree with the agreed merge strategy: `git worktree add --detach <tmp> origin/<feature>`, then `git merge --squash origin/<ticket-branch>` (squash) or `git merge --no-ff --no-commit origin/<ticket-branch>` (merge commit). A conflict means the worker must update its branch first.
3. Run the full suite there and record both source SHAs, the candidate tree and the results. Remove the worktree afterwards.
4. If either head moves before the merge, the evidence is stale: rebuild and rerun.

Unresolved findings, failing checks, conflicts or unavailable required verification keep the PR unmerged.

Merge one ticket at a time. Confirm the remote feature branch matches the tested candidate, refresh the other open PRs, and run the full suite on the feature branch after each wave. Leave the aggregate feature-to-base PR as an unmerged draft.

## Status and handoff

Track each ticket as pending, implementing, under review, gate failed, merged, or externally blocked, with evidence rather than implied completion. Record live operational gates separately, as awaiting explicit authorization. The tracker's ticket states are the status record; mirror wave results into the integration record's wave log.

The final handoff names the base and feature refs, the aggregate draft PR, ticket-to-PR traceability, the final tested SHA, the exact checks, the demonstrations, and the remaining external gates or risks. Use `review-ready` only under the conditions in `SKILL.md`; otherwise `partial/blocked`, with the specific missing prerequisite.
