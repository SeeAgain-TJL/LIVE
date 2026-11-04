import {
  DoubleSide, MeshStandardMaterial, type Material, type Texture,
} from "three";

const fieldVertex = `
  varying vec3 pineWorld;
`;
const fieldPosition = `
  vec4 pinePosition = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    pinePosition = instanceMatrix * pinePosition;
  #endif
  pineWorld = (modelMatrix * pinePosition).xyz;
`;
const fieldFragment = `
  varying vec3 pineWorld;
  uniform sampler2D pineField;
  vec3 pineGround() {
    return texture2D(pineField, (vec2(pineWorld.x, -pineWorld.z) + vec2(104.0,101.0))/vec2(206.0,202.0)).rgb;
  }
  float pineHeight(vec3 field) {
    return (field.r*65280.0 + field.g*255.0)*(64.0/65535.0)-20.0;
  }
`;

/** One source-coordinate light field for both real geometry and atlas trees. */
export function applyPineCanopyField(material: Material, field: Texture, unlit=false) {
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key+"|pine-canopy-"+Number(unlit);
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material,shader,renderer);
    shader.uniforms.pineField = {value:field};
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\n"+fieldVertex)
      .replace("#include <project_vertex>", fieldPosition+"\n#include <project_vertex>");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>","#include <common>\n"+fieldFragment)
      .replace("#include <opaque_fragment>",`
        vec3 pineLocal = pineGround();
        float pineLift = smoothstep(1.0, 16.0, pineWorld.y - pineHeight(pineLocal));
        float pineShade = mix(pineLocal.b,1.0,pineLift);
        outgoingLight *= mix(${unlit ? "vec3(.58,.65,.67)" : "vec3(.32,.39,.43)"},vec3(1.0),pineShade);
        #include <opaque_fragment>`);
  };
  material.needsUpdate = true;
}

/** Water geometry remains the original river. Its shore opacity is derived
 * from the water/terrain height difference, with a single HDR reflection. */
export function makePineRiver(field: Texture, time: {value:number}) {
  const material = new MeshStandardMaterial({color:0x69796a,roughness:0.22,metalness:0.3,
    transparent:true,depthWrite:false,side:DoubleSide,envMapIntensity:0.53});
  material.forceSinglePass = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.pineField = {value:field};
    shader.uniforms.pineWaterTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>","#include <common>\n"+fieldVertex)
      .replace("#include <project_vertex>",fieldPosition+"\n#include <project_vertex>");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>","#include <common>\n"+fieldFragment+"\nuniform float pineWaterTime;")
      .replace("#include <color_fragment>",`
        #include <color_fragment>
        vec3 pineBed = pineGround();
        float pineDepth = max(0.0,pineWorld.y-pineHeight(pineBed));
        float pineDeep = 1.0-exp(-pineDepth*1.8);
        diffuseColor.rgb *= mix(vec3(.66,.65,.42),vec3(.12,.25,.25),pineDeep);
        diffuseColor.a *= mix(.08,.86,smoothstep(.04,.85,pineDepth));
      `)
      .replace("#include <normal_fragment_maps>",`
        #include <normal_fragment_maps>
        vec2 q = pineWorld.xz;
        vec2 wave = vec2(
          sin(dot(q,vec2(3.2,.8))-pineWaterTime*1.9)*.055+sin(dot(q,vec2(6.0,-2.2))+pineWaterTime*2.2)*.028,
          sin(dot(q,vec2(.7,4.4))-pineWaterTime*1.25)*.067+sin(dot(q,vec2(-2.6,7.0))+pineWaterTime*2.8)*.023
        );
        normal = normalize(normal+mat3(viewMatrix)*vec3(wave.x,0.0,wave.y));
      `)
      .replace("#include <opaque_fragment>",`
        float pineGrazing = pow(1.0-clamp(abs(dot(normal,normalize(vViewPosition))),0.0,1.0),5.0);
        outgoingLight *= mix(.33,.85,pineBed.b);
        diffuseColor.a = mix(diffuseColor.a,.74,pineGrazing*smoothstep(.02,.30,pineDepth));
        #include <opaque_fragment>`);
  };
  return material;
}
