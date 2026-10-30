"use client";

import { useMemo } from "react";
import { AdditiveBlending, Color, DoubleSide } from "three";
import { galaxyStyle } from "@/domain/cosmic-visuals";

const vertex = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragment = `varying vec2 vUv;uniform vec3 tint;uniform float arms;uniform float twist;uniform float elliptical;uniform float seed;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+seed)*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=noise(p)*a;p=mat2(.8,-.6,.6,.8)*p*2.07+3.;a*=.5;}return v;}
void main(){vec2 p=(vUv-.5)*2.6; float r=length(p);float angle=atan(-p.y,p.x);
float turbulence=fbm(p*12.);float phase=(angle-r*twist)*arms;
float spiral=pow(.5+.5*cos(phase+(turbulence-.5)*1.8),6.);
float disk=exp(-r*2.7)*(0.3+spiral*1.8)*(1.-smoothstep(.65,1.25,r));
disk=mix(disk,exp(-r*4.)*.7,elliptical);
float dust=smoothstep(.32,.72,fbm(p*23.+6.));
disk*=mix(.22,1.2,dust);
float core=exp(-r*r*65.);float bulge=exp(-r*r*16.);
vec3 light=tint*disk*1.4+vec3(1.,.78,.49)*(core*.55+bulge*.17);
float alpha=clamp(disk*.7+core*.9+bulge*.28,0.,.95);
gl_FragColor=vec4(light,alpha);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

/** A resolved luminous disk with turbulent dust lanes, under the 3D stellar volume. */
export function GalaxyDisk({ id, color }: { id: string; color: string }) {
  const style = useMemo(() => galaxyStyle(id), [id]);
  const uniforms = useMemo(() => ({ tint: { value: new Color(color).lerp(new Color("#86a9db"), 0.15) }, arms: { value: style.arms }, twist: { value: style.twist }, elliptical: { value: style.elliptical ? 1 : 0 }, seed: { value: style.seed % 1000 } }), [color, style]);
  return <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[1, style.flatten, 1]} raycast={() => null}>
    <planeGeometry args={[style.radius * 2.6, style.radius * 2.6]} />
    <shaderMaterial vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} transparent depthWrite={false} blending={AdditiveBlending} side={DoubleSide} />
  </mesh>;
}
