# Issue tracker: local markdown

Issues, specs and tickets for this repo live as markdown files under `<.scratch>/`, committed with the code.

## Conventions

- One feature per directory: `<.scratch>/<feature-slug>/`.
- The spec is `<.scratch>/<feature-slug>/spec.md`.
- Tickets are one file each at `<.scratch>/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`; never one combined tickets file.
- Near the top of each ticket file: a `Status:` line (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`), a `Labels:` line (strings from `triage-labels.md`), and a `Blocked by: 01, 03` line when it has blockers.
- Comments append under a `## Comments` heading at the bottom of the file, each starting with the date and author.
- A ticket is unblocked when every file in its `Blocked by` line has `Status: Done`.

## Specs and tickets

- **Spec** (from `to-spec`): `spec.md`, with Summary / What to build / Acceptance criteria (checklist) / Out of scope.
- **Tickets** (from `create-tickets`): titled with their ticket ID (`# M1-B1-T02: …`) and an index in `<.scratch>/<feature-slug>/README.md`.
- **Integration record**: `<.scratch>/<feature-slug>/integration.md`.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(`triage` reads this flag.)_

## When a skill says "publish to the issue tracker"

Create the file under `<.scratch>/<feature-slug>/`, creating the directory if needed.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user normally passes the path or the ticket number.
