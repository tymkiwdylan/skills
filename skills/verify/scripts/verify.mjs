#!/usr/bin/env node
// verify: map changed files to the project's gates (.agents/config/verify.json),
// run them, and check its regex rules on ADDED lines only. Pure functions are
// exported and unit-tested in verify.test.mjs; the git/exec layer at the bottom
// stays thin.
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
    else if (arg === "--rules") options.mode = "rules";
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

/** Parse `git diff -U0` into Map<newPath, Set<addedLineNumber>>. */
export function parseAddedLines(diff) {
  const added = new Map();
  const lines = diff.split("\n");
  let path;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("+++ ")) {
      const target = line.slice(4);
      path = target === "/dev/null" ? undefined : target.replace(/^b\//, "");
      continue;
    }
    const hunk = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk) continue;
    let oldLeft = hunk[1] === undefined ? 1 : Number(hunk[1]);
    let newLeft = hunk[3] === undefined ? 1 : Number(hunk[3]);
    let lineNo = Number(hunk[2]);
    // Consume exactly the hunk's body so content like "+++x" is never a header.
    while ((oldLeft > 0 || newLeft > 0) && i + 1 < lines.length) {
      const body = lines[++i];
      if (body.startsWith("\\")) continue;
      if (body.startsWith("-")) oldLeft--;
      else if (body.startsWith("+")) {
        if (path) {
          if (!added.has(path)) added.set(path, new Set());
          added.get(path).add(lineNo);
        }
        lineNo++;
        newLeft--;
      } else {
        oldLeft--;
        newLeft--;
        lineNo++;
      }
    }
  }
  return added;
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

/**
 * Map changes ([{status, path, oldPath?}]) to ordered gates
 * [{name, command, cwd, reason}]. `rules` runs in-process and comes first.
 */
export function planGates(changes, config) {
  const relevant = changes.filter((c) => !matchesAny(c.path, config.ignore));
  const gates = [];
  if (config.rules.length) {
    gates.push({ name: "rules", command: null, cwd: undefined, reason: "project rules on added lines (in-process)" });
  }
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

// ---------------------------------------------------------------- code stripping

const REGEX_KEYWORDS = new Set([
  "return", "typeof", "case", "do", "else", "in", "of", "void", "yield", "await",
  "delete", "throw", "new", "instanceof",
]);

/**
 * Blank JS/TS comments, string/template text and regex bodies with spaces,
 * keeping length, newlines, quote characters and `${...}` code. Best effort lexer.
 */
export function stripCode(src) {
  const out = src.split("");
  const n = src.length;
  const templateStack = [];
  let braceDepth = 0;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== "\n") out[k] = " ";
  };
  const scanTemplate = (start) => {
    let j = start;
    while (j < n) {
      if (src[j] === "\\") j += 2;
      else if (src[j] === "`") {
        blank(start, j);
        return j + 1;
      } else if (src[j] === "$" && src[j + 1] === "{") {
        blank(start, j);
        templateStack.push(braceDepth);
        braceDepth++;
        return j + 2;
      } else j++;
    }
    blank(start, n);
    return n;
  };
  const regexAllowed = (i) => {
    let j = i - 1;
    while (j >= 0 && /\s/.test(out[j])) j--;
    if (j < 0) return true;
    const ch = out[j];
    if (/[\w$]/.test(ch)) {
      let k = j;
      while (k >= 0 && /[\w$]/.test(out[k])) k--;
      return REGEX_KEYWORDS.has(out.slice(k + 1, j + 1).join(""));
    }
    return !/[)\]}<"'`]/.test(ch);
  };
  let i = 0;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      const end = src.indexOf("\n", i);
      const e = end === -1 ? n : end;
      blank(i, e);
      i = e;
    } else if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const e = end === -1 ? n : end + 2;
      blank(i, e);
      i = e;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      blank(i + 1, j);
      i = j + 1;
    } else if (c === "`") {
      i = scanTemplate(i + 1);
    } else if (c === "}" && templateStack.length && braceDepth - 1 === templateStack.at(-1)) {
      templateStack.pop();
      braceDepth--;
      i = scanTemplate(i + 1);
    } else if (c === "/" && regexAllowed(i)) {
      let j = i + 1;
      let inClass = false;
      while (j < n && src[j] !== "\n") {
        if (src[j] === "\\") j++;
        else if (src[j] === "[") inClass = true;
        else if (src[j] === "]") inClass = false;
        else if (src[j] === "/" && !inClass) break;
        j++;
      }
      if (j < n && src[j] === "/") {
        blank(i + 1, j);
        i = j + 1;
      } else i++; // not a regex literal after all: treat as division
    } else {
      if (c === "{") braceDepth++;
      else if (c === "}") braceDepth--;
      i++;
    }
  }
  return out.join("");
}

// ---------------------------------------------------------------- rule checks

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Findings [{path, line, rule, severity, message}] for `added` line numbers
 * (a Set, or "all" for untracked files), one per rule per line.
 */
export function checkRules(path, source, added, config) {
  const rules = config.rules.filter(
    (r) => matchesAny(path, r.paths) && !matchesAny(path, r.exclude),
  );
  if (rules.length === 0) return [];
  const raw = source.split("\n");
  let stripped;
  const ignore = new RegExp(`${escapeRegExp(config.ignoreComment)}\\s+([\\w-]+)\\s*:\\s*\\S`);
  const ignored = (line, rule) =>
    [raw[line - 1], raw[line - 2]].some((text) => {
      const m = text && ignore.exec(text);
      return m && m[1] === rule;
    });
  const lineNumbers = added === "all" ? raw.map((_, i) => i + 1) : [...added].sort((a, b) => a - b);
  const findings = [];
  for (const line of lineNumbers) {
    if (line < 1 || line > raw.length) continue;
    for (const rule of rules) {
      const text = rule.code ? (stripped ??= stripCode(source).split("\n"))[line - 1] : raw[line - 1];
      if (!rule.regex.test(text) || ignored(line, rule.id)) continue;
      findings.push({ path, line, rule: rule.id, severity: rule.severity, message: rule.message });
    }
  }
  return findings;
}

