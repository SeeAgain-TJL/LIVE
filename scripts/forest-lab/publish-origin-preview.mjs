import { copyFile, link, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const source = path.join(process.env.LOCALAPPDATA, "UNIVERSE-OF-ME", "asset-audit", "candidate-assets");
const derived = path.join(source, "pine-source-conversion");
const target = path.resolve("public", "forest-origin-assets");
const inventory = JSON.parse(await readFile(path.join(derived, "render-inventory.json"), "utf8"));

async function publish(from, relative) {
  const to = path.join(target, relative);
  await mkdir(path.dirname(to), { recursive: true });
  const previous = await stat(to).catch(() => null);
  const current = await stat(from);
  if (previous?.size === current.size) return;
  try { await link(from, to); }
  catch (error) {
    if (error.code === "EEXIST") await copyFile(from, to);
    else if (["EPERM", "EXDEV", "EACCES"].includes(error.code)) await copyFile(from, to);
    else throw error;
  }
}

await publish(path.join(derived, "render-inventory.json"), "render-inventory.json");
await publish(path.join(derived, "source-tree-placements.json"), "source-tree-placements.json");
await publish(path.join(derived, "source-camera-preview.json.gz"), "source-camera-preview.json.gz");
const runtime = JSON.parse(await readFile(path.join(derived, "runtime-tiles", "manifest.json"), "utf8"));
await publish(path.join(derived, "runtime-tiles", "manifest.json"), "runtime-tiles/manifest.json");
for (const tile of Object.keys(runtime.tiles)) await publish(path.join(derived, "runtime-tiles", `${tile}.json.gz`), `runtime-tiles/${tile}.json.gz`);
const webRuntime = JSON.parse(await readFile(path.join(derived, "runtime-web-tiles", "manifest.json"), "utf8"));
await publish(path.join(derived, "runtime-web-tiles", "manifest.json"), "runtime-web-tiles/manifest.json");
for (const tile of Object.keys(webRuntime.tiles)) await publish(path.join(derived, "runtime-web-tiles", `${tile}.json.gz`), `runtime-web-tiles/${tile}.json.gz`);
await publish(path.join(derived, "props", "source-props-named-meshopt-webp.glb"), "source-props.glb");
await publish(path.join(derived, "props", "source-props-web-1k.glb"), "source-props-web-1k.glb");
await publish(path.join(source, "pine-runtime", "terrain.glb"), "terrain.glb");
await publish(path.join(source, "pine-runtime", "sky.hdr"), "sky.hdr");
await publish(path.join(source, "pine-runtime", "placements.json"), "collision-layout.json");
for (const tile of Object.keys(inventory.tileCounts)) {
  await publish(path.join(derived, "source-layout-tiles", `${tile}.jsonl.gz`), `tiles/${tile}.jsonl.gz`);
}
for (const name of Object.keys(inventory.treeSpeciesCounts)) {
  for (const suffix of ["meshopt-webp", "lod03-meshopt-webp", "lod01-meshopt-webp", "lod003-meshopt-webp"]) {
    await publish(path.join(derived, "trees-realized", `${name}-${suffix}.glb`), `trees/${name}-${suffix}.glb`);
  }
}
console.log(JSON.stringify({ target, treeSpecies: Object.keys(inventory.treeSpeciesCounts).length,
  meshAssets: inventory.sourceMeshAssets.length, tiles: Object.keys(inventory.tileCounts).length }));
