import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkRules,
  formatGateLine,
  globToRegExp,
  matchesGlob,
  matchesWhen,
  parseAddedLines,
  parseArgs,
  parseNameStatus,
  planGates,
  stripCode,
  summarize,
  validateConfig,
} from "./verify.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "verify.mjs");

const modified = (...paths) => paths.map((path) => ({ status: "M", path }));
const config = (overrides = {}) => validateConfig({ gates: [], ...overrides });
const gateNames = (changes, cfg) => planGates(changes, cfg).map((gate) => gate.name);

// ---------- argument parsing ----------

test("defaults to plan mode against the configured base", () => {
  assert.deepEqual(parseArgs([]), {
    mode: "plan",
    base: undefined,
    config: undefined,
    keepGoing: false,
    skip: [],
  });
});

test("parses run mode, base, config, keep-going and repeatable skip", () => {
  assert.deepEqual(
    parseArgs(["--run", "--base", "HEAD~2", "--keep-going", "--skip", "a", "--skip=b", "--config", "x.json"]),
    { mode: "run", base: "HEAD~2", config: "x.json", keepGoing: true, skip: ["a", "b"] },
  );
  assert.equal(parseArgs(["--rules"]).mode, "rules");
  assert.equal(parseArgs(["--base=main"]).base, "main");
  assert.equal(parseArgs(["--config=c.json"]).config, "c.json");
});

test("rejects unknown flags and dangling values", () => {
  assert.throws(() => parseArgs(["--frobnicate"]), /unknown argument/);
  assert.throws(() => parseArgs(["--base"]), /--base needs a ref/);
  assert.throws(() => parseArgs(["--skip", "--run"]), /--skip needs a gate name/);
  assert.throws(() => parseArgs(["--config"]), /--config needs a path/);
});

// ---------- git output parsing ----------

test("parses -z name-status including renames and copies", () => {
  const z = ["M", "a.ts", "R087", "old.ts", "new.ts", "D", "gone.ts", "C100", "src.ts", "copy.ts", ""].join("\0");
  assert.deepEqual(parseNameStatus(z), [
    { status: "M", path: "a.ts" },
    { status: "R", path: "new.ts", oldPath: "old.ts" },
    { status: "D", path: "gone.ts" },
    { status: "C", path: "copy.ts", oldPath: "src.ts" },
  ]);
});

test("collects only added line numbers per new path from -U0 diffs", () => {
  const diff = [
    "diff --git a/x.ts b/x.ts",
    "--- a/x.ts",
    "+++ b/x.ts",
    "@@ -3 +3,2 @@ ctx",
    "-old",
    "+new three",
    "+++looks like a header but is content",
    "@@ -10,2 +11,0 @@",
    "-removed",
    "-removed",
    "@@ -20,0 +20 @@",
    "+tail",
    "\\ No newline at end of file",
    "diff --git a/gone.ts b/gone.ts",
    "--- a/gone.ts",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-bye",
    "diff --git a/old name.ts b/new name.ts",
    "--- a/old name.ts",
    "+++ b/new name.ts",
    "@@ -1,0 +2 @@",
    "+moved and edited",
    "",
  ].join("\n");
  const added = parseAddedLines(diff);
  assert.deepEqual([...added.get("x.ts")], [3, 4, 20]);
  assert.deepEqual([...added.get("new name.ts")], [2]);
  assert.equal(added.has("gone.ts"), false);
});

// ---------- globs ----------

test("** spans zero or more directories, * and ? stay inside one segment", () => {
  assert.ok(matchesGlob("src/a.ts", "src/**/*.ts"));
  assert.ok(matchesGlob("src/x/y/a.ts", "src/**/*.ts"));
  assert.ok(matchesGlob("a.md", "**/*.md"));
  assert.ok(matchesGlob("docs/deep/a.md", "**/*.md"));
  assert.ok(matchesGlob("apps/web/anything/at/all", "apps/web/**"));
  assert.ok(!matchesGlob("src/x/a.ts", "src/*.ts"));
  assert.ok(matchesGlob("a1.ts", "a?.ts"));
  assert.ok(!matchesGlob("a/.ts", "a?.ts"));
  assert.ok(!matchesGlob("lib/a.ts", "src/**/*.ts"));
  assert.ok(!matchesGlob("docs/a.md", "*.md"), "a bare pattern matches the root only");
});

