#!/usr/bin/env node
// verify: map changed files to the project's gates (.agents/config/verify.json)
// and run them. Project rules live in the project's linter, run by a lint gate.
// Pure functions are exported and unit-tested in verify.test.mjs; the git/exec
// layer at the bottom stays thin.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_CONFIG_PATH = ".agents/config/verify.json";

// ---------------------------------------------------------------- arguments

const VALUE_FLAGS = { "--base": "ref", "--skip": "gate name", "--config": "path" };

export function parseArgs(argv) {
  const options = { mode: "plan", base: undefined, config: undefined, keepGoing: false, skip: [] };
  const set = (flag, value) => {
    if (flag === "--base") options.base = value;
    else if (flag === "--config") options.config = value;
    else options.skip.push(value);
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.indexOf("=");
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    if (arg === "--plan") options.mode = "plan";
    else if (arg === "--run") options.mode = "run";
    else if (arg === "--rules") throw new Error("--rules was removed: project rules run in the linter, from a lint gate");
    else if (arg === "--keep-going") options.keepGoing = true;
    else if (flag in VALUE_FLAGS && eq !== -1) set(flag, arg.slice(eq + 1));
    else if (flag in VALUE_FLAGS) {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`${arg} needs a ${VALUE_FLAGS[arg]}`);
      set(arg, value);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

// ---------------------------------------------------------------- git output

/** Parse `git diff --name-status -z -M` output. */
export function parseNameStatus(z) {
  const tokens = z.split("\0");
  const changes = [];
  for (let i = 0; i < tokens.length && tokens[i]; ) {
    const status = tokens[i][0];
    if (status === "R" || status === "C") {
      changes.push({ status, path: tokens[i + 2], oldPath: tokens[i + 1] });
      i += 3;
    } else {
      changes.push({ status, path: tokens[i + 1] });
      i += 2;
    }
  }
  return changes;
}

// ---------------------------------------------------------------- globs

const globCache = new Map();

/**
 * Repo-relative glob: `**` spans zero or more directories, `*` and `?` stay
 * inside one segment, `{a,b}` alternates. A pattern without `/` matches the
 * repository root only; write `**\/x` to match anywhere.
 */
export function globToRegExp(glob) {
  if (globCache.has(glob)) return globCache.get(glob);
  let re = "";
  let braces = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") {
        i++;
        re += "(?:.*/)?";
      } else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === "{") {
      braces++;
      re += "(?:";
    } else if (c === "}" && braces) {
      braces--;
      re += ")";
    } else if (c === "," && braces) re += "|";
    else re += c.replace(/[.+^$()|[\]\\{}]/g, "\\$&");
  }
  const regex = new RegExp(`^${re}$`);
  globCache.set(glob, regex);
  return regex;
}

export const matchesGlob = (path, glob) => globToRegExp(glob).test(path);
const matchesAny = (path, globs) => globs.some((glob) => matchesGlob(path, glob));

// ---------------------------------------------------------------- gate planning

/** A change matches `when` if any matcher matches; a matcher ANDs its fields. */
export function matchesWhen(change, when) {
  return when.some((m) => {
    if (m.status && !m.status.includes(change.status)) return false;
    const candidates = [change.path];
    if (change.oldPath && m.status?.includes("R")) candidates.push(change.oldPath);
    return candidates.some(
      (p) => (!m.paths || matchesAny(p, m.paths)) && (!m.exclude || !matchesAny(p, m.exclude)),
    );
  });
}

function describeFiles(files) {
  const shown = files.slice(0, 3).map((c) => c.path).join(", ");
  return files.length > 3 ? `${shown} (+${files.length - 3} more)` : shown;
}

/** Expand the `{files}` token, relativizing to `cwd` and dropping files outside it. */
function expandFiles(run, files, cwd) {
  if (!run.includes("{files}")) return run;
  const prefix = cwd ? `${cwd}/` : "";
  const paths = [
    ...new Set(files.map((c) => c.path).filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length))),
  ];
  if (paths.length === 0) return null;
  return run.flatMap((arg) => (arg === "{files}" ? paths : [arg]));
}

/** Map changes ([{status, path, oldPath?}]) to ordered gates [{name, command, cwd, reason}]. */
export function planGates(changes, config) {
  const relevant = changes.filter((c) => !matchesAny(c.path, config.ignore));
  const gates = [];
  for (const gate of config.gates) {
    const files = relevant.filter((c) => matchesWhen(c, gate.when));
    if (files.length === 0) continue;
    const command = expandFiles(gate.run, files, gate.cwd);
    if (!command) continue;
    const trigger = `triggered by ${describeFiles(files)}`;
    gates.push({ name: gate.name, command, cwd: gate.cwd, reason: gate.why ? `${gate.why}; ${trigger}` : trigger });
  }
  return gates;
}

