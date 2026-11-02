import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";

const folder = path.join(process.env.LOCALAPPDATA, "UNIVERSE-OF-ME", "asset-audit", "candidate-assets", "pine-source-conversion");
const inventory = JSON.parse(await readFile(path.join(folder, "render-inventory.json"), "utf8"));
const assetFaces = new Map(inventory.sourceMeshAssets.map(item => [item.name, item.faces]));
const center = [23.155473709106445, -47.55979919433594];
const records = [];
const trees = [];
for (let x = -1; x <= 1; x++) for (let y = -3; y <= -1; y++) {
  const tile = `${x}_${y}`;
  const data = JSON.parse(gunzipSync(await readFile(path.join(folder, "runtime-web-tiles", `${tile}.json.gz`))));
  records.push(...data.props);
  trees.push(...data.trees);
}
const totals = new Map();
for (const [index, rows] of records) {
  const name = inventory.sourceAssetNames[index];
  const distance = Math.hypot(rows[0][3] - center[0], rows[1][3] - center[1]);
  if (distance > 27 || (name.startsWith("moss_patch") && distance > 11) || (name.startsWith("pine_cover") && distance > 18)) continue;
  const current = totals.get(name) || { name, count: 0, faces: 0 };
  current.count += 1;
  current.faces += assetFaces.get(name) || 0;
  totals.set(name, current);
}
console.log(JSON.stringify({ props: [...totals.values()].sort((a, b) => b.faces - a.faces).slice(0, 25),
  propFaces: [...totals.values()].reduce((sum, row) => sum + row.faces, 0),
  trees: trees.filter(item => Math.hypot(item.matrix[0][3] - center[0], item.matrix[1][3] - center[1]) <= 68).length }, null, 2));
