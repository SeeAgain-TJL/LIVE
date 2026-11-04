import { Material, ShaderChunk } from "three";

/** Reuse InstancedMesh.instanceColor as an independent LOD weight. This
 * avoids cloning large shared tree vertex buffers for a single attribute. */
export function applyPineLodFade(material: Material) {
  // Keep rigid trunks crisp throughout crown blending; screen-door bark is
  // conspicuous at eye level. The aligned far trunk is only a weak back layer.
  if(!material.transparent && /bark|trunk|dead_branches/.test(material.name))return;
  const previous=material.onBeforeCompile;
  const key=material.customProgramCacheKey();
  material.customProgramCacheKey=()=>key+"|pine-lod-weight";
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
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
