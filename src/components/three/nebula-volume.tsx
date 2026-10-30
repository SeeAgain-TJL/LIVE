"use client";
import { useEffect, useMemo } from "react";
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import { useFBO } from "@react-three/drei";
import { Color, Vector3, Matrix4, Scene, CustomBlending, SrcAlphaFactor, OneMinusSrcAlphaFactor, UnsignedByteType } from "three";
import { spaceNoise } from "./space-noise";
import type { RenderTier } from "@/domain/cosmic-visuals";

const vertex = `varying vec2 screen;void main(){screen=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const fragment = `varying vec2 screen;uniform mat4 invProjection;uniform mat4 cameraWorld;uniform vec3 volumeScale;uniform vec3 eye;uniform vec3 cool;uniform vec3 warm;uniform float seed;uniform int steps;
${spaceNoise}
void main(){vec4 ray=invProjection*vec4(screen*2.-1.,1.,1.);vec3 direction=normalize((cameraWorld*vec4(ray.xyz/ray.w,0.)).xyz/volumeScale);vec3 inverse=1./(direction+vec3(.000001));vec3 a=(-vec3(.5)-eye)*inverse,b=(vec3(.5)-eye)*inverse;vec3 lo=min(a,b),hi=max(a,b);float near=max(0.,max(lo.x,max(lo.y,lo.z))),far=min(hi.x,min(hi.y,hi.z));if(far<=near)discard;
float stride=(far-near)/float(steps);vec3 sum=vec3(0.);float opacity=0.;
for(int i=0;i<16;i++){if(i>=steps)break;vec3 p=eye+direction*(near+(float(i)+.5)*stride);vec3 n=p*vec3(4.,7.,4.)+vec3(seed,0.,0.);float flow=fbm3(n+noise3(n*1.7)*1.4);float ridge=p.y+.17*sin(p.x*6.+1.)+.08*sin(p.z*7.);float shape=exp(-ridge*ridge*42.)*(1.-smoothstep(.26,.52,length(p.xz)));float boundary=smoothstep(0.,.14,.5-max(abs(p.x),max(abs(p.y),abs(p.z))));float density=smoothstep(.28,.76,flow)*shape*boundary;float dust=smoothstep(.48,.78,noise3(n*3.4+7.));float alpha=1.-exp(-density*stride*6.);float bright=.15+pow(flow,3.)*2.;vec3 color=mix(cool,warm,smoothstep(-.15,.4,p.x+noise3(n*.6)*.3));color*=bright*(1.-dust*.84);sum+=(1.-opacity)*alpha*color;opacity+=(1.-opacity)*alpha;}
gl_FragColor=vec4(sum/max(.001,opacity),opacity);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
/** Bounded 3D density integration. One draw, bounded steps, no full-screen postprocessing. */
export function NebulaVolume({ tier, local = false, seed }: { tier: RenderTier; local?: boolean; seed: number }) {
  const { size, gl } = useThree();
  const resolution = tier === "low" ? .35 : tier === "medium" ? .4 : .5;
  // Diffuse gas has its own pixel budget, independent of the sharp celestial geometry.
  const target = useFBO(Math.ceil(size.width * resolution), Math.ceil(size.height * resolution), { depthBuffer: false, stencilBuffer: false, type: UnsignedByteType });
  const scene = useMemo(() => new Scene(), []), clear = useMemo(() => new Color(), []);
  const composite = useMemo(() => ({ image: { value: target.texture } }), [target]);
  useEffect(() => { gl.domElement.setAttribute("data-volume-target", `${target.width}x${target.height}`); }, [gl, target, size.width, size.height, tier]);
  const position = useMemo(() => new Vector3(local ? -12 : -20, local ? 12 : 18, local ? -90 : -135), [local]);
  const scale = useMemo(() => new Vector3(local ? 220 : 360, local ? 105 : 155, local ? 100 : 145), [local]);
  const uniforms = useMemo(() => ({ invProjection: { value: new Matrix4() }, cameraWorld: { value: new Matrix4() }, volumeScale: { value: scale }, eye: { value: new Vector3() }, cool: { value: new Color(local ? "#376383" : "#46677c") }, warm: { value: new Color(local ? "#917268" : "#8e756e") }, seed: { value: seed % 19 }, steps: { value: tier === "low" ? 4 : tier === "medium" ? 7 : 11 } }), [local, seed, tier, scale]);
  useFrame(({ camera }) => {
    uniforms.eye.value.copy(camera.position).sub(position).divide(scale);
    camera.updateMatrixWorld(); uniforms.invProjection.value.copy(camera.projectionMatrixInverse); uniforms.cameraWorld.value.copy(camera.matrixWorld);
    const previous = gl.getRenderTarget(), alpha = gl.getClearAlpha(); gl.getClearColor(clear);
    gl.setRenderTarget(target); gl.setClearColor(0, 0); gl.clear(); gl.render(scene, camera);
    gl.setRenderTarget(previous); gl.setClearColor(clear, alpha);
  });
  // The texture is a freshly ray-integrated 3D volume, not a static backdrop. Composite in
  // the opaque queue before planets, with explicit alpha blending; never wash over their surfaces.
  return <>{createPortal(<mesh frustumCulled={false} raycast={() => null}><planeGeometry args={[2, 2]} /><shaderMaterial uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} transparent depthWrite={false} depthTest={false} /></mesh>, scene)}
    <mesh frustumCulled={false} renderOrder={-90} raycast={() => null}><planeGeometry args={[2, 2]} /><shaderMaterial uniforms={composite} depthWrite={false} depthTest={false} blending={CustomBlending} blendSrc={SrcAlphaFactor} blendDst={OneMinusSrcAlphaFactor}
      vertexShader={`varying vec2 uvScreen;void main(){uvScreen=uv;gl_Position=vec4(position.xy,.99999,1.);}`}
      fragmentShader={`varying vec2 uvScreen;uniform sampler2D image;void main(){gl_FragColor=texture2D(image,uvScreen);gl_FragColor.rgb/=max(.0001,gl_FragColor.a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`} /></mesh>
  </>;
}