test("braces alternate and regex specials are literal", () => {
  assert.ok(matchesGlob("a.tsx", "*.{ts,tsx}"));
  assert.ok(matchesGlob("a.ts", "*.{ts,tsx}"));
  assert.ok(!matchesGlob("a.js", "*.{ts,tsx}"));
  assert.ok(matchesGlob("pkg/a+b(1).ts", "pkg/a+b(1).ts"));
  assert.ok(!matchesGlob("pkgXa.ts", "pkg.a.ts"));
  assert.equal(globToRegExp("a/**").test("a/b/c"), true);
});

// ---------- matchers ----------

test("matcher fields are ANDed and matchers are ORed", () => {
  const when = [
    { paths: ["src/**/*.ts"], exclude: ["**/_generated/**"] },
    { status: ["D"] },
  ];
  assert.ok(matchesWhen({ status: "M", path: "src/a.ts" }, when));
  assert.ok(!matchesWhen({ status: "M", path: "src/_generated/api.ts" }, when));
  assert.ok(matchesWhen({ status: "D", path: "src/_generated/api.ts" }, when), "second matcher");
  assert.ok(!matchesWhen({ status: "M", path: "lib/a.ts" }, when));
});

test("status filters use name-status letters plus ? for untracked", () => {
  const when = [{ paths: ["**/*.ts"], status: ["A", "M", "?"] }];
  assert.ok(matchesWhen({ status: "?", path: "new.ts" }, when));
  assert.ok(!matchesWhen({ status: "D", path: "gone.ts" }, when));
});

test("renames match the old path only when the matcher selects R", () => {
  const rename = { status: "R", path: "lib/b.ts", oldPath: "src/a.ts" };
  assert.ok(!matchesWhen(rename, [{ paths: ["src/**"] }]));
  assert.ok(matchesWhen(rename, [{ paths: ["src/**"], status: ["R"] }]));
  assert.ok(matchesWhen(rename, [{ paths: ["lib/**"] }]));
});

// ---------- gate planning ----------

const monorepo = config({
  ignore: ["**/*.md"],
  gates: [
    { name: "typecheck", why: "tsc across the workspace", when: [{ paths: ["**/*.{ts,tsx}"] }], run: ["pnpm", "typecheck"] },
    {
      name: "eslint",
      when: [{ paths: ["**/*.{ts,tsx}"], status: ["A", "M", "R", "C", "?"] }],
      run: ["pnpm", "exec", "eslint", "--", "{files}"],
    },
    {
      name: "test:web",
      when: [{ paths: ["apps/web/src/**/*.{ts,tsx}"], status: ["A", "M", "R", "C", "?"] }],
      run: ["pnpm", "exec", "vitest", "related", "--run", "{files}"],
      cwd: "apps/web",
    },
  ],
  rules: [{ id: "no-todo", severity: "warn", paths: ["**/*.ts"], pattern: "TODO", message: "no TODOs" }],
});

test("no changes plans only the rules gate", () => {
  assert.deepEqual(gateNames([], monorepo), ["rules"]);
});

test("rules gate is planned only when rules are configured", () => {
  assert.deepEqual(gateNames(modified("a.ts"), config()), []);
});

test("ignored files never trigger a gate", () => {
  assert.deepEqual(gateNames(modified("docs/x.md", "README.md"), monorepo), ["rules"]);
});

test("gates run in config order with {files} expanded", () => {
  const gates = planGates(modified("apps/web/src/App.tsx", "packages/ui/a.ts"), monorepo);
  assert.deepEqual(gates.map((g) => g.name), ["rules", "typecheck", "eslint", "test:web"]);
  assert.deepEqual(gates[1].command, ["pnpm", "typecheck"]);
  assert.deepEqual(gates[2].command, ["pnpm", "exec", "eslint", "--", "apps/web/src/App.tsx", "packages/ui/a.ts"]);
  assert.deepEqual(gates[3].command, ["pnpm", "exec", "vitest", "related", "--run", "src/App.tsx"]);
  assert.equal(gates[3].cwd, "apps/web");
  assert.equal(gates[1].cwd, undefined);
});

test("{files} drops paths outside cwd and skips a gate left with none", () => {
  const cfg = config({
    gates: [{ name: "web", when: [{ paths: ["**/*.ts"] }], run: ["t", "{files}"], cwd: "apps/web" }],
  });
  assert.deepEqual(gateNames(modified("packages/a.ts"), cfg), []);
});

test("deleted files typecheck but are not passed to file-taking gates", () => {
  assert.deepEqual(gateNames([{ status: "D", path: "src/old.ts" }], monorepo), ["rules", "typecheck"]);
});

