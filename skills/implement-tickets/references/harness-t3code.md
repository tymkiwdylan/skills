# Harness: T3 Code on Claude Code

Applies when `docs/agents/workflow.md` says `Harness: t3code`. T3 tools may carry a prefix such as `mcp__t3-code__`; the names below omit it. If they don't show in the tool list, make one direct attempt (`orchestrator_capabilities`) before falling back to [harness-plain.md](harness-plain.md).

## Dispatching workers

Workers are subagents owned by the parent thread, never new top-level threads. Use `t3_thread_launch` only when the engineer explicitly asks for separate threads.

- **Same model as the parent:** the native `Agent` tool with `isolation: "worktree"` and `run_in_background: true`. Launch a wave's workers in one message so they run concurrently.
- **Another model or provider:** `delegate_task` with `isolation: "worktree"`, a target from `orchestrator_capabilities`, and a stable `clientRequestId` per ticket and round. Keep each returned `taskId`; manage it with `task_status` and `task_cancel`.

Both isolations start from the parent's local commit, and uncommitted edits are not copied. So the worker prompt's first step is `git fetch origin && git switch -c <ticket-branch> origin/<feature-branch>`. Each worktree also starts without gitignored env files; when tickets need them, list the files to copy from the main checkout (the first path in `git worktree list`) and say their values never go into output or commits.

## Review rounds

- **Native subagent:** continue the same worker with `SendMessage`, so it keeps its worktree and context.
- **`delegate_task`:** each round is a new `delegate_task` call with the original brief, the prior findings, the worker's responses and any unresolved objections, plus "check out `<ticket-branch>` from origin and continue on it". Use a new `clientRequestId` per round. Don't use `t3_thread_send` on the child thread.

## Pull requests

- Call `link_pull_request` with the full URL for every ticket PR and for the aggregate PR as soon as it exists. Before finishing, `list_thread_pull_requests` and link any that are missing. If linking fails, report it.
- To wait for CI or reviews on a PR, call `watch_pull_request` and end the turn; T3 wakes the thread when checks finish, someone comments, or the branch conflicts. Don't poll.
- When handing back to the engineer, `unwatch_pull_request` on every watched PR first.

## Notifications

`Notify: push` uses the `PushNotification` tool, one message per new batch of blockers.

## Cleanup

After a ticket PR merges, its worktree has nothing to keep. Native `isolation: "worktree"` agents are cleaned up automatically when unchanged; remove any others with `git worktree remove` once the branch is merged and the tree is clean.
