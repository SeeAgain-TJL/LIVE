import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createGunzip, gzipSync } from "node:zlib";
import { createInterface } from "node:readline";
import path from "node:path";

const source = path.join(process.env.LOCALAPPDATA, "UNIVERSE-OF-ME", "asset-audit", "candidate-assets", "pine-source-conversion");
const destination = path.join(source, "runtime-tiles");
const webDestination = path.join(source, "runtime-web-tiles");
const inventory = JSON.parse(await readFile(path.join(source, "render-inventory.json"), "utf8"));
const trees = JSON.parse(await readFile(path.join(source, "source-tree-placements.json"), "utf8"));
await mkdir(destination, { recursive: true });
await mkdir(webDestination, { recursive: true });
const summary = { sourceSha256: inventory.sourceSha256, tileSize: inventory.tileSizeBlenderUnits, tiles: {}, assets: inventory.sourceMeshAssets.length };
const webSummary = { sourceSha256: inventory.sourceSha256, tileSize: inventory.tileSizeBlenderUnits, tiles: {},
  policy: "Stable subset of original instances, retaining every tree and every source matrix in the full archive." };
function divisor(name) {
  if (name.startsWith("moss_patch")) return 40;
  if (name.startsWith("pine_cover")) return 20;
  if (name.startsWith("rock_moss_set_02")) return 4;
  if (name.startsWith("fern") || name.startsWith("grass")) return 4;
  return 3;
}
const treeTiles = new Map();
for (const item of trees) {
  const tile = `${Math.floor(item.matrix[0][3] / 32)}_${Math.floor(item.matrix[1][3] / 32)}`;
  if (!treeTiles.has(tile)) treeTiles.set(tile, []);
  treeTiles.get(tile).push(item);
}
for (const tile of new Set([...Object.keys(inventory.tileCounts), ...treeTiles.keys()])) {
  const records = [];
  if (inventory.tileCounts[tile]) {
    const stream = createReadStream(path.join(source, "source-layout-tiles", `${tile}.jsonl.gz`)).pipe(createGunzip());
    for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) records.push(JSON.parse(line));
  }
  const treeRecords = treeTiles.get(tile) || [];
  const payload = { tile, trees: treeRecords, props: records };
  const compressed = gzipSync(JSON.stringify(payload), { level: 7 });
  await writeFile(path.join(destination, `${tile}.json.gz`), compressed);
  summary.tiles[tile] = { trees: treeRecords.length, props: records.length, bytes: compressed.length };
  const webRecords = records.filter(([index, rows]) => {
    const name = inventory.sourceAssetNames[index];
    const transformKey = Math.round(rows[0][3] * 13) + Math.round(rows[1][3] * 17) + Math.round(rows[2][3] * 19);
    return Math.abs(transformKey) % divisor(name) === 0;
  });
  const webBytes = gzipSync(JSON.stringify({ tile, trees: treeRecords, props: webRecords }), { level: 7 });
  await writeFile(path.join(webDestination, `${tile}.json.gz`), webBytes);
  webSummary.tiles[tile] = { trees: treeRecords.length, props: webRecords.length, bytes: webBytes.length };
}
await writeFile(path.join(destination, "manifest.json"), JSON.stringify(summary));
await writeFile(path.join(webDestination, "manifest.json"), JSON.stringify(webSummary));
if (Object.values(summary.tiles).reduce((sum, tile) => sum + tile.trees, 0) !== trees.length ||
    Object.values(summary.tiles).reduce((sum, tile) => sum + tile.props, 0) !== inventory.sourceMeshInstanceCount) {
  throw new Error("Runtime tile totals differ from the source render inventory");
}
console.log(JSON.stringify({ tiles: Object.keys(summary.tiles).length, trees: Object.values(summary.tiles).reduce((sum, tile) => sum + tile.trees, 0),
  props: Object.values(summary.tiles).reduce((sum, tile) => sum + tile.props, 0),
  compressedMB: Math.round(Object.values(summary.tiles).reduce((sum, tile) => sum + tile.bytes, 0) / 1048576),
  webProps: Object.values(webSummary.tiles).reduce((sum, tile) => sum + tile.props, 0),
  webMB: Math.round(Object.values(webSummary.tiles).reduce((sum, tile) => sum + tile.bytes, 0) / 1048576) }));
