import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import { gzipSync } from "node:zlib";
import { createInterface } from "node:readline";
import path from "node:path";

const folder = path.join(process.env.LOCALAPPDATA, "UNIVERSE-OF-ME", "asset-audit", "candidate-assets", "pine-source-conversion");
const inventory = JSON.parse(await readFile(path.join(folder, "render-inventory.json"), "utf8"));
const center = [23.155473709106445, -47.55979919433594];
const radius = 38;
const records = [];
let inspected = 0;
for (const tile of Object.keys(inventory.tileCounts)) {
  const [tileX, tileY] = tile.split("_").map(Number);
  const nearestX = Math.max(tileX * 32, Math.min(center[0], (tileX + 1) * 32));
  const nearestY = Math.max(tileY * 32, Math.min(center[1], (tileY + 1) * 32));
  if (Math.hypot(nearestX - center[0], nearestY - center[1]) > radius) continue;
  const stream = createReadStream(path.join(folder, "source-layout-tiles", `${tile}.jsonl.gz`)).pipe(createGunzip());
  for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) {
    inspected += 1;
    const record = JSON.parse(line);
    const matrix = record[1];
    if (Math.hypot(matrix[0][3] - center[0], matrix[1][3] - center[1]) <= radius) records.push(record);
  }
}
const result = { sourceSha256: inventory.sourceSha256, center, radius, assetNames: inventory.sourceAssetNames, records };
const file = path.join(folder, "source-camera-preview.json");
await writeFile(file, JSON.stringify(result));
const compressed = gzipSync(await readFile(file), { level: 9 });
await writeFile(file + ".gz", compressed);
console.log(JSON.stringify({ file, inspected, selected: records.length, bytes: (await readFile(file)).length,
  gzipBytes: compressed.length }));
