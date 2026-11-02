import { spawnSync } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const home = path.join(process.env.LOCALAPPDATA, "UNIVERSE-OF-ME");
const output = path.join(home, "asset-audit", "candidate-assets", "pine-source-conversion", "trees-realized");
const gltfpack = path.join(home, "tools", "gltfpack-1.3", "gltfpack.exe");
const report = JSON.parse(await readFile(path.join(output, "conversion-report.json"), "utf8"));
const results = {};
for (const source of Object.keys(report.trees).sort()) {
  const raw = path.join(output, `${source}_unreduced.glb`);
  results[source] = {};
  for (const tier of [
    { name: "lod03", ratio: "0.03", error: "0.01", textureLimit: "1024" },
    { name: "lod01", ratio: "0.01", error: "0.02", textureLimit: "512" },
    { name: "lod003", ratio: "0.003", error: "0.03", textureLimit: "256" },
  ]) {
    const file = path.join(output, `${source}-${tier.name}-meshopt-webp.glb`);
    if (!(await stat(file).catch(() => null))) {
      const run = spawnSync(gltfpack, ["-i", raw, "-o", file, "-c", "-tw", "-km", "-si", tier.ratio, "-se", tier.error,
        "-tl", tier.textureLimit], { encoding: "utf8", maxBuffer: 1024 * 1024 });
      if (run.status !== 0) throw new Error(`${source} ${tier.name}: ${run.stderr || run.stdout}`);
    }
    results[source][tier.name] = { bytes: (await stat(file)).size, ratio: Number(tier.ratio), error: Number(tier.error),
      textureLimit: Number(tier.textureLimit) };
    console.log("SOURCE_LOD", source, tier.name, results[source][tier.name].bytes);
  }
}
await writeFile(path.join(output, "preview-lods-report.json"), JSON.stringify(results, null, 2));
