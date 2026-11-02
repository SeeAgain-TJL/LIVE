import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import path from "node:path";

const folder = path.join(process.env.LOCALAPPDATA, "UNIVERSE-OF-ME", "asset-audit", "candidate-assets", "pine-source-conversion");
const inventory = JSON.parse(await readFile(path.join(folder, "render-inventory.json"), "utf8"));
const trees = JSON.parse(await readFile(path.join(folder, "source-tree-placements.json"), "utf8"));
const treeCounts = new Map();
for (const tree of trees) {
  if (!inventory.treeSpeciesCounts[tree.source] || tree.matrix.length !== 4 || tree.matrix.some(row => row.length !== 4 || row.some(value => !Number.isFinite(value)))) {
    throw new Error(`Invalid tree placement ${tree.source}`);
  }
  treeCounts.set(tree.source, (treeCounts.get(tree.source) || 0) + 1);
}
for (const [source, expected] of Object.entries(inventory.treeSpeciesCounts)) {
  if (treeCounts.get(source) !== expected) throw new Error(`Tree count mismatch for ${source}`);
}
if (trees.length !== inventory.treePlacementCount) throw new Error("Total tree count mismatch");

let allMeshes = 0;
for (const [tile, expected] of Object.entries(inventory.tileCounts)) {
  const stream = createReadStream(path.join(folder, "source-layout-tiles", tile + ".jsonl.gz")).pipe(createGunzip());
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let count = 0;
  for await (const line of lines) {
    const [assetIndex, matrix] = JSON.parse(line);
    const name = inventory.sourceAssetNames[assetIndex];
    if (!name || name.includes("proxy") || matrix.length !== 3 || matrix.some(row => row.length !== 4 || row.some(value => !Number.isFinite(value)))) {
      throw new Error(`Invalid source mesh placement in ${tile} at ${count}`);
    }
    count += 1;
  }
  if (count !== expected) throw new Error(`Tile ${tile}: expected ${expected}, got ${count}`);
  allMeshes += count;
}
if (allMeshes !== inventory.sourceMeshInstanceCount) throw new Error("Total mesh instance count mismatch");
console.log(JSON.stringify({ sourceSha256: inventory.sourceSha256, treeSpecies: treeCounts.size,
  treePlacements: trees.length, meshAssets: inventory.sourceMeshAssets.length,
  meshPlacements: allMeshes, tiles: Object.keys(inventory.tileCounts).length }, null, 2));
