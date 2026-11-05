import { Material, ShaderChunk } from "three";

/** Complementary coverage for two opaque or alpha-masked geometry LODs. */
export function applyPineGeometryTransition(material: Material) {
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + "|pine-geometry-transition";
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float pineGeometryWeight;")
      .replace("#include <color_vertex>", ShaderChunk.color_vertex.replace("vColor.xyz *= instanceColor.xyz;", "") + `
        pineGeometryWeight = 1.0;
        #ifdef USE_INSTANCING_COLOR
          pineGeometryWeight = instanceColor.r;
        #endif
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float pineGeometryWeight;")
      .replace("#include <alphatest_fragment>", `
        #include <alphatest_fragment>
        float pineLodNoise = fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
        if (pineGeometryWeight >= 0.0 ? pineLodNoise >= pineGeometryWeight : pineLodNoise < -pineGeometryWeight) discard;
      `);
  };
  material.needsUpdate = true;
}

export function shouldApplyPineLodFade(material: Material) {
  return material.transparent || !/bark|trunk|stem|dead[ _-]?branches/i.test(material.name.trim());
}

/** Reuse InstancedMesh.instanceColor as an independent LOD weight. This
 * avoids cloning large shared tree vertex buffers for a single attribute. */
export function applyPineLodFade(material: Material) {
  // Keep rigid trunks crisp throughout crown blending; screen-door bark is
  // conspicuous at eye level. The aligned far trunk is only a weak back layer.
  const fade = shouldApplyPineLodFade(material);
  const previous=material.onBeforeCompile;
  const key=material.customProgramCacheKey();
  material.customProgramCacheKey=()=>key+(fade ? "|pine-lod-weight-v2":"|pine-lod-neutral-wood-v2");
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    // Every tree part receives (LOD weight, 1, 1) as instanceColor. Wood
    // must remove RGB multiplication too, even when it does not fade.
    // Returning before this patch reduced red only and made bark cyan/green.
    if (!fade) {
      shader.vertexShader = shader.vertexShader.replace("#include <color_vertex>",
        ShaderChunk.color_vertex.replace("vColor.xyz *= instanceColor.xyz;", ""));
      return;
    }
    shader.vertexShader=shader.vertexShader
      .replace("#include <common>","#include <common>\nvarying float pineLodWeight;")
      .replace("#include <color_vertex>",ShaderChunk.color_vertex.replace("vColor.xyz *= instanceColor.xyz;","" )+`
        pineLodWeight=1.0;
        #ifdef USE_INSTANCING_COLOR
          pineLodWeight=instanceColor.r;
        #endif
      `);
    shader.fragmentShader=shader.fragmentShader
      .replace("#include <common>","#include <common>\nvarying float pineLodWeight;")
      .replace("#include <alphatest_fragment>",material.transparent ? `
        diffuseColor.a *= pineLodWeight;
        #include <alphatest_fragment>
      ` : `
        // Stable screen-door transition, without another render target/pass.
        float pineNoise=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
        if(pineLodWeight<pineNoise) discard;
        #include <alphatest_fragment>
      `);
  };
  material.needsUpdate=true;
}