// ---------------------------------------------------------------- config

const STATUSES = new Set(["A", "C", "D", "M", "R", "T", "U", "?"]);
const NAME = /^[\w:.@/-]+$/;
const RULE_ID = /^[\w-]+$/;
const FLAGS = /^[dimsuv]*$/;

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
  keys(raw, "config", ["$schema", "base", "ignore", "ignoreComment", "gates", "rules"]);
  const config = {
    base: strings(raw, "base", "config", { nonEmpty: true }) ?? ["origin/main", "main"],
    ignore: strings(raw, "ignore", "config") ?? [],
    ignoreComment: string(raw, "ignoreComment", "config") ?? "verify-ignore",
    gates: [],
    rules: [],
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
        if (name === "rules") fail(`${at}.name`, `"rules" is reserved for the in-process rule gate`);
        else if (!NAME.test(name)) fail(`${at}.name`, `"${name}" may only use letters, digits and _ : . @ / -`);
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

  if ("rules" in raw && !Array.isArray(raw.rules)) fail("config.rules", "expected an array");
  else if (Array.isArray(raw.rules)) {
    const seen = new Set();
    raw.rules.forEach((rule, i) => {
      const at = `config.rules[${i}]`;
      if (!isObject(rule)) return fail(at, "expected an object");
      keys(rule, at, ["id", "severity", "paths", "exclude", "pattern", "flags", "code", "message"]);
      const id = string(rule, "id", at, { required: true });
      if (id !== undefined) {
        if (!RULE_ID.test(id)) fail(`${at}.id`, `"${id}" may only use letters, digits, _ and -`);
        else if (seen.has(id)) fail(`${at}.id`, `"${id}" is duplicated`);
        seen.add(id);
      }
      const severity = rule.severity ?? "error";
      if (severity !== "error" && severity !== "warn") fail(`${at}.severity`, `expected "error" or "warn"`);
      const paths = strings(rule, "paths", at, { required: true, nonEmpty: true });
      const exclude = strings(rule, "exclude", at) ?? [];
      const pattern = string(rule, "pattern", at, { required: true });
      const flags = rule.flags ?? "";
      if (typeof flags !== "string" || !FLAGS.test(flags)) fail(`${at}.flags`, `only "dimsuv" are allowed`);
      if ("code" in rule && typeof rule.code !== "boolean") fail(`${at}.code`, "expected a boolean");
      const message = string(rule, "message", at, { required: true });
      let regex;
      if (pattern !== undefined && typeof flags === "string" && FLAGS.test(flags)) {
        try {
          regex = new RegExp(pattern, flags);
        } catch (error) {
          fail(`${at}.pattern`, `invalid regular expression (${error.message})`);
        }
      }
      config.rules.push({ id, severity, paths, exclude, pattern, flags, code: rule.code === true, message, regex });
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
  const added = parseAddedLines(git(["diff", "-U0", "-M", "--no-color", "--no-ext-diff", base]));
  return { changes: [...tracked, ...untracked], added };
}

function runRules(changes, added, config) {
  const findings = [];
  for (const c of changes) {
    if (c.status === "D" || !existsSync(c.path)) continue;
    let source;
    try {
      source = readFileSync(c.path, "utf8");
    } catch {
      continue;
    }
    findings.push(...checkRules(c.path, source, c.status === "?" ? "all" : added.get(c.path) ?? new Set(), config));
  }
  for (const f of findings) console.log(`${f.path}:${f.line} ${f.rule} ${f.severity} ${f.message}`);
  const errors = findings.filter((f) => f.severity === "error").length;
  console.log(`rules: ${errors} error(s), ${findings.length - errors} warning(s) on added lines`);
  return errors === 0;
}

const describeCommand = (gate) =>
  gate.command ? `${gate.command.join(" ")}${gate.cwd ? ` (in ${gate.cwd})` : ""}` : "(in-process)";

function main() {
  const options = parseArgs(process.argv.slice(2));
  const configPath = options.config ? resolve(options.config) : undefined;
  process.chdir(git(["rev-parse", "--show-toplevel"]).trim());
  const config = loadConfig(configPath ?? DEFAULT_CONFIG_PATH);
  const base = resolveBase(options.base, config.base);
  const { changes, added } = collectChanges(base.sha);
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

  const selected = options.mode === "rules" ? gates.filter((g) => g.name === "rules") : gates;
  const unknownSkips = options.skip.filter((s) => !gates.some((g) => g.name === s));
  if (unknownSkips.length) console.log(`note: --skip names not in plan: ${unknownSkips.join(", ")}`);
  const results = [];
  let failed = false;
  for (const gate of selected) {
    if (options.skip.includes(gate.name) || (failed && !options.keepGoing)) {
      const why = options.skip.includes(gate.name) ? "skipped by --skip" : "skipped after earlier failure";
      results.push({ name: gate.name, status: "SKIP", seconds: 0, why });
      continue;
    }
    console.log(`\n=== ${gate.name}: ${describeCommand(gate)}`);
    const started = performance.now();
    let ok;
    if (gate.command) {
      const run = spawnSync(gate.command[0], gate.command.slice(1), {
        stdio: "inherit",
        cwd: gate.cwd ? resolve(gate.cwd) : undefined,
      });
      if (run.error) console.log(`${gate.name}: ${run.error.message}`);
      ok = run.status === 0;
    } else ok = runRules(changes, added, config);
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
