import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatGateLine,
  globToRegExp,
  matchesGlob,
  matchesWhen,
  parseArgs,
  parseNameStatus,
  planGates,
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
  assert.equal(parseArgs(["--base=main"]).base, "main");
  assert.equal(parseArgs(["--config=c.json"]).config, "c.json");
});

test("rejects unknown flags and dangling values", () => {
  assert.throws(() => parseArgs(["--frobnicate"]), /unknown argument/);
  assert.throws(() => parseArgs(["--base"]), /--base needs a ref/);
  assert.throws(() => parseArgs(["--skip", "--run"]), /--skip needs a gate name/);
  assert.throws(() => parseArgs(["--config"]), /--config needs a path/);
});

test("--rules points to the lint gate that replaced it", () => {
  assert.throws(() => parseArgs(["--rules"]), /--rules was removed.*linter/);
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
});

test("no changes plans no gates", () => {
  assert.deepEqual(gateNames([], monorepo), []);
});

test("ignored files never trigger a gate", () => {
  assert.deepEqual(gateNames(modified("docs/x.md", "README.md"), monorepo), []);
});

test("gates run in config order with {files} expanded", () => {
  const gates = planGates(modified("apps/web/src/App.tsx", "packages/ui/a.ts"), monorepo);
  assert.deepEqual(gates.map((g) => g.name), ["typecheck", "eslint", "test:web"]);
  assert.deepEqual(gates[0].command, ["pnpm", "typecheck"]);
  assert.deepEqual(gates[1].command, ["pnpm", "exec", "eslint", "--", "apps/web/src/App.tsx", "packages/ui/a.ts"]);
  assert.deepEqual(gates[2].command, ["pnpm", "exec", "vitest", "related", "--run", "src/App.tsx"]);
  assert.equal(gates[2].cwd, "apps/web");
  assert.equal(gates[0].cwd, undefined);
});

test("{files} drops paths outside cwd and skips a gate left with none", () => {
  const cfg = config({
    gates: [{ name: "web", when: [{ paths: ["**/*.ts"] }], run: ["t", "{files}"], cwd: "apps/web" }],
  });
  assert.deepEqual(gateNames(modified("packages/a.ts"), cfg), []);
});

test("deleted files typecheck but are not passed to file-taking gates", () => {
  assert.deepEqual(gateNames([{ status: "D", path: "src/old.ts" }], monorepo), ["typecheck"]);
});

test("every planned gate carries a reason naming its trigger", () => {
  const gates = planGates(modified("a.ts", "b.ts", "c.ts", "d.ts"), monorepo);
  for (const gate of gates) assert.ok(gate.reason.length > 0, gate.name);
  assert.match(gates[0].reason, /^tsc across the workspace; triggered by a\.ts, b\.ts, c\.ts \(\+1 more\)$/);
  assert.match(gates[1].reason, /^triggered by /);
});

// ---------- config validation ----------

test("fills defaults", () => {
  const cfg = validateConfig({ gates: [] });
  assert.deepEqual(cfg.base, ["origin/main", "main"]);
  assert.deepEqual(cfg.ignore, []);
  assert.deepEqual(Object.keys(cfg).sort(), ["base", "gates", "ignore"]);
});

test("regex rules and their ignore comment are rejected with a pointer to the linter", () => {
  assert.throws(
    () => validateConfig({ gates: [], rules: [] }),
    /config\.rules: removed; express each project rule in the linter and run it from a lint gate/,
  );
  assert.throws(
    () => validateConfig({ gates: [], ignoreComment: "verify-ignore" }),
    /config\.ignoreComment: removed; use the linter's disable comment with a reason/,
  );
});

test("a gate may be named rules now that no in-process gate reserves it", () => {
  assert.deepEqual(validateConfig({ gates: [{ name: "rules", when: [{ paths: ["x"] }], run: ["x"] }] }).gates[0].name, "rules");
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
    () =>
      validateConfig({
        gates: [
          { name: "lint", when: [{ paths: ["x"] }], run: ["x"] },
          { name: "lint", when: [{ paths: ["y"] }], run: ["y"] },
        ],
      }),
    /config\.gates\[1\]\.name: "lint" is duplicated/,
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
  assert.ok(cfg.gates.some((g) => g.name === "eslint"), "project rules need a lint gate");
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
    {
      name: "lint",
      why: "stands in for the project's linter",
      when: [{ paths: ["src/**/*.ts"], status: ["A", "M", "?"] }],
      run: [node, "-e", "process.exit(require('node:fs').readFileSync('b.ts', 'utf8').includes('debugger') ? 1 : 0)"],
      cwd: "src",
    },
    { name: "ok", why: "always passes", when: [{ paths: ["src/**"] }], run: [node, "-e", "process.exit(0)"] },
    {
      name: "files",
      when: [{ paths: ["src/**/*.ts"], status: ["A", "M", "?"] }],
      run: [node, "-e", "if (process.argv.slice(1).join() !== 'a.ts,b.ts') process.exit(3)", "{files}"],
      cwd: "src",
    },
  ],
};

test("end to end: plan, run, gate failure and skip", () => {
  const repo = tempRepo(e2eConfig);
  try {
    writeFileSync(join(repo.dir, "src", "a.ts"), "export const a = 2;\n");
    writeFileSync(join(repo.dir, "src", "b.ts"), "export const b = 1;\n");

    const plan = repo.run("--plan");
    assert.equal(plan.code, 0, plan.out);
    assert.doesNotMatch(plan.out, /in-process/);
    assert.match(plan.out, /PLAN lint: /);
    assert.match(plan.out, /PLAN ok: /);
    assert.match(plan.out, /PLAN files: .* a\.ts b\.ts \(in src\)/);
    assert.match(plan.out, /VERDICT=NOT_RUN/);

    const pass = repo.run("--run");
    assert.equal(pass.code, 0, pass.out);
    assert.match(pass.out, /GATE lint PASS/);
    assert.match(pass.out, /GATE ok PASS/);
    assert.match(pass.out, /GATE files PASS/);
    assert.match(pass.out, /VERDICT=PASS/);

    const partial = repo.run("--run", "--skip", "ok");
    assert.match(partial.out, /GATE ok SKIP 0\.0s \(skipped by --skip\)/);
    assert.match(partial.out, /VERDICT=PARTIAL/);

    writeFileSync(join(repo.dir, "src", "b.ts"), "export const b = 1;\ndebugger;\n");
    const fail = repo.run("--run");
    assert.equal(fail.code, 1, fail.out);
    assert.match(fail.out, /GATE lint FAIL/);
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
