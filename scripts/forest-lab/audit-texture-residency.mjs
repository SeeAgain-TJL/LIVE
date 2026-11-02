import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";

const reports = [];
for (const file of ["source-props.glb", "source-props-web-1k.glb"]) {
  const bytes = await readFile(path.resolve("public/forest-origin-assets", file));
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength));
  const binaryStart = 28 + jsonLength;
  let pixels = 0;
  const dimensions = [];
  for (const image of gltf.images) {
    const view = gltf.bufferViews[image.bufferView];
    const metadata = await sharp(bytes.subarray(binaryStart + view.byteOffset, binaryStart + view.byteOffset + view.byteLength)).metadata();
    dimensions.push([metadata.width, metadata.height]);
    pixels += metadata.width * metadata.height;
  }
  reports.push({ file, imageCount: gltf.images.length, dimensions,
    // Estimate of decoded RGBA8 + full mip chain; not measured GPU memory.
    estimatedRgbaMipMiB: pixels * 4 * 4 / 3 / 1048576,
    materials: gltf.materials.map(m => ({ name: m.name, alphaMode: m.alphaMode || "OPAQUE", doubleSided: m.doubleSided || false })),
    primitiveCounts: gltf.meshes.flatMap(mesh => mesh.primitives.map(p => ({
      vertices: gltf.accessors[p.attributes.POSITION].count, indices: gltf.accessors[p.indices].count }))),
    sourceNames: gltf.nodes.filter(n => n.name?.startsWith("source__")).map(n => n.name).sort(),
    sourceTransforms: gltf.nodes.filter(n => n.name?.startsWith("source__")).map(n => ({ name: n.name,
      matrix: n.matrix, translation: n.translation, rotation: n.rotation, scale: n.scale })).sort((a, b) => a.name.localeCompare(b.name)) });
}
for (const key of ["materials", "primitiveCounts", "sourceNames", "sourceTransforms", "imageCount"]) assert.deepEqual(reports[0][key], reports[1][key], key);
const folder = path.resolve(process.env.PINE_EVIDENCE || "artifacts-local/pine-batch1");
await mkdir(folder, { recursive: true });
await writeFile(path.join(folder, "texture-residency.json"), JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports.map(({ file, imageCount, estimatedRgbaMipMiB, sourceNames }) =>
  ({ file, imageCount, estimatedRgbaMipMiB, sourceObjects: sourceNames.length }))));
