import { execFileSync } from "node:child_process";
import { stripTypeScriptTypes } from "node:module";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { bakePlanetMaps, createPlanetBake } from "../src/components/three/planet-texture.ts";
import { createSeed } from "../src/data/seed.ts";

const output = path.resolve("artifacts-local/exterior-batch-1.1"); await fs.mkdir(output, { recursive: true });
const source = execFileSync("git", ["show", "2953935:src/components/three/planet-texture.ts"], { encoding: "utf8" });
const baseline = path.join(output, "baseline-sampler.mjs");
await fs.writeFile(baseline, stripTypeScriptTypes(source));
const original = await import(pathToFileURL(baseline).href);
const results = [];
try {
  for (const { appearance } of createSeed().planets) for (const tier of ["low", "medium", "high"]) {
    const before = original.bakePlanetMaps(appearance, tier), after = bakePlanetMaps(appearance, tier);
    const sliced = createPlanetBake(appearance, tier);
    while (!sliced.done) sliced.advance(7);
    for (const channel of ["albedo", "surface"]) {
      const hash = bytes => createHash("sha256").update(bytes).digest("hex");
      const expected = hash(before[channel]), actual = hash(after[channel]), resumed = hash(sliced.maps[channel]);
      if (expected !== actual || expected !== resumed) throw new Error(`Pixel mismatch ${appearance.type}/${tier}/${channel}`);
      results.push({ type: appearance.type, tier, channel, sha256: expected, equal: true });
    }
  }
  await fs.mkdir("docs/exterior-batch-1.1", { recursive: true });
  await fs.writeFile("docs/exterior-batch-1.1/pixel-equivalence.json", JSON.stringify({ baseline: "2953935", results }, null, 2) + "\n");
  console.log(`Verified ${results.length} byte-identical channels, both full and resumed baking.`);
} finally { await fs.unlink(baseline); }
