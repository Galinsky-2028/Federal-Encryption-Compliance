import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const script = resolve(import.meta.dirname, "check-engine-boundary.mjs");

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "boundary-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [script], { env: { ...process.env, ENGINE_BOUNDARY_ROOT: root }, encoding: "utf8" });
}

test("repository passes the engine boundary", () => {
  const result = spawnSync(process.execPath, [script], { encoding: "utf8", env: { ...process.env, ENGINE_BOUNDARY_ROOT: "" } });
  assert.equal(result.status, 0, result.stderr);
});

test("sdk imports and test-only reference oracles are allowed", () => {
  const root = fixture({
    "packages/a/package.json": JSON.stringify({ dependencies: { "@caiae/sdk": "*" }, devDependencies: { "@caiae/rules": "*" } }),
    "packages/a/src/index.ts": 'import { createClient } from "@caiae/sdk";\n',
    "packages/a/test/oracle.test.ts": 'import { evaluateRuleSet } from "@caiae/rules";\n',
  });
  try { assert.equal(run(root).status, 0); } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const [name, files] of [
  ["production import of an engine internal", { "packages/a/src/index.ts": 'import { db } from "@caiae/db";\n' }],
  ["dynamic import of vendored engine source", { "apps/web/app/page.tsx": 'await import("../../vendor/caiae/packages/core");\n' }],
  ["side-effect import of an engine internal", { "apps/web/lib/x.ts": 'import "@caiae/runtime";\n' }],
  ["runtime dependency on an engine internal", { "packages/a/package.json": JSON.stringify({ dependencies: { "@caiae/findings": "*" } }) }],
]) {
  test(`rejects ${name}`, () => {
    const root = fixture(files);
    try {
      const result = run(root);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /boundary violations/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
