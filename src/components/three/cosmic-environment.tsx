"use client";

import { useMemo } from "react";
import { Color, DoubleSide } from "three";
import { identitySeed, type RenderTier } from "@/domain/cosmic-visuals";
import { DeepSpace } from "./deep-space";

const vertex = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragment = `varying vec2 vUv; uniform vec3 tint; uniform float seed;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+seed)*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5; for(int i=0;i<5;i++){v+=a*noise(p);p=mat2(.8,-.6,.6,.8)*p*2.03+4.;a*=.5;}return v;}
void main(){vec2 p=vUv*2.-1.; float cloud=fbm(p*3.+fbm(p*2.)*2.);
float edge=pow(max(0.,1.-dot(p,p)),2.);float lane=fbm(p*7.+2.);
float density=smoothstep(.27,.85,cloud)*edge;
gl_FragColor=vec4(tint*(.22+lane*.5),density*.42);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

/** Static world-space volumes and distant star shells create parallax, not a sky video. */
export function CosmicEnvironment({ tier, identity = "universe" }: { tier: RenderTier; identity?: string }) {
  const seed = identitySeed(identity);
  const mist = useMemo(() => ["#547ca0", "#73627d", "#877253"].map((color, i) => ({ tint: { value: new Color(color) }, seed: { value: seed % 100 + i * 19 } })), [seed]);
  return <>
    <color attach="background" args={["#03060c"]} />
    <DeepSpace seed={seed} tier={tier} local={identity !== "universe"} />
    {mist.slice(0, tier === "low" ? 1 : 2).map((uniforms, i) => <mesh key={i} position={[-110 + i * 115, 20 + i * 18, -190 - i * 70]} rotation={[0, i * 0.2, -0.45 + i * 0.6]} raycast={() => null}>
      <planeGeometry args={[430, 190]} /><shaderMaterial uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} transparent depthWrite={false} side={DoubleSide} />
    </mesh>)}
  </>;
}