test("every planned gate carries a reason naming its trigger", () => {
  const gates = planGates(modified("a.ts", "b.ts", "c.ts", "d.ts"), monorepo);
  for (const gate of gates) assert.ok(gate.reason.length > 0, gate.name);
  assert.match(gates[1].reason, /^tsc across the workspace; triggered by a\.ts, b\.ts, c\.ts \(\+1 more\)$/);
  assert.match(gates[2].reason, /^triggered by /);
});

// ---------- code stripping ----------

test("stripCode blanks comments and string contents but keeps layout", () => {
  const source = 'const a = "x as Foo"; // y as Bar\n/* z as Baz */ const b = `t ${c as D} u`;';
  const stripped = stripCode(source);
  assert.equal(stripped.length, source.length);
  assert.equal(stripped.split("\n").length, 2);
  assert.doesNotMatch(stripped, /Foo|Bar|Baz/);
  assert.match(stripped, /c as D/);
});

test("stripCode treats regex literals as opaque", () => {
  assert.match(stripCode("const r = /'/g; const s = x as Foo;"), /x as Foo/);
});

// ---------- rules ----------

const castRule = {
  id: "no-ts-cast",
  severity: "error",
  paths: ["**/*.{ts,tsx}"],
  pattern: "\\bas\\s+(?!const\\b)[A-Za-z_{(\\[]",
  code: true,
  message: "avoid type casts",
};
const rulesOf = (path, source, added = "all", rules = [castRule], extra = {}) =>
  checkRules(path, source, added, config({ rules, ...extra })).map((f) => `${f.line} ${f.rule}`);

test("applies a rule's regex to added lines only", () => {
  const source = "const a = b as Foo;\nconst c = d as Bar;";
  assert.deepEqual(rulesOf("a.ts", source, new Set([2])), ["2 no-ts-cast"]);
  assert.deepEqual(rulesOf("a.ts", source, new Set()), []);
  assert.deepEqual(rulesOf("a.ts", source), ["1 no-ts-cast", "2 no-ts-cast"]);
});

test("rules only apply to their paths and not their excludes", () => {
  const rule = { ...castRule, exclude: ["**/*.test.ts"] };
  assert.deepEqual(rulesOf("a.mjs", "const a = b as Foo;", "all", [rule]), []);
  assert.deepEqual(rulesOf("a.test.ts", "const a = b as Foo;", "all", [rule]), []);
});

test("code: true ignores matches inside comments and strings", () => {
  const source = 'const k = ["a"] as const;\n// cast as Foo in prose\nconst m = "treat as Foo";\nconst n = o as Foo;';
  assert.deepEqual(rulesOf("a.ts", source), ["4 no-ts-cast"]);
  const raw = { ...castRule, code: false };
  assert.deepEqual(rulesOf("a.ts", source, "all", [raw]), ["2 no-ts-cast", "3 no-ts-cast", "4 no-ts-cast"]);
});

test("flags are honoured", () => {
  const rule = { id: "no-console", severity: "error", paths: ["**"], pattern: "CONSOLE\\.log", flags: "i", message: "m" };
  assert.deepEqual(rulesOf("a.js", "console.log(1)", "all", [rule]), ["1 no-console"]);
});

test("ignore comment with a reason suppresses that rule on the same or next line", () => {
  const source = [
    "const a = b as Foo; // verify-ignore no-ts-cast: library type is wrong",
    "// verify-ignore no-ts-cast: narrowing a JSON.parse result at the boundary",
    "const c = d as Bar;",
    "const e = f as Baz; // verify-ignore no-ts-cast",
    "const g = h as Qux; // verify-ignore other-rule: wrong rule",
  ].join("\n");
  assert.deepEqual(rulesOf("a.ts", source), ["4 no-ts-cast", "5 no-ts-cast"]);
});

test("the ignore comment marker is configurable", () => {
  const source = "const a = b as Foo; // acme-ok no-ts-cast: boundary";
  assert.deepEqual(rulesOf("a.ts", source, "all", [castRule], { ignoreComment: "acme-ok" }), []);
  assert.deepEqual(rulesOf("a.ts", source), ["1 no-ts-cast"]);
});

test("one finding per rule per line, carrying path, severity and message", () => {
  const findings = checkRules("a.ts", "x as A; y as B;", "all", config({ rules: [castRule] }));
  assert.deepEqual(findings, [
    { path: "a.ts", line: 1, rule: "no-ts-cast", severity: "error", message: "avoid type casts" },
  ]);
});

// ---------- config validation ----------

test("fills defaults", () => {
  const cfg = validateConfig({ gates: [] });
  assert.deepEqual(cfg.base, ["origin/main", "main"]);
  assert.deepEqual(cfg.ignore, []);
  assert.equal(cfg.ignoreComment, "verify-ignore");
  assert.deepEqual(cfg.rules, []);
});

