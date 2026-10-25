# Project rules as lint rules

`verify` has no rule engine of its own. Every mechanical rule from AGENTS.md lives in the project's linter, and a lint gate in `.agents/config/verify.json` runs it. A linter works on the syntax tree, so `"x as Foo"` in a string, `as const`, an `import * as` or a call split across lines never confuse it, and it catches forms a line regex can't see (`<Foo>value`).

The examples use ESLint flat config; other linters have the same three pieces (rules, a debt baseline, reason-required disables) under other names.

## Pick the cheapest exact rule

Try these in order and stop at the first that expresses the rule exactly:

1. **An existing rule**, from core, `typescript-eslint`, or the framework's plugin. Most AGENTS.md rules already exist.
2. **A selector rule**: `no-restricted-syntax` (AST selectors), `no-restricted-imports`, `no-restricted-properties` or `no-restricted-globals`, each with the AGENTS.md wording as its `message`.
3. **A local custom rule** in the repo (for example `eslint-rules/<name>.js`, loaded as a local plugin) when the rule depends on context a selector can't express, such as "only inside a function registered as a public endpoint". Write its `RuleTester` cases first, valid and invalid, and run them in the project's test suite.

Common translations:

| Rule | Lint rule |
| --- | --- |
| No type casts | `@typescript-eslint/consistent-type-assertions` with `{ "assertionStyle": "never" }`; allows `as const` |
| No `.only` in tests | the test framework's `no-focused-tests`, or the `no-restricted-syntax` selector below |
| No `debugger` | `no-debugger` |
| No `console.log` | `no-console` with `{ "allow": ["warn", "error"] }`, scoped with `files` |
| Don't import X from Y | `no-restricted-imports` with `paths` / `patterns` |

```js
// eslint.config.js (excerpt; typescript-eslint is configured alongside)
import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";

export default [
  comments.recommended,
  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      "@eslint-community/eslint-comments/require-description": "error",
      "no-debugger": "error",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }] },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "CallExpression[callee.object.name=/^(it|test|describe)$/][callee.property.name='only']",
        message: "remove .only so the whole suite runs",
      }],
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    rules: { "no-console": ["error", { allow: ["warn", "error"] }] },
  },
];
```

Use `error`, not `warn`: the lint gate should run with `--max-warnings 0`, so a warning fails it anyway, and a rule that is fine to break isn't a rule.

## Freeze existing debt instead of linting only added lines

A new rule usually finds old violations. Don't scope it to added lines; record the debt once with ESLint's bulk suppressions (ESLint 9.24+):

```bash
pnpm exec eslint --suppress-rule @typescript-eslint/consistent-type-assertions .   # or --suppress-all
```

This writes `eslint-suppressions.json` with a count per file and rule. Commit it. From then on:

- A file at or under its recorded count passes, so old debt never blocks unrelated work.
- A file over its count fails, reporting every hit of that rule in the file, so new violations can't hide among old ones.
- When debt is fixed, ESLint exits with code 2 and asks for `eslint --prune-suppressions`. Run it and commit the smaller file. The baseline only shrinks.

ESLint reads the file from its working directory, so generate it from the directory the lint gate runs in, or pass the same `--suppressions-location` in both places.

Other linters have their own form, for example `golangci-lint run --new-from-rev <base>`. When a linter has no baseline, its gate still runs only on changed files (`{files}`), and existing debt in a file you touch is yours to fix.

## Require a reason on every disable

The escape hatch is the linter's own disable comment, with a reason after `--`:

```ts
// eslint-disable-next-line no-console -- CLI entry point; stdout is the interface
```

`@eslint-community/eslint-comments/require-description` rejects a disable without a reason, and `reportUnusedDisableDirectives: "error"` rejects a disable that no longer suppresses anything. For other linters, use the equivalent check (golangci-lint's `nolintlint` with `require-explanation`).

## Migrating an old `rules` block

Older configs carried regex `rules` and an `ignoreComment`; `verify` now rejects both keys. For each rule:

1. Find its lint equivalent with the ladder above and add it to the lint config, keeping the `message`.
2. Freeze the debt it reports with `--suppress-rule <rule>`.
3. Rewrite each `verify-ignore <rule>: <reason>` comment as `eslint-disable-next-line <lint rule> -- <reason>`.
4. Delete `rules` and `ignoreComment` from `verify.json`, and make sure a lint gate covers every path the old rule did.
5. Prove it: `verify --plan` lists the lint gate for a change in those paths, and a deliberate violation fails it.
