// Repo-level invariants: every skill installs cleanly, its links resolve, the
// setup templates stay valid for the scripts that read them, and nothing
// project-specific leaks into the generic collection.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateConfig } from "../skills/verify/scripts/verify.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = join(root, "skills");
const skillNames = readdirSync(skillsDir).filter((d) => statSync(join(skillsDir, d)).isDirectory());

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name === ".git" || name === "node_modules") return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function frontmatter(source) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (!m) return null;
  const fields = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1");
  }
  return fields;
}

test("every skill has a SKILL.md whose name matches its folder", () => {
  assert.ok(skillNames.length > 0);
  for (const name of skillNames) {
    const file = join(skillsDir, name, "SKILL.md");
    assert.ok(existsSync(file), `${name}: missing SKILL.md`);
    const fields = frontmatter(readFileSync(file, "utf8"));
    assert.ok(fields, `${name}: missing frontmatter`);
    assert.equal(fields.name, name);
    assert.ok(fields.description, `${name}: missing description`);
    assert.ok(fields.description.length <= 1024, `${name}: description over 1024 chars`);
  }
});

test("relative links in skill docs resolve", () => {
  // Templates link to paths in the target repo, not this one.
  const docs = walk(skillsDir).filter((p) => p.endsWith(".md") && !p.includes(`${join("setup-workflow", "templates")}`));
  const broken = [];
  for (const file of docs) {
    const prose = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
    for (const [, target] of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(?:[a-z]+:|#)/i.test(target)) continue;
      const path = resolve(dirname(file), target.split("#")[0]);
      if (!existsSync(path)) broken.push(`${relative(root, file)} -> ${target}`);
    }
  }
  assert.deepEqual(broken, []);
});

test("the setup verify.json template and the example config validate", () => {
  for (const file of ["skills/setup-workflow/templates/verify.json", "skills/verify/examples/verify.json"]) {
    assert.doesNotThrow(() => validateConfig(JSON.parse(readFileSync(join(root, file), "utf8"))), file);
  }
});

test("upstream.json never installs a skill this collection replaces or ships", () => {
  const { sources } = JSON.parse(readFileSync(join(skillsDir, "setup-workflow", "upstream.json"), "utf8"));
  for (const { source, skills, excluded = {} } of sources) {
    for (const skill of skills) {
      assert.ok(!(skill in excluded), `${source}: ${skill} is both installed and excluded`);
      assert.ok(!skillNames.includes(skill), `${source}: ${skill} collides with a skill in this repo`);
    }
  }
});

test("setup-workflow installs every skill in this repo", () => {
  const setup = readFileSync(join(skillsDir, "setup-workflow", "SKILL.md"), "utf8");
  const install = /npx skills add tymkiwdylan\/skills -s ([^`]+?) -a /.exec(setup);
  assert.ok(install, "install command not found");
  assert.deepEqual(install[1].split(/\s+/).sort(), [...skillNames].sort());
});

test("every vendored skill is credited in NOTICE.md and carries the upstream license", () => {
  const notice = readFileSync(join(root, "NOTICE.md"), "utf8");
  const vendored = [...notice.matchAll(/^\| `([\w-]+)` \| `skills\//gm)].map((m) => m[1]);
  assert.deepEqual(vendored.sort(), ["domain-modeling", "grill-with-docs", "grilling"]);
  for (const name of vendored) {
    assert.ok(skillNames.includes(name), `${name}: credited but not in skills/`);
    const license = join(skillsDir, name, "LICENSE");
    assert.ok(existsSync(license) && readFileSync(license, "utf8").includes("Matt Pocock"), `${name}: missing upstream LICENSE`);
  }
});

test("no project-specific names leak into the collection", () => {
  const leaks = [];
  const pattern = /ialex|convex|norte|\bNOR-\d|tymkiwdylan@|nortedev/i;
  for (const file of walk(root)) {
    if (file === fileURLToPath(import.meta.url)) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => pattern.test(line) && leaks.push(`${relative(root, file)}:${i + 1}: ${line.trim()}`));
  }
  assert.deepEqual(leaks, []);
});