test("rejects unknown keys, wrong types and bad regexes with precise paths", () => {
  assert.throws(() => validateConfig({ gates: [], extra: 1 }), /config: unknown key "extra"/);
  assert.throws(() => validateConfig({}), /config\.gates: required/);
  assert.throws(() => validateConfig({ gates: {} }), /config\.gates: expected an array/);
  assert.throws(
    () => validateConfig({ gates: [{ name: "a", when: [{ paths: "src" }], run: ["x"] }] }),
    /config\.gates\[0\]\.when\[0\]\.paths: expected a non-empty array of strings/,
  );
  assert.throws(
    () => validateConfig({ gates: [{ name: "a", when: [{ paths: ["x"], status: ["Z"] }], run: ["x"] }] }),
    /config\.gates\[0\]\.when\[0\]\.status: unknown status "Z"/,
  );
  assert.throws(
    () => validateConfig({ gates: [{ name: "a", when: [{}], run: ["x"] }] }),
    /config\.gates\[0\]\.when\[0\]: needs paths, exclude or status/,
  );
  assert.throws(
    () => validateConfig({ gates: [{ name: "a", when: [{ paths: ["x"] }], run: [] }] }),
    /config\.gates\[0\]\.run: expected a non-empty array of strings/,
  );
  assert.throws(
    () => validateConfig({ gates: [{ name: "a", when: [{ paths: ["x"] }], run: ["x"], cwd: "../up" }] }),
    /config\.gates\[0\]\.cwd: must be a relative path inside the repository/,
  );
  assert.throws(
    () => validateConfig({ gates: [{ name: "a", when: [{ paths: ["x"] }], run: ["x"], bogus: true }] }),
    /config\.gates\[0\]: unknown key "bogus"/,
  );
  assert.throws(
    () => validateConfig({ gates: [{ name: "rules", when: [{ paths: ["x"] }], run: ["x"] }] }),
    /config\.gates\[0\]\.name: "rules" is reserved/,
  );
  assert.throws(
    () =>
      validateConfig({
        gates: [
          { name: "lint", when: [{ paths: ["x"] }], run: ["x"] },
          { name: "lint", when: [{ paths: ["y"] }], run: ["y"] },
        ],
      }),
    /config\.gates\[1\]\.name: "lint" is duplicated/,
  );
  assert.throws(
    () => validateConfig({ gates: [], rules: [{ id: "r", paths: ["**"], pattern: "(", message: "m" }] }),
    /config\.rules\[0\]\.pattern: invalid regular expression/,
  );
  assert.throws(
    () => validateConfig({ gates: [], rules: [{ id: "r", paths: ["**"], pattern: "x", flags: "g", message: "m" }] }),
    /config\.rules\[0\]\.flags: only "dimsuv" are allowed/,
  );
  assert.throws(
    () => validateConfig({ gates: [], rules: [{ id: "r", severity: "fatal", paths: ["**"], pattern: "x", message: "m" }] }),
    /config\.rules\[0\]\.severity: expected "error" or "warn"/,
  );
  assert.throws(
    () =>
      validateConfig({
        gates: [],
        rules: [
          { id: "r", paths: ["**"], pattern: "x", message: "m" },
          { id: "r", paths: ["**"], pattern: "y", message: "m" },
        ],
      }),
    /config\.rules\[1\]\.id: "r" is duplicated/,
  );
});

test("reports every problem at once", () => {
  assert.throws(
    () => validateConfig({ gates: [{ name: "", when: [], run: "x" }] }),
    (error) => error.message.split("\n").length === 3,
  );
});

test("the shipped example config validates", () => {
  const example = JSON.parse(readFileSync(join(here, "..", "examples", "verify.json"), "utf8"));
  const cfg = validateConfig(example);
  assert.ok(cfg.gates.length >= 3);
  assert.deepEqual(
    checkRules("apps/web/src/a.ts", "const a = b as Foo;", "all", cfg).map((f) => f.rule),
    ["no-ts-cast"],
  );
  const imports = 'import * as path from "node:path";\nexport { a as b } from "./x";\nconst k = [1] as const;';
  assert.deepEqual(checkRules("apps/web/src/a.ts", imports, "all", cfg), []);
});

// ---------- output ----------

test("formats machine-readable gate lines", () => {
  assert.equal(formatGateLine({ name: "eslint", status: "PASS", seconds: 3.04 }), "GATE eslint PASS 3.0s");
  assert.equal(formatGateLine({ name: "x", status: "SKIP", seconds: 0 }), "GATE x SKIP 0.0s");
});

