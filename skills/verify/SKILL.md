---
name: verify
description: Proof that a change works, from real gate output. Use after editing code and before claiming done, committing, pushing, or opening a PR.
---

# Verify

`scripts/verify.mjs` turns the project's "after you change X, run Y" rules into gates derived from the diff, runs them, and prints a verdict. The gates and rules live in `.agents/config/verify.json`, written by the `setup-workflow` skill. The verdict is the **proof**: an artifact a reviewer can trust, unlike a self-report. "It compiles" or "tests should pass" is a claim; a `GATE ... PASS` line is proof.

## Steps

1. **Plan.** `node .agents/skills/verify/scripts/verify.mjs --plan` lists each gate, its exact command, and the files that triggered it. Done when every changed area you expect appears; a missing area means the config is wrong, so report it rather than work around it.
2. **Run.** `node .agents/skills/verify/scripts/verify.mjs --run`. It stops at the first failing gate; add `--keep-going` to see every gate. Done when the run ends with `VERDICT=PASS`.
3. **Fix and rerun** until `VERDICT=PASS`, or until a remaining failure is proven to be outside your change (see below).
4. **Report.** Paste the machine block (every `GATE` line plus `VERDICT=`) into your final message or PR body.
5. **UI changes** need behaviour proof as well: when `docs/agents/workflow.md` names a live-QA skill, run it. Gates prove the code is consistent; live QA proves the screen works.

Flags: `--base <ref>` diffs against that ref instead of the merge-base with the first resolvable ref in the config's `base` (default `origin/main`, then `main`); `--skip <gate>` (repeatable) skips a gate by name; `--rules` runs only the rule checker; `--config <path>` reads another config. The diff always covers committed, staged, unstaged and untracked work.

A missing or invalid config fails with `VERDICT=FAIL` and says why. Run `setup-workflow` to create it; never treat a missing config as a pass.

## Reading the verdict

```text
GATE rules PASS 0.1s
GATE typecheck PASS 41.2s
GATE eslint FAIL 3.0s
GATE test:web SKIP 0.0s (skipped after earlier failure)
VERDICT=FAIL
```

- `PASS`: every planned gate ran and passed.
- `FAIL`: a gate failed; the process exits non-zero. Its output is printed above the block.
- `PARTIAL`: nothing failed, but at least one gate was skipped. This is a gap in the proof, not a pass.
- `NOT_RUN`: printed by `--plan`. A plan is never proof.

## Proof bar

- Every planned gate is `PASS`, or named in your report with the reason it is not: `--skip test:api: needs a local Postgres, covered by CI job api-tests`.
- A failure you believe predates your change is proven, not asserted: show the same gate failing on the base, in a separate clean worktree (others may share this tree) or in CI on the base branch, and name it in the report.
- Rerun after your last edit; a verdict from before the final change proves nothing.

## Rule hits

The `rules` gate applies each configured regex to **added lines only**, so existing debt elsewhere in a file never blocks you. Each hit prints as `path:line rule severity message`; `error` fails the gate, `warn` only reports. Rules with `"code": true` ignore matches inside JS/TS comments and string literals. The checks are lexical heuristics, so a hit can occasionally be wrong; checks that need a parser belong in a lint gate.

Handle each hit in this order:

1. **Fix it** the way the rule's message and the project's AGENTS.md describe.
2. If it is a false positive, or genuinely unavoidable, put an ignore comment with a reason on the same line or the line above (the marker is the config's `ignoreComment`, default `verify-ignore`):

   ```ts
   // verify-ignore no-ts-cast: third-party typing omits `data`; validated by zod above
   ```

   An ignore comment without a reason is not honoured. List every ignore you add in the report.

## Changing the gates

Edit `.agents/config/verify.json` when a project rule changes, then confirm with `--plan` on a diff that should trigger the change. The shape:

```json
{
  "base": ["origin/main", "main"],
  "ignore": ["**/*.md"],
  "ignoreComment": "verify-ignore",
  "gates": [
    {
      "name": "test:web",
      "why": "vitest tests that import the changed modules",
      "when": [{ "paths": ["apps/web/src/**/*.ts"], "exclude": ["**/*.d.ts"], "status": ["A", "M", "R", "C", "?"] }],
      "run": ["pnpm", "exec", "vitest", "related", "--run", "{files}"],
      "cwd": "apps/web"
    }
  ],
  "rules": [
    { "id": "no-ts-cast", "severity": "error", "paths": ["**/*.ts"], "pattern": "\\bas\\s+(?!const\\b)[A-Za-z_{(\\[]", "code": true, "message": "no type casts" }
  ]
}
```

- Gates run in config order, so put cheap and prerequisite gates first. `ignore`d files never trigger a gate.
- `when` is a list of matchers, any of which can trigger the gate; within a matcher, `paths`, `exclude` and `status` must all hold. `status` uses git letters (`A C D M R T U`) plus `?` for untracked; leave it out to match every status, including deletions. Globs are repo-relative: `**` spans directories, `{a,b}` alternates, and a bare `*.md` matches the root only.
- `"{files}"` in `run` expands to the matched paths, relative to `cwd` when set; files outside `cwd` are dropped, and a gate left with no files is not planned.
- A full example for a pnpm TypeScript monorepo is in `examples/verify.json`. The engine's tests: `node --test .agents/skills/verify/scripts/verify.test.mjs`.
