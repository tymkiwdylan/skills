# Issue tracker: Linear

Issues, specs and tickets for this repo live in Linear, workspace **`<workspace urlKey>`**, team **<team name>** (key **`<KEY>`**; issues are `<KEY>-123`). Use the Linear MCP server **`<server name>`** (tools prefixed `mcp__<server name>__`). Before the first write of a session, call `get_workspace` and confirm the `urlKey`. When several Linear servers are configured, never fall back to another one. If the tools are missing, stop and ask the user to authenticate the server.

## Conventions

Read before you write: fetch the issue, its comments, labels, parent, sub-issues and relations before changing anything. Batch related writes, then summarise what changed, with identifiers.

- **Create**: `save_issue` without `id`, with `team: "<KEY>"`, `title`, `description` (markdown), `labels`, `project`, and `parentId` for sub-issues.
- **Update**: `save_issue` with `id`. Change labels with `addLabels` / `removeLabels`, never `labels`, which replaces the whole set.
- **Read**: `get_issue` plus `list_comments`.
- **List**: `list_issues` filtered by team, label, state, parent, project or assignee.
- **Comment**: `save_comment`.
- **Close**: `save_issue` with `state: "Done"` or `state: "Canceled"`, after a comment saying why.
- **Blocking**: native relations only. `save_issue` with `blockedBy: ["<KEY>-59"]` (or `blocks`); remove with `removeBlockedBy` / `removeBlocks`. Never write "Blocked by" as prose.

Workflow states: <Triage → Backlog → Todo → In Progress → In Review → Done, plus Canceled and Duplicate>. Leave priority, estimate and cycle unset unless the user asks.

## Projects

<Projects are long-lived themes, not one per spec: list them with `list_projects` and file every issue into the owning one. Don't create projects; ask when nothing fits.>

## Specs and tickets

- **Spec** (from `to-spec`): one parent issue in the owning project. Body: Summary / What to build / Acceptance criteria (checklist) / Out of scope.
- **Tickets** (from `create-tickets`): sub-issues of the spec (`parentId`) in the same project, created blockers first so `blockedBy` can reference earlier siblings. Each carries a ticket ID prefix in its title (`M1-B1-T02: …`) and one classification label from `triage-labels.md`.
- **Integration record** (from `create-tickets`, kept current by `implement-tickets`): a document on the project.
- A ticket is unblocked when every issue blocking it is Done.

## Branches and pull requests

- Branch from the issue's `gitBranchName` (from `get_issue`) so Linear links the branch.
- Every PR body carries a magic word: `Fixes <KEY>-66` for the ticket it completes; `Part of <KEY>-55` for a parent or partial work.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(`triage` reads this flag.)_

## When a skill says "publish to the issue tracker"

Create a Linear issue in team `<KEY>`, in the owning project, following the rules above.

## When a skill says "fetch the relevant ticket"

Resolve the identifier or URL with `get_issue`, then read `list_comments`, labels, parent, sub-issues and relations.
