import { Material, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from "three";

/** Source pine_twig adds an ungated Translucent BSDF to its alpha Principled.
 * The isolated pine_04 trial restores surface coverage, not Cycles scattering. */
export function pineSourceNeedleSurface(material: Material) {
  if(!material.name.startsWith("pine_twig")) return;
  material.transparent=false;
  material.alphaTest=0;
  material.depthWrite=true;
  material.needsUpdate=true;
}

/** Batch4: the original terrain material is three full Poly Haven PBR sets
 * (forest_leaves_04, forest_ground_04, rocky_trail) blended by real path/river
 * vertex masks, each with its own diffuse/normal/roughness detail frequency.
 * Batch3B pre-baked that blend into one flat composite, which lost each
 * material's own texture scale and produced the "smeared" ground. This loads
 * the three source materials plus the rasterized path/river mask and blends
 * them per-pixel in the fragment shader, matching the original node-group mix
 * order (path: leaves -> ground, river: that result -> rocky_trail). Terrain
 * geometry is untouched; only the ground material composition changes. */
export async function loadPineTerrainLayeredMaterial() {
  const loader = new TextureLoader();
  const base = "/forest-origin-assets/batch4/terrain/";
  const [leavesDiff, leavesNormal, leavesRough, groundDiff, groundNormal, groundRough,
    trailDiff, trailNormal, trailRough, masks] = await Promise.all([
    loader.loadAsync(base + "forest_leaves_04_diff.webp"),
    loader.loadAsync(base + "forest_leaves_04_nor_gl.webp"),
    loader.loadAsync(base + "forest_leaves_04_rough.webp"),
    loader.loadAsync(base + "forest_ground_04_diff.webp"),
    loader.loadAsync(base + "forest_ground_04_nor_gl.webp"),
    loader.loadAsync(base + "forest_ground_04_rough.webp"),
    loader.loadAsync(base + "rocky_trail_diff.webp"),
    loader.loadAsync(base + "rocky_trail_nor_gl.webp"),
    loader.loadAsync(base + "rocky_trail_rough.webp"),
    loader.loadAsync(base + "blend-masks.webp"),
  ]);
  const tiled = [leavesDiff, leavesNormal, leavesRough, groundDiff, groundNormal, groundRough, trailDiff, trailNormal, trailRough];
  // Source Generated-coordinate mapping repeats each material many times across
  // the 200m terrain; approximate with UV tiling so each layer keeps its real
  // close-up detail scale instead of stretching one tile over the whole plane.
  const repeat = 18;
  for (const map of tiled) { map.wrapS = map.wrapT = RepeatWrapping; map.repeat.set(repeat, repeat); map.anisotropy = 4; }
  leavesDiff.colorSpace = SRGBColorSpace; groundDiff.colorSpace = SRGBColorSpace; trailDiff.colorSpace = SRGBColorSpace;
  masks.flipY = false;
  const material = new MeshStandardMaterial({ map: leavesDiff, normalMap: leavesNormal, roughnessMap: leavesRough, roughness: 1 });
  material.onBeforeCompile = shader => {
    shader.uniforms.leavesDiff = { value: leavesDiff };
    shader.uniforms.leavesNormal = { value: leavesNormal };
    shader.uniforms.leavesRough = { value: leavesRough };
    shader.uniforms.groundDiff = { value: groundDiff };
    shader.uniforms.groundNormal = { value: groundNormal };
    shader.uniforms.groundRough = { value: groundRough };
    shader.uniforms.trailDiff = { value: trailDiff };
    shader.uniforms.trailNormal = { value: trailNormal };
    shader.uniforms.trailRough = { value: trailRough };
    shader.uniforms.blendMasks = { value: masks };
    shader.uniforms.layerRepeat = { value: repeat };
    const declarations = `
      uniform sampler2D leavesDiff, leavesNormal, leavesRough;
      uniform sampler2D groundDiff, groundNormal, groundRough;
      uniform sampler2D trailDiff, trailNormal, trailRough;
      uniform sampler2D blendMasks;
      uniform float layerRepeat;
      varying vec2 pineMaskUv;
    `;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\nvarying vec2 pineMaskUv;`);
    shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>", `#include <uv_vertex>\npineMaskUv = uv;`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${declarations}`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
      {
        vec2 tiled = vMapUv;
        vec2 mk = texture2D(blendMasks, pineMaskUv).rg;
        vec4 leaves = texture2D(leavesDiff, tiled);
        vec4 groundC = texture2D(groundDiff, tiled);
        vec4 trail = texture2D(trailDiff, tiled);
        vec4 pathMixed = mix(leaves, groundC, mk.x);
        vec4 riverMixed = mix(pathMixed, trail, mk.y);
        diffuseColor *= riverMixed;
      }
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `
      float roughnessFactor = roughness;
      {
        vec2 tiled = vMapUv;
        vec2 mk = texture2D(blendMasks, pineMaskUv).rg;
        float leavesR = texture2D(leavesRough, tiled).g;
        float groundR = texture2D(groundRough, tiled).g;
        float trailR = texture2D(trailRough, tiled).g;
        float pathR = mix(leavesR, groundR, mk.x);
        roughnessFactor *= mix(pathR, trailR, mk.y);
      }
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", `
      {
        vec2 tiled = vMapUv;
        vec2 mk = texture2D(blendMasks, pineMaskUv).rg;
        vec3 leavesN = texture2D(leavesNormal, tiled).xyz * 2.0 - 1.0;
        vec3 groundN = texture2D(groundNormal, tiled).xyz * 2.0 - 1.0;
        vec3 trailN = texture2D(trailNormal, tiled).xyz * 2.0 - 1.0;
        vec3 pathN = mix(leavesN, groundN, mk.x);
        vec3 mapN = normalize(mix(pathN, trailN, mk.y));
        mapN.xy *= normalScale;
        normal = normalize(tbn * mapN);
      }
    `);
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => "pine-batch4-layered-terrain";
  const maps = [leavesDiff, leavesNormal, leavesRough, groundDiff, groundNormal, groundRough, trailDiff, trailNormal, trailRough, masks] as Texture[];
  return { material, maps };
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
