"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferGeometry, Color, Float32BufferAttribute, Object3D, BackSide, type InstancedMesh, type ShaderMaterial } from "three";
import { worldHeight } from "@/domain/planet-world";

function Landscape({ low }: { low: boolean }) {
  const geometry = useMemo(() => {
    const segments = low ? 96 : 180, vertices: number[] = [], colors: number[] = [], indices: number[] = [];
    const sand = new Color('#b6ab7c'), grass = new Color('#648552'), forest = new Color('#355b48'), rock = new Color('#7b8482');
    for (let j = 0; j <= segments; j++) for (let i = 0; i <= segments; i++) {
      const x = (i / segments - .5) * 190, z = (j / segments - .5) * 190, y = worldHeight(x, z);
      vertices.push(x, y, z);
      const c = y < .65 ? sand.clone().lerp(grass, Math.max(0, y / .65)) : grass.clone().lerp(forest, Math.min(.8, Math.max(0, y / 12)));
      if (y > 9) c.lerp(rock, Math.min(1, (y - 9) / 9));
      c.multiplyScalar(.92 + .08 * Math.sin(x * 1.7 + Math.cos(z * 1.1)));
      colors.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < segments; j++) for (let i = 0; i < segments; i++) { const a = j * (segments + 1) + i; indices.push(a, a + segments + 1, a + 1, a + 1, a + segments + 1, a + segments + 2); }
    const g = new BufferGeometry();g.setAttribute('position', new Float32BufferAttribute(vertices, 3));g.setAttribute('color', new Float32BufferAttribute(colors, 3));g.setIndex(indices);g.computeVertexNormals();return g;
  }, [low]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} receiveShadow><meshStandardMaterial vertexColors roughness={.95} /></mesh>;
}

function Woodland({ low }: { low: boolean }) {
  const trunks = useRef<InstancedMesh>(null), leaves = useRef<InstancedMesh>(null);
  const trees = useMemo(() => {
    const result: Object3D[] = [];
    for (let i = 0; i < (low ? 140 : 360); i++) {
      const a = i * 2.39996, r = 10 + Math.sqrt(i) * 3.1, x = Math.cos(a) * r, z = Math.sin(a) * r - 13, y = worldHeight(x, z);
      if (y < .8 || (Math.abs(x) < 10 && z > -20 && z < 18)) continue;
      const o = new Object3D();o.position.set(x, y, z);o.scale.setScalar(.8 + (i % 7) * .19);o.rotation.y = a;o.updateMatrix();result.push(o);
    }return result;
  }, [low]);
  useLayoutEffect(() => {
    if (!trunks.current || !leaves.current) return;
    const c = new Color(), crown = new Object3D();
    trees.forEach((o, i) => {
      trunks.current!.setMatrixAt(i, o.matrix);
      for (let j = 0; j < 3; j++) {
        crown.position.copy(o.position);crown.position.x += Math.sin(j * 2.1 + i) * o.scale.x * .55;crown.position.z += Math.cos(j * 2.1 + i) * o.scale.x * .55;crown.position.y += (2.4 + j * .65) * o.scale.y;
        crown.scale.set(1.35, 1.1, 1.2).multiplyScalar(o.scale.x * (1 - j * .12));crown.rotation.y = i;crown.updateMatrix();leaves.current!.setMatrixAt(i * 3 + j, crown.matrix);
        c.set(j === 2 ? '#699d66' : i % 4 === 0 ? '#557d64' : '#3d7154');leaves.current!.setColorAt(i * 3 + j, c);
      }
    });
    for (const mesh of [trunks.current, leaves.current]) { mesh.instanceMatrix.needsUpdate = true;mesh.computeBoundingSphere();if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  }, [trees]);
  return <><instancedMesh ref={trunks} args={[undefined, undefined, trees.length]} castShadow={!low} receiveShadow><cylinderGeometry args={[.1, .22, 3.1, 6]} /><meshStandardMaterial color="#756452" roughness={1} /></instancedMesh>
    <instancedMesh ref={leaves} args={[undefined, undefined, trees.length * 3]} castShadow={!low} receiveShadow><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial roughness={.9} /></instancedMesh></>;
}

function Water({ night, reduced }: { night: boolean; reduced: boolean }) {
  const material = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ time: { value: 0 }, night: { value: night ? 1 : 0 } }), [night]);
  useFrame((_, dt) => { if (material.current && !reduced) material.current.uniforms.time.value += Math.min(dt, .05); });
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .08, 0]}><planeGeometry args={[340, 340]} /><shaderMaterial ref={material} uniforms={uniforms}
    vertexShader={`varying vec3 vWorld; void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`}
    fragmentShader={`varying vec3 vWorld;uniform float time;uniform float night;void main(){vec2 p=vWorld.xz;float w=sin(p.x*1.2+time*.6)+sin(p.y*1.8+p.x*.4-time*.4);vec3 n=normalize(vec3(w*.045,1.,cos(p.y*1.5+time*.5)*.08));vec3 eye=normalize(cameraPosition-vWorld);float f=pow(1.-max(dot(eye,n),0.),3.);float s=pow(max(dot(reflect(-normalize(vec3(-.5,.6,-.4)),n),eye),0.),90.);vec3 c=mix(vec3(.035,.22,.26),vec3(.42,.57,.61),f)+vec3(1.,.76,.43)*s*.65;c*=mix(1.,.22,night);gl_FragColor=vec4(c,1.);
#include <tonemapping_fragment>
    #include <colorspace_fragment>}`.replace('//#', '#')} /></mesh>;
}

export function WorldEnvironment({ low, night, reduced }: { low: boolean; night: boolean; reduced: boolean }) {
  return <>
    <color attach="background" args={[night ? '#0d2039' : '#8caeb7']} /><fog attach="fog" args={[night ? '#152c43' : '#9eb8ba', 40, 145]} />
    <mesh scale={800}><sphereGeometry args={[1, 32, 16]} /><shaderMaterial side={BackSide} uniforms={{ night: { value: night ? 1 : 0 } }} vertexShader={`varying vec3 v;void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`} fragmentShader={`varying vec3 v;uniform float night;void main(){float h=clamp(normalize(v).y,0.,1.);vec3 day=mix(vec3(.72,.76,.70),vec3(.16,.38,.52),pow(h,.55));vec3 dark=mix(vec3(.08,.15,.24),vec3(.008,.025,.065),h);gl_FragColor=vec4(mix(day,dark,night),1.);}`} /></mesh>
    <hemisphereLight args={[night ? '#7390ba' : '#d5e9ff', '#364638', night ? .65 : 1.7]} />
    <directionalLight position={[-30, 40, -35]} color={night ? '#aac9ff' : '#fff0cb'} intensity={night ? .5 : 2.5} castShadow={!low} shadow-mapSize={[1024, 1024]} shadow-camera-left={-45} shadow-camera-right={45} shadow-camera-top={45} shadow-camera-bottom={-45} shadow-camera-far={150} shadow-normalBias={.06} />
    <mesh position={[-70, 88, -130]}><sphereGeometry args={[night ? 3.5 : 5, 32, 20]} /><meshBasicMaterial color={night ? '#d3e1ed' : '#fff1cb'} /></mesh>
    <Landscape low={low} /><Woodland low={low} /><Water night={night} reduced={reduced} />
  </>;
}
