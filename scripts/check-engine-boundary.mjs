import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Thin-app boundary (docs/architecture.md, "Data boundary"):
// production code and runtime dependencies may reach the engine only via
// @caiae/sdk. Test files may use upstream packages as devDependency
// reference oracles (for example @caiae/rules evaluateRuleSet), because
// they never ship and do not duplicate engine behavior.

const root = resolve(process.env.ENGINE_BOUNDARY_ROOT || resolve(import.meta.dirname, ".."));
const roots = [join(root, "apps"), join(root, "packages")];
const skippedDirectories = new Set(["node_modules", "dist", ".next", "coverage", "test", "tests", "__tests__"]);
const violations = [];

function forbiddenTarget(target) {
  return (target.startsWith("@caiae/") && target !== "@caiae/sdk") || target.includes("vendor/caiae");
}

function isTestFile(name) {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(name);
}

function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) scan(path);
      continue;
    }
    if (entry.isFile() && entry.name === "package.json") {
      const manifest = JSON.parse(readFileSync(path, "utf8"));
      for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
        for (const name of Object.keys(manifest[field] ?? {})) {
          if (forbiddenTarget(name)) violations.push(`${relative(root, path)} ${field} includes ${name}`);
        }
      }
      continue;
    }
    if (!entry.isFile() || !/\.[cm]?[jt]sx?$/.test(entry.name) || isTestFile(entry.name)) continue;
    const content = readFileSync(path, "utf8");
    const imports = [...content.matchAll(/(?:from\s*|import\s*\(|require\s*\(|import\s+)\s*["']([^"']+)["']/g)];
    for (const [, target] of imports) {
      if (forbiddenTarget(target)) violations.push(`${relative(root, path)} imports ${target}`);
    }
  }
}

for (const directory of roots) if (existsSync(directory)) scan(directory);
if (violations.length) {
  console.error("CAIAE SDK boundary violations:\n" + violations.join("\n"));
  process.exit(1);
}
console.log("CAIAE boundary verified: production code and runtime dependencies use only @caiae/sdk.");
