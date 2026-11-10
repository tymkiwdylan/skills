# Harness: OpenBot

Applies when `docs/agents/workflow.md` says `Harness: openbot`: the parent is an OpenBot agent, usually the lead of a goal channel. OpenBot tools appear as `openbot.*` (run through `openbot.tool_call`) or with a prefix such as `mcp__openbot__`. If they are missing, fall back to [harness-plain.md](harness-plain.md).

OpenBot agents share one computer and one filesystem, so every worker, native or teammate, gets its own worktree outside the main checkout.

## Ending a turn

In a goal channel, ending the parent's turn closes its channel task. Nothing wakes the parent later to continue the wave, so work left pending at that moment stalls silently.

- Never end a turn while work you started is pending (running workers, PRs without a verification block or a review, unmerged tickets), unless you are waiting on a `channel_assign`: the channel keeps the task open and resumes it when the assignment returns.
- Native subagents and shell commands running in the background do not keep the channel task open. A background command still wakes the agent, but its task is already closed, so it can't report back through it. Wait for them in the same turn: launch subagents in the foreground (see Dispatching workers), and watch long shell runs, such as a queue of full-suite runs, with a bounded watch loop on their log.
- If you must end the turn while something still runs, post a channel result first, with what is done, what is still running and what happens when it finishes.
- Finish every channel task with `openbot.channel_result`. If you must stop early (a usage limit, a blocker, a human decision), post a result that says what is done, what is pending and who has to act.

## Dispatching workers

Every task or worker name starts with the ticket's tracker identifier, per the protocol reference.

- **Same model as the parent:** when the parent's provider has a native subagent tool with worktree isolation (Claude: `Agent` with `description: "<tracker-id> implement"`, `isolation: "worktree"`, `run_in_background: false`), launch a wave's workers in one message so they run concurrently, and wait for all of them in the same turn. In a goal channel, don't run them in the background (see Ending a turn). The isolation starts from the parent's local commit, so the worker prompt's first step is `git fetch origin && git switch -c <ticket-branch> origin/<feature-branch>`.
- **Another model, or a worker the engineer should see:** give the ticket to a teammate. Create the worktree first, as in the plain harness (`git worktree add ../<repo>-<ticket-id> -b <ticket-branch> origin/<feature-branch>`). Then:
  - in a goal channel, call `openbot.channel_assign` with the worker prompt as `task`, the PR and verify block as `expectedResult`, and `resources: ["workspace:<absolute worktree path>"]`. Tasks that declare the same worktree run one after the other; tasks on different worktrees run in parallel. Use `dependencies` for tickets that must wait.
  - outside a channel, call `openbot.send_message` with `expectsReply: true`, then end the turn; the reply arrives as a new turn.
  - A teammate sees none of the parent's conversation: the worker prompt must stand alone, with the worktree path, branch, ticket, documents and gates.
- Copy the gitignored env files a ticket needs into its worktree, as in the plain harness, and say their values never go into output, commits or channel messages.

## Review rounds

- **Native subagent:** continue it with `SendMessage`, so it keeps its worktree and context.
- **Teammate:** assign the next round to the same teammate on the same worktree, with the findings, the worker's earlier responses and any unresolved objections. Title it `<tracker-id> fix round <n>`.
- **Independent review:** when the channel has a reviewer on another model, assign it `review-diff` on the PR (`<tracker-id> review`) in parallel with your own review. Its findings are evidence; the parent still reviews the PR personally.

## Pull requests

- Open PRs with `gh pr create --base <feature-branch> --head <ticket-branch>`. OpenBot has no thread-linked PR list: the tracker magic word in the PR body (`Refs ABC-231`) links the PR to the issue, and the PR URL goes in the channel result.
- **Waiting for CI, up to about 15 minutes:** in a goal channel, run `gh pr checks <n> --watch --fail-fast --interval 30` in the same turn. Outside a channel it may run as a background command (Claude: Bash with `run_in_background: true`); the agent wakes when the command exits. Don't loop with `sleep`.
- **Waiting for a teammate's review:** in a goal channel, assign the review with `openbot.channel_assign` and end the turn. The channel resumes the parent task when the review returns.
- **Longer waits, or waiting for a human review:** open `openbot.await_event` with a note naming the PRs and what to check, then end the turn. A run of the agent's PR-watch routine wakes it (pass its `routineId`). Without such a routine, post a channel result with the pending checks and stop instead; never stop without one.
- Read review comments with `gh pr view <n> --comments` and `gh api repos/<owner>/<repo>/pulls/<n>/comments`.

## Notifications

`Notify: push` means the blocker batch goes in the parent's channel result or chat answer; OpenBot notifies the engineer. `Notify: skill:<name>` runs that skill. Post to Slack, Discord or Telegram only when `workflow.md` names the place.

## Usage limits

OpenBot does not resume an interrupted worker. When a worker stops on a provider usage limit, record it in the integration record and redispatch the ticket on the same worktree and branch in a later turn, with the original brief and the work so far.

## Cleanup

After a ticket PR merges, `git worktree remove ../<repo>-<ticket-id>` once its tree is clean, and delete the local branch. Native worktree subagents are cleaned up automatically when unchanged.
