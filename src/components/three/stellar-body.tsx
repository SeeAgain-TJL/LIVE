"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { AdditiveBlending, BackSide, Color, Vector3, type ShaderMaterial } from "three";
import type { StellarSource } from "@/domain/spatial-scene";
import { spaceNoise } from "./space-noise";

const vertex = `varying vec3 surface;varying vec3 n;varying vec3 eye;void main(){surface=position;n=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);eye=-mv.xyz;gl_Position=projectionMatrix*mv;}`;
const fragment = `varying vec3 surface;varying vec3 n;varying vec3 eye;uniform float time;
${spaceNoise}
void main(){vec3 p=normalize(surface);vec3 drift=vec3(time*.009,-time*.006,0.);vec3 warp=p*9.+vec3(fbm3(p*6.+drift))*1.7;float cells=noise3(warp*4.+drift);float small=noise3(warp*12.-drift);float granules=pow(smoothstep(.18,.8,cells),.7);float network=pow(1.-abs(2.*noise3(warp*2.)-1.),7.);float spots=smoothstep(.66,.8,fbm3(p*7.-drift))*smoothstep(.05,.22,abs(p.y));float mu=max(0.,dot(normalize(n),normalize(eye)));float limb=.34+.66*pow(mu,.5);vec3 dark=vec3(.72,.19,.025),hot=vec3(2.2,1.18,.38);vec3 color=mix(dark,hot,.38+granules*.48+small*.08);color*=1.-spots*.79;color+=vec3(.65,.12,.006)*network*.25;gl_FragColor=vec4(color*limb,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
const corona = `varying vec3 surface;varying vec3 n;varying vec3 eye;uniform float time;uniform float shell;uniform vec3 tint;
${spaceNoise}
void main(){float mu=abs(dot(normalize(n),normalize(eye)));float impact=sqrt(max(0.,1.-mu*mu))*shell;vec3 p=normalize(surface);float stream=fbm3(p*9.+vec3(0.,time*.012,0.));float tail=exp(-max(0.,impact-1.)*(4.+stream*4.));float base=smoothstep(.97,1.04,impact)*(1.-smoothstep(shell-.45,shell,impact));float rays=.18+pow(stream,4.)*4.;gl_FragColor=vec4(tint,tail*base*rays*.36);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

/** Procedural photosphere + two spatial corona shells + anchored magnetic arches. Not a solar physics solver. */
export function StellarBody({ source, reduced, low, color = "#ffaf51" }: { source: StellarSource; reduced: boolean; low: boolean; color?: string }) {
  const material = useRef<ShaderMaterial>(null), shellMaterials = useRef<(ShaderMaterial | null)[]>([]);
  const elapsed = useRef(0);
  const surface = useMemo(() => ({ time: { value: 0 } }), []);
  const shells = useMemo(() => [1.8, 3.3].slice(0, low ? 1 : 2).map(shell => ({ time: { value: 0 }, shell: { value: shell }, tint: { value: new Color(shell < 2 ? color : "#8e6655") } })), [low, color]);
  const loops = useMemo(() => [0, 1, 2].slice(0, low ? 1 : 3).map(index => Array.from({ length: 65 }, (_, i) => {
    const t = i / 64, angle = Math.PI * .5 + (t - .5) * .34 + index * .12;
    const radius = 1.002 + Math.sin(t * Math.PI) * (.12 + index * .025);
    return new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, Math.sin(t * Math.PI) * .04 + (index - 1) * .08);
  })), [low]);
  useFrame((_, dt) => { if (!reduced) elapsed.current += Math.min(dt, .05); if (material.current) material.current.uniforms.time.value = elapsed.current; for (const shell of shellMaterials.current) if (shell) shell.uniforms.time.value = elapsed.current; });
  return <group position={source.position} scale={source.radius}>
    <mesh raycast={() => null}><sphereGeometry args={[1, low ? 40 : 64, low ? 28 : 48]} /><shaderMaterial ref={material} uniforms={surface} vertexShader={vertex} fragmentShader={fragment} /></mesh>
    {shells.map((uniforms, index) => <mesh key={index} scale={uniforms.shell.value} raycast={() => null}><sphereGeometry args={[1, 40, 28]} /><shaderMaterial ref={value => { shellMaterials.current[index] = value; }} uniforms={uniforms} vertexShader={vertex} fragmentShader={corona} transparent depthWrite={false} side={BackSide} blending={AdditiveBlending} /></mesh>)}
    {loops.map((points, i) => <Line key={i} points={points} color="#f59837" lineWidth={low ? .7 : 1.4} transparent opacity={.4} depthWrite={false} raycast={() => null} />)}
  </group>;
}
