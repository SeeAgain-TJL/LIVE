import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const home = path.join(process.env.LOCALAPPDATA, "UNIVERSE-OF-ME");
const sourceRoot = path.join(home, "asset-audit", "candidate-assets");
const output = path.join(sourceRoot, "pine-source-conversion", "trees-realized");
const source = path.join(sourceRoot, "polyhaven_pine_fir_forest.blend");
const blender = path.join(home, "tools", "blender-4.4.3-windows-x64", "blender.exe");
const gltfpack = path.join(home, "tools", "gltfpack-1.3", "gltfpack.exe");
const sourceManifest = JSON.parse(await readFile(path.join(sourceRoot, "pine-source-conversion", "render-inventory.json"), "utf8"));
const treeNames = Object.keys(sourceManifest.treeSpeciesCounts).sort();
await mkdir(output, { recursive: true });

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const block of createReadStream(file)) hash.update(block);
  return hash.digest("hex");
}

function run(executable, args, env = process.env) {
  const result = spawnSync(executable, args, { env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${path.basename(executable)} exited ${result.status}: ${result.stderr}\n${result.stdout}`);
  return (result.stdout + "\n" + result.stderr).trim().slice(-2500);
}

function inspectGlb(buffer) {
  const size = buffer.readUInt32LE(12);
  if (buffer.toString("ascii", 0, 4) !== "glTF" || buffer.toString("ascii", 16, 20) !== "JSON") {
    throw new Error("Invalid GLB header");
  }
  const gltf = JSON.parse(buffer.subarray(20, 20 + size).toString("utf8"));
  const triangles = (gltf.meshes || []).flatMap(mesh => mesh.primitives || []).reduce(
    (sum, primitive) => sum + Math.floor((gltf.accessors?.[primitive.indices]?.count || 0) / 3), 0);
  return { triangles, materials: gltf.materials?.map(material => ({ name: material.name, alphaMode: material.alphaMode || "OPAQUE" })) || [],
    extensions: gltf.extensionsUsed || [] };
}

if (await sha256(source) !== sourceManifest.sourceSha256) throw new Error("Source .blend hash changed since manifest extraction");
const report = { source, sourceSha256: sourceManifest.sourceSha256, blender: "4.4.3", gltfpack: "1.3", trees: {} };
for (const name of treeNames) {
  const exported = path.join(output, `${name}_unreduced.glb`);
  const high = path.join(output, `${name}-meshopt-webp.glb`);
  const mid = path.join(output, `${name}-lod10-meshopt-webp.glb`);
  try {
    if (!(await stat(exported).catch(() => null))) {
      run(blender, ["-b", source, "--python", "scripts/forest-lab/export-single-tree.py", "--", name],
        { ...process.env, PINE_CONVERSION_OUTPUT: output });
    }
    if (!(await stat(exported).catch(() => null))) throw new Error("Blender did not produce a source tree GLB");
    if (!(await stat(high).catch(() => null))) run(gltfpack, ["-i", exported, "-o", high, "-c", "-tw", "-km"]);
    if (!(await stat(mid).catch(() => null))) run(gltfpack, ["-i", exported, "-o", mid, "-c", "-tw", "-km", "-si", "0.1", "-se", "0.01"]);
    const highSummary = inspectGlb(await readFile(high));
    const midSummary = inspectGlb(await readFile(mid));
    report.trees[name] = { sourceBytes: (await stat(exported)).size, highBytes: (await stat(high)).size,
      midBytes: (await stat(mid)).size, high: highSummary, mid: midSummary, placements: sourceManifest.treeSpeciesCounts[name] };
    console.log("CONVERTED", name, report.trees[name].highBytes, report.trees[name].midBytes, highSummary.triangles, midSummary.triangles);
  } catch (error) {
    report.trees[name] = { error: String(error), placements: sourceManifest.treeSpeciesCounts[name] };
    console.error("FAILED", name, String(error));
  }
  await writeFile(path.join(output, "conversion-report.json"), JSON.stringify(report, null, 2));
}
if (await sha256(source) !== sourceManifest.sourceSha256) throw new Error("Source .blend changed during conversion");
const failures = Object.entries(report.trees).filter(([, result]) => result.error).map(([name]) => name);
console.log("SOURCE_TREE_CONVERSION", { total: treeNames.length, failures, output });
if (failures.length) process.exitCode = 1;
