# Issue tracker: GitHub

Issues, specs and tickets for this repo live in GitHub Issues on `<owner>/<repo>`. Use the `gh` CLI; it infers the repo inside a clone.

## Conventions

- **Create**: `gh issue create --title "…" --body-file <file>` (or a heredoc for multi-line bodies), with `--label` for each label.
- **Read**: `gh issue view <n> --comments --json number,title,body,labels,comments,state`.
- **List**: `gh issue list --state open --label <label> --json number,title,labels`.
- **Comment**: `gh issue comment <n> --body "…"`.
- **Labels**: `gh issue edit <n> --add-label "…"` / `--remove-label "…"`.
- **Close**: `gh issue close <n> --comment "…"` (add `--reason "not planned"` for won't-do).
- **Blocking**: GitHub's native issue dependencies. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<n>/dependencies/blocked_by -F issue_id=<blocker database id>`; the database id comes from `gh api repos/<owner>/<repo>/issues/<blocker> --jq .id`, not the `#number`. Where dependencies are unavailable, put a `Blocked by: #12, #14` line at the top of the body instead.
- **Sub-issues**: link tickets to their spec with the sub-issues API (`gh api --method POST repos/<owner>/<repo>/issues/<spec>/sub_issues -F sub_issue_id=<ticket database id>`); where unavailable, add `Part of #<spec>` at the top of the ticket body and a task list in the spec.

## Specs and tickets

- **Spec** (from `to-spec`): one issue. Body: Summary / What to build / Acceptance criteria (checklist) / Out of scope.
- **Tickets** (from `create-tickets`): sub-issues of the spec, created blockers first, each titled with its ticket ID prefix (`M1-B1-T02: …`) and carrying one classification label from `triage-labels.md`.
- **Integration record**: a comment on the spec issue whose first line is `<!-- integration-record -->`; edit that comment in place rather than adding new ones.
- A ticket is unblocked when every issue blocking it is closed as completed.

## Branches and pull requests

- Every PR body carries a magic word: `Fixes #66` for the ticket it completes; `Refs #55` otherwise.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(`triage` reads this flag.)_

When set to `yes`, external PRs (author association `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR` or `NONE`) go through the same labels as issues, using `gh pr view`, `gh pr diff`, `gh pr edit` and `gh pr close`. Issues and PRs share one number space: resolve a bare `#42` with `gh pr view 42`, then `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue following the rules above.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <n> --comments`.
