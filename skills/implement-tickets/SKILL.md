---
name: implement-tickets
description: Implement an approved dependency-aware ticket map (from create-tickets, in the repo's configured tracker) through parallel worktree workers, ticket PRs, parent review and full-suite merge gates, keeping tracker status current and routing blockers to the engineer without stopping. Use when the requested outcome is a pushed feature branch ready for engineer review; do not use for ad-hoc single-file edits, and never treat it as production authorization.
---

# Implement tickets through reviewed PRs

Act as the parent orchestrator. Keep requirements and integration ownership in the parent while independent workers implement bounded tickets in isolated worktrees. Finish with a feature branch ready for the engineer to review; never merge that feature branch into its base branch.

Before creating branches, workers or PRs, read:

- `docs/agents/workflow.md`, `issue-tracker.md` and `triage-labels.md`. When they are missing, stop and ask the user to run `setup-workflow`.
- [references/orchestration-protocol.md](references/orchestration-protocol.md): the integration record, tracker sync, worker prompt, PR template and exact-candidate gate.
- The harness reference named by `workflow.md`: [references/harness-t3code.md](references/harness-t3code.md) for `Harness: t3code`, [references/harness-plain.md](references/harness-plain.md) for `Harness: plain`. It says how to dispatch workers, message them, watch PRs and notify.

## Required input

An approved ticket map with stable ticket IDs, dependencies, acceptance criteria, verification, ownership boundaries and delivery waves, as produced by `create-tickets` in the configured tracker. If the user names a project, spec or index, use it; otherwise use the most recent active map in the tracker. Ask only when several candidates would change the work materially. Don't silently redesign accepted scope: route ticket defects and unresolved business decisions through the blocker protocol.

The tracker is authoritative for ticket content and status; repository documents stay authoritative for requirements.

## Establish the integration contract

1. Read applicable `AGENTS.md` / `CLAUDE.md`, the ticket map, its source plan, and the scope, architecture, domain, decision and deployment documents it references.
2. Inspect the repository: current branch, remotes, branch conventions, test commands, CI and PR tooling.
3. Preserve unrelated or uncommitted user changes. Don't hide, reset, overwrite or absorb them into the feature.
4. Require the base branch to have at least one pushed commit. If the repository is unborn, stop and ask which files form the baseline and which remote receives it.
5. Require a remote with authenticated push and PR access. If the PR workflow can't run, stop before delegating code changes and name the missing prerequisite.
6. Take the base branch, full-suite commands and merge strategy from `workflow.md`. Don't invent test commands. A first foundation PR may introduce the suite, but it must then run that suite before merging.
7. Classify tickets as repository implementation, externally blocked, or live operational gates. Repository changes use worker PRs. Live production actions stay with the parent, need separate explicit authorization when they run, and never become implied code work.
8. Create and push one parent-owned feature branch from the base, named per `workflow.md`.
9. Read the integration record (where `issue-tracker.md` says it lives) and keep it current: base and feature branches, ticket source, full-suite commands, merge strategy, active blockers, classifications and the current wave, so a later session can resume without the engineer re-explaining state.

Invoking this skill for implementation authorizes branch creation and PR operations. It does not authorize production deployment, production data access, destructive migrations, or bypassing repository protections.

## Execute dependency waves

Respect the ticket DAG. The candidate wave is every `agent-ready` ticket in `Todo` whose blockers are all `Done`; confirm against the feature branch that each blocker's PR is actually merged before trusting the status.

Before the first wave, when tickets share unfamiliar ground (a subsystem, an external API, a data shape), run one read-only exploration subagent that writes its notes outside the repo, at a path recorded in the integration record. Worker prompts point at those notes instead of having every worker explore again.

- Dispatch write-heavy tickets to workers in their own worktrees, each starting from the current remote feature branch on one unique ticket branch, as the harness reference describes.
- Use read-only subagents for exploration, focused review or test analysis.
- Never let two write-capable workers share a checkout or a branch.
- Stamp every ticket's tracker identifier (Linear `ABC-231`, GitHub `#42`, the ticket ID on local markdown) into what you start for it: title each worker or reviewer subagent, task or thread `<tracker-id> <short purpose>`, identifier first (`ABC-231 implement`, `ABC-231 review standards`), and use the tracker's branch name (Linear `gitBranchName`) as its branch. Work tied to no single ticket, such as exploration or the feature-branch review, keeps a plain descriptive title.
- Parallelize only when the tickets' ownership and shared-file contracts make it safe; shrink the wave when actual overlap contradicts the map.
- Don't start a dependent wave because a prerequisite PR exists; wait until it is reviewed and merged.

Every worker must:

- implement one ticket and no adjacent deferred scope, following repository instructions and the acceptance criteria;
- commit at each coherent, reviewable checkpoint, free of unrelated changes, running the relevant focused checks first when practical;
- run `verify` before pushing and put its `GATE`/`VERDICT` block in the PR;
- push its unique branch and open a PR against the feature branch, never the base branch;
- include acceptance coverage, tests run, risks and handoff evidence in the PR;
- stay available to address review feedback on the same branch.

Use the worker prompt and PR template from the protocol reference. Give workers exact paths and contracts instead of the whole parent conversation.

## Review and feedback loop

The parent personally reviews every ticket PR. `review-diff` and other review subagents add evidence; they don't replace the parent's judgment.

1. Confirm the PR's base is the feature branch and its branch holds only the assigned ticket.
2. Run `review-diff` on the PR, with the ticket and its tracker identifier as the spec. Then review the full diff and commits yourself against the acceptance criteria, repository invariants, authorization boundaries, failure behaviour, migrations and test coverage, weighing its findings rather than forwarding them unread.
3. Run focused checks, and verify the demonstration when relevant.
4. Send concrete, prioritized findings to the original worker, which fixes the same branch with new commits and reports fresh evidence.
5. Re-review the change. Repeat until no actionable findings remain.

Don't silently repair a worker's PR in the parent checkout. Return ownership, unless the worker is unavailable and you record why you took over.

## Blocker protocol: flag, then keep moving

A missing business decision, external input, credential or production authorization blocks only the tickets it reaches, not the run.

1. Record the blocker on the affected ticket where the engineer will see it: what is missing, why it can't be inferred, options with a recommendation, and what unblocks it. Apply the `HITL` label, assign the engineer, and move it out of `In Progress`. When a decision spans several tickets, create one `client-question` or `HITL` ticket that blocks them.
   - When unblocking means a manual procedure (creating credentials, configuring a third-party dashboard, a cutover), prepare a `wizard` script for it and link it from the ticket, so the engineer runs it instead of following prose.
   - When the answer has to come from someone other than the engineer (a client, a domain expert), draft it with `to-questionnaire` and link the document from the ticket.
2. Notify the engineer once per new batch of blockers, through the `Notify` mechanism in `workflow.md`. Invoking this skill authorizes those notifications and no others.
3. Continue with every ticket the blocker doesn't reach. At each wave boundary, re-check flagged tickets for an answer (a comment, the label removed, or the blocker ticket `Done`) and resume them.
4. Stop and report `partial/blocked` only when no unblocked in-scope ticket remains.

Never resolve a blocker by inference, never relabel a `gate`, `HITL` or `deferred` ticket as `agent-ready`, and never treat a tracker state, comment or label as production authorization.

## Full-suite merge gate

A ticket PR merges only when:

- every review finding is resolved;
- the PR is current with the latest feature branch after earlier merges in the wave;
- required CI checks pass;
- the full suite from `workflow.md` passes on the exact candidate (PR head integrated into the latest feature branch);
- the parent has verified the ticket's acceptance and handoff evidence.

Prove the exact candidate in an isolated integration worktree, whether or not CI exists, unless a repository mechanism already proves it. Never weaken, skip or redefine the suite to merge. When the suite is flaky or unavailable, keep the PR unmerged and report the blocker.

Merge ticket PRs one at a time with the merge strategy from `workflow.md`. After each merge, update the remote feature branch and refresh the remaining PRs before their gate. After every wave, run the full suite on the feature branch before opening the next wave.

## Finish for engineer review

After every in-scope repository ticket is merged:

1. Run the full suite on the final feature branch and verify the plan's integrated demonstration.
2. Run `review-diff` on the whole feature branch against the base, with the spec as its spec. Ticket reviews can't see problems that only appear across tickets. Route actionable findings to a worker as a follow-up ticket PR through the same merge gate.
3. Confirm ticket-to-PR traceability, no unresolved review comments, and no accidental deferred scope.
4. Push the final feature branch.
5. Open or update a draft aggregate PR from the feature branch to the base branch, and leave it unmerged.
6. Update the integration record, and post a status update where the tracker supports one (Linear project update: `onTrack`, `atRisk` or `offTrack`), listing every open `HITL`, `gate` and `external-blocked` ticket.
7. Deliver the feature branch, the aggregate PR, the ticket PR list, the tests run, the demonstrations completed, and any explicit blockers or residual risks.

Report `review-ready` only when every required repository ticket is complete, the final suite is green and the branch is pushed. When a required input still blocks implementation, report `partial/blocked` and don't describe the feature as complete. Live operational gates may stay pending engineer authorization, clearly separated from completed code.
