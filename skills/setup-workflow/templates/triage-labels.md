# Triage labels

The skills speak in canonical roles. This file maps each role to the label or state this repo's tracker actually uses. Edit the right-hand column to match your vocabulary; skills apply the existing strings and never create near-duplicates.

## Triage roles

Used by `triage` and by `to-spec`.

| Role | In this tracker | Meaning |
| --- | --- | --- |
| `needs-triage` | <state **Triage** \| label `needs-triage`> | A maintainer needs to evaluate it |
| `needs-info` | <label `needs-info`> | Waiting on the reporter |
| `ready-for-agent` | <label **`agent-ready`**> | Fully specified; an agent can take it unattended |
| `ready-for-human` | <label **`HITL`**> | Needs a person: a decision, a production action, manual verification, or human implementation |
| `wontfix` | <state **Canceled** \| label `wontfix`> | Will not be actioned |

`ready-for-agent`, `ready-for-human` and `needs-info` are mutually exclusive: when applying one, remove the others.

## Ticket classifications

Used by `create-tickets` and `implement-tickets`. Each ticket carries exactly one.

| Classification | Label | Meaning |
| --- | --- | --- |
| `agent-ready` | <same as `ready-for-agent`> | Repository work an agent may implement |
| `HITL` | <same as `ready-for-human`> | Needs a person; agents prepare evidence but never close it |
| `gate` | <`gate`> | A live production action; needs explicit authorization when it runs |
| `external-blocked` | <`external-blocked`> | Waits on a third party |
| `deferred` | <`deferred`> | Excluded by a recorded decision |
| `client-question` | <`client-question`> | An open business question; blocks the tickets it relates to |

Create a missing label the first time a skill needs it.

## Category roles

| Role | Label |
| --- | --- |
| `bug` | <`bug`> |
| `enhancement` | <`enhancement`> |
