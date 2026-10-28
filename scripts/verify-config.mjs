import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tsconfig = JSON.parse(fs.readFileSync(path.join(root, "tsconfig.json"), "utf8"));
assert.equal(tsconfig.compilerOptions.strict, true);
for (const script of ["dev", "build", "start", "lint", "typecheck", "test"]) assert(pkg.scripts[script], `Missing ${script}`);
for (const doc of ["README.md", "AGENTS.md", "docs/PRODUCT.md", "docs/ARCHITECTURE.md", "docs/PROGRESS.md", "docs/DECISIONS.md"]) assert(fs.statSync(path.join(root, doc)).size > 0, `Missing ${doc}`);

function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { scan(file); continue; }
    if (!/\.(tsx?|mjs)$/.test(entry.name)) continue;
    const source = fs.readFileSync(file, "utf8");
    assert(!source.includes("\uFFFD"), `Invalid replacement character in ${file}`);
    for (const match of source.matchAll(/(?:from\s+|import\s*\()\s*["']([.@][^"']+)["']/g)) {
      const specifier = match[1];
      if (!specifier.startsWith(".") && !specifier.startsWith("@/")) continue;
      const resolved = specifier.startsWith("@/") ? path.join(root, "src", specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
      assert([resolved, `${resolved}.ts`, `${resolved}.tsx`, `${resolved}.mjs`, `${resolved}/index.ts`, `${resolved}/index.tsx`].some(candidate => fs.existsSync(candidate)), `Unresolved local import ${specifier} in ${file}`);
    }
  }
}
scan(path.join(root, "src"));
console.log("Configuration, documentation, UTF-8 text and local module paths verified. This does not replace TypeScript or build checks.");
