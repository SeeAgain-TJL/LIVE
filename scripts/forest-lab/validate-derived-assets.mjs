import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";

const folder = path.join(process.env.LOCALAPPDATA, "UNIVERSE-OF-ME", "asset-audit", "candidate-assets", "pine-source-conversion");
const inventory = JSON.parse(await readFile(path.join(folder, "render-inventory.json"), "utf8"));
const report = JSON.parse(await readFile(path.join(folder, "trees-realized", "conversion-report.json"), "utf8"));

async function glb(file) {
  const handle = await open(file, "r");
  try {
    const header = Buffer.alloc(20);
    await handle.read(header, 0, 20, 0);
    if (header.toString("ascii", 0, 4) !== "glTF" || header.toString("ascii", 16, 20) !== "JSON") throw new Error(`Invalid GLB ${file}`);
    const json = Buffer.alloc(header.readUInt32LE(12));
    await handle.read(json, 0, json.length, 20);
    return JSON.parse(json.toString("utf8"));
  } finally { await handle.close(); }
}

if (report.sourceSha256 !== inventory.sourceSha256) throw new Error("Source hash mismatch");
const treeStats = [];
for (const source of Object.keys(inventory.treeSpeciesCounts).sort()) {
  const item = report.trees[source];
  if (!item || item.error) throw new Error(`Tree ${source} was not converted`);
  const file = path.join(folder, "trees-realized", `${source}-meshopt-webp.glb`);
  const data = await glb(file);
  const twig = source.startsWith("pine") ? "pine_twig" : "fir_twig";
  if (!data.materials?.some(material => material.name?.includes(twig) && material.alphaMode === "BLEND")) {
    throw new Error(`Tree ${source} missing alpha-textured source twig material`);
  }
  if (item.high.triangles < 500000) throw new Error(`Tree ${source} has too few triangles for a realized source tree`);
  treeStats.push({ source, triangles: item.high.triangles, mb: Math.round((await stat(file)).size / 1048576) });
}
const propsFile = path.join(folder, "props", "source-props-named-meshopt-webp.glb");
const props = await glb(propsFile);
const actualNames = new Set((props.nodes || []).filter(node => node.name?.startsWith("source__") &&
  node.children?.some(index => props.nodes[index]?.mesh !== undefined)).map(node => node.name));
const missing = inventory.sourceMeshAssets.map(asset => `source__${asset.name}`).filter(name => !actualNames.has(name));
if (missing.length) throw new Error(`Compressed props lost ${missing.length} named source mesh parents: ${missing.slice(0, 8).join(", ")}`);
console.log(JSON.stringify({ sourceSha256: inventory.sourceSha256, trees: treeStats, propObjects: inventory.sourceMeshAssets.length,
  propMaterials: props.materials?.length, propMb: Math.round((await stat(propsFile)).size / 1048576),
  propExtensions: props.extensionsUsed }, null, 2));
