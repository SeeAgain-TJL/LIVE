"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { AdditiveBlending, NormalBlending, PerspectiveCamera, Vector3, type Points, type ShaderMaterial } from "three";

const vertex = `attribute float pointSize; varying vec3 vColor; varying float vDistance; uniform float pixelScale; uniform float minSize;
void main(){ vColor=color; vec4 mv=modelViewMatrix*vec4(position,1.);vDistance=length(mv.xyz);
gl_Position=projectionMatrix*mv; gl_PointSize=clamp(pointSize*pixelScale/max(1.,-mv.z),minSize,180.); }`;
const fragment = `varying vec3 vColor;varying float vDistance; uniform float opacity; uniform float soft;uniform float nearFade;
void main(){ float r=length(gl_PointCoord-.5)*2.; if(r>1.)discard;
float glow=exp(-r*r*mix(7.,4.5,soft))*(1.-smoothstep(.5,1.,r));
gl_FragColor=vec4(vColor,glow*opacity*smoothstep(nearFade*.2,max(.001,nearFade),vDistance));
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

export interface PointCloud { positions: Float32Array; colors: Float32Array; sizes: Float32Array }
/** One draw call per cloud, no per-star objects/textures; world-space sizes. */
export function CosmicPoints({ cloud, opacity = 1, soft = false, lod = false, minimumSize = 1, nearFade = 0, additive = true }: { cloud: PointCloud; opacity?: number; soft?: boolean; lod?: boolean; minimumSize?: number; nearFade?: number; additive?: boolean }) {
  const points = useRef<Points>(null), material = useRef<ShaderMaterial>(null);
  const { size, gl } = useThree();
  const world = useMemo(() => new Vector3(), []);
  const uniforms = useMemo(() => ({ pixelScale: { value: 1 }, minSize: { value: minimumSize }, opacity: { value: opacity }, soft: { value: soft ? 1 : 0 }, nearFade: { value: nearFade } }), [soft, opacity, minimumSize, nearFade]);
  const fraction = useRef(1);
  useFrame(({ camera }, dt) => {
    if (!points.current || !material.current) return;
    const focalScale = camera instanceof PerspectiveCamera ? .5 / Math.tan(camera.fov * Math.PI / 360) : 1.27;
    material.current.uniforms.pixelScale.value = size.height * gl.getPixelRatio() * focalScale;
    if (lod) {
      points.current.getWorldPosition(world);
      const distance = camera.position.distanceTo(world);
      const target = distance > 190 ? 0.28 : distance > 110 ? 0.55 : 1;
      fraction.current += (target - fraction.current) * Math.min(1, dt * 3);
      points.current.geometry.setDrawRange(0, Math.max(1, Math.floor(cloud.sizes.length * fraction.current)));
    }
  });
  return <points ref={points} raycast={() => null}>
    <bufferGeometry><bufferAttribute attach="attributes-position" args={[cloud.positions, 3]} /><bufferAttribute attach="attributes-color" args={[cloud.colors, 3]} /><bufferAttribute attach="attributes-pointSize" args={[cloud.sizes, 1]} /></bufferGeometry>
    <shaderMaterial ref={material} uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} vertexColors transparent depthWrite={false} blending={additive ? AdditiveBlending : NormalBlending} />
  </points>;
}
