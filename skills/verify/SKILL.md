---
name: verify
description: Proof that a change works, from real gate output. Use after editing code and before claiming done, committing, pushing, or opening a PR.
---

# Verify

`scripts/verify.mjs` turns the project's "after you change X, run Y" rules into gates derived from the diff, runs them, and prints a verdict. The gates live in `.agents/config/verify.json`, written by the `setup-workflow` skill; mechanical code rules live in the project's linter, which a gate runs. The verdict is the **proof**: an artifact a reviewer can trust, unlike a self-report. "It compiles" or "tests should pass" is a claim; a `GATE ... PASS` line is proof.

## Steps

1. **Plan.** `node .agents/skills/verify/scripts/verify.mjs --plan` lists each gate, its exact command, and the files that triggered it. Done when every changed area you expect appears; a missing area means the config is wrong, so report it rather than work around it.
2. **Run.** `node .agents/skills/verify/scripts/verify.mjs --run`. It stops at the first failing gate; add `--keep-going` to see every gate. Done when the run ends with `VERDICT=PASS`.
3. **Fix and rerun** until `VERDICT=PASS`, or until a remaining failure is proven to be outside your change (see below).
4. **Report.** Paste the machine block (every `GATE` line plus `VERDICT=`) into your final message or PR body.
5. **UI changes** need behaviour proof as well: when `docs/agents/workflow.md` names a live-QA skill, run it. Gates prove the code is consistent; live QA proves the screen works.

Flags: `--base <ref>` diffs against that ref instead of the merge-base with the first resolvable ref in the config's `base` (default `origin/main`, then `main`); `--skip <gate>` (repeatable) skips a gate by name; `--config <path>` reads another config. The diff always covers committed, staged, unstaged and untracked work.

A missing or invalid config fails with `VERDICT=FAIL` and says why. Run `setup-workflow` to create it; never treat a missing config as a pass. A config that still has the old regex `rules` or `ignoreComment` keys is invalid; migrate it with the last section of [`references/lint-rules.md`](references/lint-rules.md).

## Reading the verdict

```text
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

## Project rules are lint rules

Mechanical code rules from AGENTS.md ("no type casts", "no `.only` in tests", "no `console.log` in the web app") are enforced by the project's linter, never by regex: the linter parses the code, so it doesn't trip on strings, comments or formatting. A lint gate in `verify.json` runs it on the changed files. How to express each rule, freeze existing debt and require reasons on disables is in [`references/lint-rules.md`](references/lint-rules.md).

When the lint gate fails, handle each finding in this order:

1. **Fix it** the way the rule's message and the project's AGENTS.md describe.
2. If it is a false positive, or genuinely unavoidable, disable that rule on that line with a reason, in the linter's own syntax:

   ```ts
   // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- third-party typing omits `data`; validated by zod above
   ```

   A disable without a reason is not acceptable, and the project's lint config should reject it. List every disable you add in the report.
3. Never edit the linter's suppressions baseline to pass; it only shrinks, by pruning debt that has been fixed.

## Changing the gates

Edit `.agents/config/verify.json` when a gate changes; a new code rule goes in the lint config instead. Confirm with `--plan` on a diff that should trigger the change. The shape:

```json
{
  "base": ["origin/main", "main"],
  "ignore": ["**/*.md"],
  "gates": [
    {
      "name": "test:web",
      "why": "vitest tests that import the changed modules",
      "when": [{ "paths": ["apps/web/src/**/*.ts"], "exclude": ["**/*.d.ts"], "status": ["A", "M", "R", "C", "?"] }],
      "run": ["pnpm", "exec", "vitest", "related", "--run", "{files}"],
      "cwd": "apps/web"
    }
  ]
}
```

- Gates run in config order, so put cheap and prerequisite gates first. `ignore`d files never trigger a gate.
- `when` is a list of matchers, any of which can trigger the gate; within a matcher, `paths`, `exclude` and `status` must all hold. `status` uses git letters (`A C D M R T U`) plus `?` for untracked; leave it out to match every status, including deletions. Globs are repo-relative: `**` spans directories, `{a,b}` alternates, and a bare `*.md` matches the root only.
- `"{files}"` in `run` expands to the matched paths, relative to `cwd` when set; files outside `cwd` are dropped, and a gate left with no files is not planned.
- A full example for a pnpm TypeScript monorepo is in `examples/verify.json`. The engine's tests: `node --test .agents/skills/verify/scripts/verify.test.mjs`.
