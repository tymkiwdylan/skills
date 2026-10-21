# Harness: plain

Applies when `docs/agents/workflow.md` says `Harness: plain`, or when the T3 tools are unavailable.

## Dispatching workers

1. Create one worktree per ticket from the remote feature branch:

   ```bash
   git fetch origin
   git worktree add ../<repo>-<ticket-id> -b <ticket-branch> origin/<feature-branch>
   ```

2. Copy the gitignored env files the ticket needs from the main checkout into the worktree, and tell the worker their values never go into output or commits.
3. Start a worker in that directory with whatever the harness offers: a background subagent whose working directory is the worktree, or a separate agent task (for example a Codex worktree task). Give it the worker prompt from the protocol reference.
4. When the harness can't run write-capable workers in an isolated checkout, implement tickets one at a time yourself, each in its own worktree and branch. Say in the final report that the review wasn't independent.

## Review rounds

Send findings to the same worker through the harness's mechanism for continuing an agent. When a worker can't be continued, start a new one on the same worktree and branch with the original brief, the findings and the prior responses.

## Pull requests

- Open PRs with `gh pr create --base <feature-branch> --head <ticket-branch>`.
- Wait for CI with `gh pr checks <n> --watch --fail-fast`, bounded by the harness's command timeout; on timeout, report the pending checks rather than looping.
- Read review comments with `gh pr view <n> --comments` and `gh api repos/<owner>/<repo>/pulls/<n>/comments`.

## Notifications

`Notify: push` has no plain equivalent: report the blockers in the thread and in the integration record. `Notify: skill:<name>` runs that skill.

## Cleanup

After a ticket PR merges, `git worktree remove ../<repo>-<ticket-id>` once its tree is clean, and delete the local branch.
