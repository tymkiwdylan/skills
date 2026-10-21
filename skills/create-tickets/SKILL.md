---
name: create-tickets
description: Turn an approved plan or scope into a dependency-aware ticket map that `implement-tickets` can execute, written to the repo's issue tracker (Linear, GitHub or local markdown, per docs/agents/issue-tracker.md). Use when the user asks to create, plan, split or import tickets/issues; do not use to implement tickets or to decide unresolved business questions.
---

# Create a dependency-aware ticket map

Produce tickets an agent can implement without asking follow-up questions, and route every question that authoritative sources can't answer to the engineer as an explicit blocker.

## Read first

1. `docs/agents/issue-tracker.md`, `triage-labels.md`, `workflow.md` and `domain.md`. When they are missing, stop and ask the user to run `setup-workflow`.
2. Applicable `AGENTS.md` / `CLAUDE.md`, the approved plan or scope the user names, and the scope, architecture, domain, decision and deployment documents it relies on.
3. The existing tracker: never duplicate existing tickets; extend or correct them.
4. The repository state, when tickets may already be implemented: merged PRs and branches decide the initial status, not assumptions.

## Ticket contract

Each ticket has a stable ID, `<milestone>-<block>-<ticket>` (for example `M2-B1-T03`), and these sections, written in the language `workflow.md` names:

- **Outcome**: the verifiable result.
- **Demonstration**: what a reviewer runs or sees.
- **Scope**: what is included.
- **Dependencies**: `Blocked by` ticket IDs (hard prerequisites only) and external inputs. Soft relationships are related, not blocking.
- **Parallelization contract**: the owning module(s) and merge preconditions.
- **Acceptance criteria**: observable, including negative authorization, concurrency, idempotency and failure cases where the risk calls for them.
- **Verification**: tests and checks.
- **Out of scope** and **Handoff evidence**.

A ticket restates requirements only enough to be actionable and links the authoritative document; it never becomes a second source of the requirement.

Give each ticket exactly one classification from `triage-labels.md`: `agent-ready`, `HITL`, `gate`, `external-blocked` or `deferred`. Add module labels from the architecture. Group tickets into milestones that follow the plan's delivery order and release gates.

## Unresolved questions

When the plan leaves a business decision open, don't choose an answer. Create a `client-question` ticket assigned to the engineer stating the question, why it can't be inferred, the options with a recommendation, and the tickets it blocks; make those tickets blocked by it.

## Validate before writing

Build the full map in memory first, then check:

- every dependency ID exists and the graph has no cycle;
- every ticket has acceptance criteria and verification;
- no ticket reaches into deferred scope or a possible future expansion;
- initial status is consistent: `Done` only with a merged PR whose blockers are `Done`; `Todo` only when every blocker is `Done`; everything else `Backlog`.

## Write to the tracker

Follow `issue-tracker.md` for every call, and write idempotently so a rerun never duplicates:

1. **Guard.** Linear: call `get_workspace` and confirm the `urlKey` before any write; never fall back to another configured server. GitHub: confirm `gh repo view` matches the configured repo. If the team, repo, or a needed workflow state is missing, ask the engineer to create it and make no writes until it exists.
2. **Containers.** Labels, project and milestones: reuse by name, create only what is missing.
3. **Pass 1, tickets.** Find each by its ticket-ID title prefix before creating. Set parent, project, milestone, labels, state and PR links, plus a one-line header naming the source and that requirements stay in the repository docs. Write repository links as repository paths.
4. **Pass 2, relations.** `blocked by` and `related to`, by resolved identifier, in the form `issue-tracker.md` prescribes.
5. **Integration record**, where `issue-tracker.md` says it lives: base and feature branches, full-suite commands and merge strategy from `workflow.md`, current status, and an empty wave log. `implement-tickets` keeps it current.
6. **Re-read** from the tracker and check the count, states, milestones, labels and relations against the in-memory map. Fix any discrepancy you caused.

Invoking this skill authorizes creating tickets in the configured tracker. It does not authorize deleting or cancelling existing tickets, or writing anywhere else.

## Hand off

Report the tracker location, ticket counts by status and classification, the first ready wave, the open `client-question` and `HITL` tickets, and any validation findings.