// ---------------------------------------------------------------- config

const STATUSES = new Set(["A", "C", "D", "M", "R", "T", "U", "?"]);
const NAME = /^[\w:.@/-]+$/;
const REMOVED = {
  rules: "removed; express each project rule in the linter and run it from a lint gate (see the verify skill)",
  ignoreComment: "removed; use the linter's disable comment with a reason",
};

/** Validate a parsed verify.json and fill defaults; throws listing every problem. */
export function validateConfig(raw) {
  const errors = [];
  const fail = (at, problem) => errors.push(`${at}: ${problem}`);
  const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const isStrings = (v) => Array.isArray(v) && v.every((s) => typeof s === "string" && s.length > 0);
  const keys = (obj, at, allowed) => {
    for (const k of Object.keys(obj)) if (!allowed.includes(k)) fail(at, `unknown key "${k}"`);
  };
  const strings = (obj, key, at, { required = false, nonEmpty = false } = {}) => {
    if (!(key in obj)) {
      if (required) fail(`${at}.${key}`, "required");
      return undefined;
    }
    if (!isStrings(obj[key]) || (nonEmpty && obj[key].length === 0)) {
      fail(`${at}.${key}`, nonEmpty ? "expected a non-empty array of strings" : "expected an array of strings");
      return undefined;
    }
    return obj[key];
  };
  const string = (obj, key, at, { required = false } = {}) => {
    if (!(key in obj)) {
      if (required) fail(`${at}.${key}`, "required");
      return undefined;
    }
    if (typeof obj[key] !== "string" || obj[key].length === 0) {
      fail(`${at}.${key}`, "expected a non-empty string");
      return undefined;
    }
    return obj[key];
  };

  if (!isObject(raw)) throw new Error("config: expected a JSON object");
  for (const [key, problem] of Object.entries(REMOVED)) if (key in raw) fail(`config.${key}`, problem);
  keys(raw, "config", ["$schema", "base", "ignore", "gates", ...Object.keys(REMOVED)]);
  const config = {
    base: strings(raw, "base", "config", { nonEmpty: true }) ?? ["origin/main", "main"],
    ignore: strings(raw, "ignore", "config") ?? [],
    gates: [],
  };

  if (!("gates" in raw)) fail("config.gates", "required");
  else if (!Array.isArray(raw.gates)) fail("config.gates", "expected an array");
  else {
    const seen = new Set();
    raw.gates.forEach((gate, i) => {
      const at = `config.gates[${i}]`;
      if (!isObject(gate)) return fail(at, "expected an object");
      keys(gate, at, ["name", "why", "when", "run", "cwd"]);
      const name = string(gate, "name", at, { required: true });
      if (name !== undefined) {
        if (!NAME.test(name)) fail(`${at}.name`, `"${name}" may only use letters, digits and _ : . @ / -`);
        else if (seen.has(name)) fail(`${at}.name`, `"${name}" is duplicated`);
        seen.add(name);
      }
      const why = string(gate, "why", at);
      const when = [];
      if (!("when" in gate)) fail(`${at}.when`, "required");
      else if (!Array.isArray(gate.when) || gate.when.length === 0) fail(`${at}.when`, "expected a non-empty array of matchers");
      else {
        gate.when.forEach((m, j) => {
          const mat = `${at}.when[${j}]`;
          if (!isObject(m)) return fail(mat, "expected an object");
          keys(m, mat, ["paths", "exclude", "status"]);
          if (!("paths" in m) && !("exclude" in m) && !("status" in m)) return fail(mat, "needs paths, exclude or status");
          const matcher = {};
          const paths = strings(m, "paths", mat, { nonEmpty: true });
          const exclude = strings(m, "exclude", mat);
          const status = strings(m, "status", mat, { nonEmpty: true });
          if (paths) matcher.paths = paths;
          if (exclude) matcher.exclude = exclude;
          if (status) {
            const unknown = status.find((s) => !STATUSES.has(s));
            if (unknown) fail(`${mat}.status`, `unknown status "${unknown}" (use ${[...STATUSES].join(" ")})`);
            else matcher.status = status;
          }
          when.push(matcher);
        });
      }
      const run = strings(gate, "run", at, { required: true, nonEmpty: true });
      let cwd = string(gate, "cwd", at);
      if (cwd !== undefined) {
        cwd = cwd.replace(/^\.\//, "").replace(/\/+$/, "");
        if (cwd.startsWith("/") || cwd.split("/").includes("..") || cwd === "" || cwd === ".") {
          fail(`${at}.cwd`, "must be a relative path inside the repository");
        }
      }
      config.gates.push({ name, why, when, run, cwd });
    });
  }

  if (errors.length) throw new Error(errors.join("\n"));
  return config;
}

// ---------------------------------------------------------------- output

export function formatGateLine({ name, status, seconds }) {
  return `GATE ${name} ${status} ${seconds.toFixed(1)}s`;
}

export function summarize(results) {
  if (results.some((r) => r.status === "FAIL")) return "FAIL";
  if (results.some((r) => r.status === "SKIP")) return "PARTIAL";
  return "PASS";
}

// ---------------------------------------------------------------- git/exec layer

const git = (args) =>
  execFileSync("git", ["-c", "core.quotePath=false", ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

function loadConfig(path) {
  if (!existsSync(path)) {
    throw new Error(`no config at ${path}; run the setup-workflow skill to create it, or pass --config <path>`);
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error.message}`);
  }
  try {
    return validateConfig(raw);
  } catch (error) {
    throw new Error(`invalid ${path}:\n${error.message}`);
  }
}

function resolveBase(ref, candidates) {
  if (ref) return { sha: git(["rev-parse", "--verify", `${ref}^{commit}`]).trim(), label: ref };
  for (const candidate of candidates) {
    try {
      return { sha: git(["merge-base", "HEAD", candidate]).trim(), label: `merge-base(HEAD, ${candidate})` };
    } catch {}
  }
  throw new Error(`could not resolve ${candidates.join(" or ")}; pass --base <ref>`);
}

function collectChanges(base) {
  const tracked = parseNameStatus(git(["diff", "--name-status", "-z", "-M", base]));
  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean)
    .map((path) => ({ status: "?", path }));
  return [...tracked, ...untracked];
}

const describeCommand = (gate) => `${gate.command.join(" ")}${gate.cwd ? ` (in ${gate.cwd})` : ""}`;

function main() {
  const options = parseArgs(process.argv.slice(2));
  const configPath = options.config ? resolve(options.config) : undefined;
  process.chdir(git(["rev-parse", "--show-toplevel"]).trim());
  const config = loadConfig(configPath ?? DEFAULT_CONFIG_PATH);
  const base = resolveBase(options.base, config.base);
  const changes = collectChanges(base.sha);
  const gates = planGates(changes, config);
  console.log(`verify base: ${base.label} ${base.sha.slice(0, 12)}; ${changes.length} changed file(s)`);

  if (options.mode === "plan") {
    for (const gate of gates) {
      console.log(`PLAN ${gate.name}: ${describeCommand(gate)}`);
      console.log(`  why: ${gate.reason}`);
    }
    console.log("VERDICT=NOT_RUN (plan only; use --run for proof)");
    return 0;
  }

  const unknownSkips = options.skip.filter((s) => !gates.some((g) => g.name === s));
  if (unknownSkips.length) console.log(`note: --skip names not in plan: ${unknownSkips.join(", ")}`);
  const results = [];
  let failed = false;
  for (const gate of gates) {
    if (options.skip.includes(gate.name) || (failed && !options.keepGoing)) {
      const why = options.skip.includes(gate.name) ? "skipped by --skip" : "skipped after earlier failure";
      results.push({ name: gate.name, status: "SKIP", seconds: 0, why });
      continue;
    }
    console.log(`\n=== ${gate.name}: ${describeCommand(gate)}`);
    const started = performance.now();
    const run = spawnSync(gate.command[0], gate.command.slice(1), {
      stdio: "inherit",
      cwd: gate.cwd ? resolve(gate.cwd) : undefined,
    });
    if (run.error) console.log(`${gate.name}: ${run.error.message}`);
    const ok = run.status === 0;
    const seconds = (performance.now() - started) / 1000;
    results.push({ name: gate.name, status: ok ? "PASS" : "FAIL", seconds });
    if (!ok) failed = true;
  }
  console.log("\n--- verify ---");
  for (const r of results) console.log(formatGateLine(r) + (r.why ? ` (${r.why})` : ""));
  const verdict = summarize(results);
  console.log(`VERDICT=${verdict}`);
  return verdict === "FAIL" ? 1 : 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`verify: ${error.message}`);
    console.log("VERDICT=FAIL");
    process.exitCode = 1;
  }
}
