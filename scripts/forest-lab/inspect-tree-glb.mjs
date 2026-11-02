import { open } from "node:fs/promises";
import path from "node:path";

const root = path.join(process.env.LOCALAPPDATA, "UNIVERSE-OF-ME", "asset-audit", "candidate-assets");
for (const file of [path.join(root, "pine-runtime", "pine-high.glb"), path.join(root, "single-tree", "pine_02_unreduced.glb")]) {
  const handle = await open(file, "r");
  const header = Buffer.alloc(20);
  await handle.read(header, 0, 20, 0);
  const jsonSize = header.readUInt32LE(12);
  const json = Buffer.alloc(jsonSize);
  await handle.read(json, 0, jsonSize, 20);
  const gltf = JSON.parse(json.toString("utf8"));
  console.log(file, "bytes", header.readUInt32LE(8), "meshes", gltf.meshes?.length);
  for (const material of gltf.materials ?? []) {
    console.log("MATERIAL", material.name, "alphaMode", material.alphaMode ?? "OPAQUE",
      "alphaCutoff", material.alphaCutoff ?? null, "doubleSided", material.doubleSided ?? false,
      "baseColorTexture", material.pbrMetallicRoughness?.baseColorTexture?.index ?? null,
      "normalTexture", material.normalTexture?.index ?? null);
  }
  for (const mesh of gltf.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    console.log("PRIMITIVE", gltf.materials?.[primitive.material]?.name,
      "vertices", gltf.accessors?.[primitive.attributes.POSITION]?.count,
      "uv", primitive.attributes.TEXCOORD_0 !== undefined,
      "normals", primitive.attributes.NORMAL !== undefined,
      "indices", gltf.accessors?.[primitive.indices]?.count);
  }
  await handle.close();
}
