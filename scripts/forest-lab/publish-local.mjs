import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const source = path.join(process.env.LOCALAPPDATA, "UNIVERSE-OF-ME", "asset-audit", "candidate-assets", "pine-runtime");
const destination = path.resolve("public", "forest-lab-assets");
const files = [
  "placements.json", "terrain.glb", "pine-high.glb", "pine-mid.glb",
  "fir-high.glb", "fir-mid.glb", "pine-proxy.glb", "fir-proxy.glb",
  "rock.glb", "fern.glb", "sky.hdr",
];

await mkdir(destination, { recursive: true });
for (const file of files) {
  await copyFile(path.join(source, file), path.join(destination, file));
  console.log(file);
}
