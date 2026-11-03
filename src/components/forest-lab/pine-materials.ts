import { Material, MeshStandardMaterial, SRGBColorSpace, TextureLoader, type Texture } from "three";

/** Source pine_twig adds an ungated Translucent BSDF to its alpha Principled.
 * The isolated pine_04 trial restores surface coverage, not Cycles scattering. */
export function pineSourceNeedleSurface(material: Material) {
  if(!material.name.startsWith("pine_twig")) return;
  material.transparent=false;
  material.alphaTest=0;
  material.depthWrite=true;
  material.needsUpdate=true;
}

/** The bake keeps the source path/river masks; normal is tangent-space OpenGL. */
export async function loadPineTerrainMaterial() {
  const loader = new TextureLoader();
  const maps = await Promise.all(["basecolor", "normal", "roughness"].map(name => loader.loadAsync(`/forest-origin-assets/batch3b/terrain/${name}.webp`)));
  maps[0].colorSpace = SRGBColorSpace;
  for (const map of maps) { map.anisotropy = 4; map.flipY = false; }
  const material = new MeshStandardMaterial({map:maps[0],normalMap:maps[1],roughnessMap:maps[2],roughness:1});
  return { material, maps: maps as Texture[] };
}