test("verdict is FAIL on any failure, PARTIAL on skips, PASS otherwise", () => {
  assert.equal(summarize([{ status: "PASS" }, { status: "PASS" }]), "PASS");
  assert.equal(summarize([{ status: "PASS" }, { status: "SKIP" }]), "PARTIAL");
  assert.equal(summarize([{ status: "FAIL" }, { status: "SKIP" }]), "FAIL");
  assert.equal(summarize([]), "PASS");
});

// ---------- end to end ----------

function tempRepo(cfg) {
  const dir = mkdtempSync(join(tmpdir(), "verify-test-"));
  const git = (...args) => {
    const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], {
      cwd: dir,
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
  };
  git("init", "-q", "-b", "main");
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "a.ts"), "export const a = 1;\n");
  if (cfg) {
    mkdirSync(join(dir, ".agents", "config"), { recursive: true });
    writeFileSync(join(dir, ".agents", "config", "verify.json"), JSON.stringify(cfg, null, 2));
  }
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  const run = (...args) => {
    const r = spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: "utf8" });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  return { dir, run, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const node = process.execPath;
const e2eConfig = {
  gates: [
    { name: "ok", why: "always passes", when: [{ paths: ["src/**"] }], run: [node, "-e", "process.exit(0)"] },
    {
      name: "files",
      when: [{ paths: ["src/**/*.ts"], status: ["A", "M", "?"] }],
      run: [node, "-e", "if (process.argv.slice(1).join() !== 'a.ts,b.ts') process.exit(3)", "{files}"],
      cwd: "src",
    },
  ],
  rules: [{ id: "no-debugger", severity: "error", paths: ["**/*.ts"], pattern: "\\bdebugger\\b", code: true, message: "remove debugger" }],
};

test("end to end: plan, run, rule failure, skip and missing config", () => {
  const repo = tempRepo(e2eConfig);
  try {
    writeFileSync(join(repo.dir, "src", "a.ts"), "export const a = 2;\n");
    writeFileSync(join(repo.dir, "src", "b.ts"), "export const b = 1;\n");

    const plan = repo.run("--plan");
    assert.equal(plan.code, 0, plan.out);
    assert.match(plan.out, /PLAN rules: \(in-process\)/);
    assert.match(plan.out, /PLAN ok: /);
    assert.match(plan.out, /PLAN files: .* a\.ts b\.ts \(in src\)/);
    assert.match(plan.out, /VERDICT=NOT_RUN/);

    const pass = repo.run("--run");
    assert.equal(pass.code, 0, pass.out);
    assert.match(pass.out, /GATE rules PASS/);
    assert.match(pass.out, /GATE ok PASS/);
    assert.match(pass.out, /GATE files PASS/);
    assert.match(pass.out, /VERDICT=PASS/);

    const partial = repo.run("--run", "--skip", "ok");
    assert.match(partial.out, /GATE ok SKIP 0\.0s \(skipped by --skip\)/);
    assert.match(partial.out, /VERDICT=PARTIAL/);

    writeFileSync(join(repo.dir, "src", "b.ts"), "export const b = 1;\ndebugger;\n");
    const fail = repo.run("--run");
    assert.equal(fail.code, 1, fail.out);
    assert.match(fail.out, /src\/b\.ts:2 no-debugger error remove debugger/);
    assert.match(fail.out, /GATE rules FAIL/);
    assert.match(fail.out, /GATE ok SKIP 0\.0s \(skipped after earlier failure\)/);
    assert.match(fail.out, /VERDICT=FAIL/);

    const all = repo.run("--run", "--keep-going");
    assert.match(all.out, /GATE ok PASS/);
    assert.match(all.out, /VERDICT=FAIL/);
  } finally {
    repo.cleanup();
  }
});

test("end to end: a missing config points to setup-workflow and fails", () => {
  const repo = tempRepo(undefined);
  try {
    const result = repo.run("--run");
    assert.equal(result.code, 1);
    assert.match(result.out, /setup-workflow/);
    assert.match(result.out, /VERDICT=FAIL/);
  } finally {
    repo.cleanup();
  }
});

test("end to end: an invalid config fails with the validation message", () => {
  const repo = tempRepo({ gates: [{ name: "x" }] });
  try {
    const result = repo.run("--plan");
    assert.equal(result.code, 1);
    assert.match(result.out, /config\.gates\[0\]\.when: required/);
    assert.match(result.out, /VERDICT=FAIL/);
  } finally {
    repo.cleanup();
  }
});
