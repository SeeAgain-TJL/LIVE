"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Environment, useGLTF, useTexture } from "@react-three/drei";
import { BufferGeometry, Color, Float32BufferAttribute, Matrix4, Mesh, MeshStandardMaterial, Object3D, RepeatWrapping, SRGBColorSpace, type InstancedMesh, type ShaderMaterial } from "three";
import type { PlanetAppearance } from "@/domain/types";
import { sliceWorldHeight } from "@/domain/planet-world";

const root = "/world-slice/";
const modelFiles = ["island_tree_01.glb", "island_tree_02.glb", "fern_02.glb", "shrub_03.glb", "rock_moss_set_01.glb"];
const terrainUrls = ["leafy_grass_diff.jpg", "leafy_grass_normal.jpg", "coast_sand_04_diff.jpg", "coast_sand_04_normal.jpg", "aerial_grass_rock_diff.jpg", "aerial_grass_rock_normal.jpg"].map(file => root + file);
export function preloadVisualSlice() { for (const file of modelFiles) useGLTF.preload(root + file); useTexture.preload(terrainUrls); }

function hash(n: number) { const x = Math.sin(n * 127.127 + 4.31) * 43758.5453; return x - Math.floor(x); }
type Place = { x: number; z: number; scale: number; turn: number };
type ScatterKind = "tree" | "hero" | "fern" | "shrub" | "rock";
function places(kind: ScatterKind, low: boolean): Place[] {
  if (kind === "hero") return [{ x: 17, z: -5, scale: 1.55, turn: .5 }, { x: 17, z: -26, scale: 1.4, turn: 2.1 }, { x: -1, z: -34, scale: 1.2, turn: 4.4 }].slice(0, low ? 2 : 3);
  const count = kind === "tree" ? (low ? 4 : 7) : kind === "fern" ? (low ? 14 : 45) : kind === "shrub" ? (low ? 12 : 32) : low ? 8 : 18;
  const result: Place[] = [];
  for (let i = 0; i < count * 5 && result.length < count; i++) {
    const x = -24 + hash(i * 5 + kind.length * 101) * 72;
    const z = -55 + hash(i * 7 + kind.length * 47) * 90;
    const y = sliceWorldHeight(x, z);
    if (y < (kind === "rock" ? .35 : .55)) continue;
    if (kind === "tree" && x < 8 && z > -26) continue; // open arrival vista and memory path
    if (kind !== "rock" && Math.abs(x - 4) < 5 && z > -20 && z < 22) continue;
    result.push({ x, z, scale: (kind === "tree" ? 1.05 : kind === "rock" ? .9 : kind === "fern" ? 1.5 : 2.8) * (.78 + hash(i * 13 + 6) * .7), turn: hash(i * 19 + 9) * Math.PI * 2 });
  }
  return result;
}

function ScannedScatter({ file, kind, low }: { file: string; kind: ScatterKind; low: boolean }) {
  const gltf = useGLTF(root + file);
  const meshes = useMemo(() => {
    gltf.scene.updateMatrixWorld(true);
    const found: Mesh[] = [];
    gltf.scene.traverse(object => { if (object instanceof Mesh) found.push(object); });
    if (!found.length) throw new Error(`Missing mesh: ${file}`);
    return kind === "tree" || kind === "hero" ? found : found.slice(0, 1);
  }, [gltf, file, kind]);
  const locations = useMemo(() => places(kind, low), [kind, low]);
  return <group>{meshes.map(source => <ScannedPart key={source.uuid} source={source} locations={locations} shadows={!low && kind === "tree"} rock={kind === "rock"} />)}</group>;
}

function ScannedPart({ source, locations, shadows, rock }: { source: Mesh; locations: Place[]; shadows: boolean; rock: boolean }) {
  const instances = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!instances.current) return;
    const object = new Object3D(), matrix = new Matrix4();
    locations.forEach((place, index) => {
      object.position.set(place.x, sliceWorldHeight(place.x, place.z) - (rock ? .35 : 0), place.z);
      object.rotation.set(0, place.turn, 0); object.scale.setScalar(place.scale); object.updateMatrix();
      matrix.multiplyMatrices(object.matrix, source.matrixWorld);
      instances.current!.setMatrixAt(index, matrix);
    });
    instances.current.instanceMatrix.needsUpdate = true;
    instances.current.computeBoundingSphere();
  }, [locations, source, rock]);
  return <instancedMesh ref={instances} args={[source.geometry, source.material, locations.length]} castShadow={shadows} receiveShadow={rock} />;
}

function CoastalTerrain({ low }: { low: boolean }) {
  const textures = useTexture(terrainUrls);
  const materials = useMemo(() => {
    const copies = textures.map((texture, i) => {
      const copy = texture.clone(); copy.wrapS = copy.wrapT = RepeatWrapping;
      if (i % 2 === 0) copy.colorSpace = SRGBColorSpace;
      copy.needsUpdate = true; return copy;
    });
    return [0, 1, 2].map(i => new MeshStandardMaterial({ map: copies[i * 2], normalMap: low ? null : copies[i * 2 + 1], roughness: i === 1 ? .82 : .96, color: i === 0 ? 0xa2d0ad : i === 2 ? 0x9fa9a2 : 0xffffff }));
  }, [textures, low]);
  useEffect(() => () => materials.forEach(material => { material.map?.dispose(); material.normalMap?.dispose(); material.dispose(); }), [materials]);
  const geometry = useMemo(() => {
    const size = 220, segments = low ? 180 : 320, vertices: number[] = [], uvs: number[] = [], buckets: number[][] = [[], [], []];
    const heights: number[] = [];
    for (let j = 0; j <= segments; j++) for (let i = 0; i <= segments; i++) {
      const x = (i / segments - .5) * size, z = (j / segments - .5) * size, y = sliceWorldHeight(x, z);
      vertices.push(x, y, z); uvs.push(x / 4, z / 4); heights.push(y);
    }
    for (let j = 0; j < segments; j++) for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i, b = a + segments + 1;
      const y = (heights[a] + heights[a + 1] + heights[b] + heights[b + 1]) / 4;
      const slope = Math.abs(heights[a] - heights[b]) + Math.abs(heights[a] - heights[a + 1]);
      const material = y < .7 ? 1 : y > 7.5 || slope > 1.7 ? 2 : 0;
      buckets[material].push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    const indices: number[] = [];
    buckets.forEach((bucket, index) => { geometry.addGroup(indices.length, bucket.length, index); for (const vertex of bucket) indices.push(vertex); });
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  }, [low]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={materials} receiveShadow />;
}

function InletWater({ night, reduced, color }: { night: boolean; reduced: boolean; color: Color }) {
  const material = useRef<ShaderMaterial>(null);
  useFrame((_, dt) => { if (material.current && !reduced) material.current.uniforms.time.value += Math.min(dt, .05); });
  return <mesh position={[0, .045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
    <planeGeometry args={[320, 320, lowWaterSegments(reduced), lowWaterSegments(reduced)]} />
    <shaderMaterial ref={material} uniforms={{ time: { value: 0 }, night: { value: night ? 1 : 0 }, tint: { value: color } }}
      vertexShader={`uniform float time; varying vec3 vWorld; void main(){vec4 w=modelMatrix*vec4(position,1.);w.y+=sin(w.x*.37+time*.6)*.035+sin(w.z*.48-w.x*.11-time*.42)*.025;vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`}
      fragmentShader={`uniform float time;uniform float night;uniform vec3 tint;varying vec3 vWorld;void main(){float dx=cos(vWorld.x*.37+time*.6)*.013-cos(vWorld.z*.48-vWorld.x*.11-time*.42)*.003;float dz=cos(vWorld.z*.48-vWorld.x*.11-time*.42)*.012;vec3 n=normalize(vec3(-dx,1.,-dz));vec3 eye=normalize(cameraPosition-vWorld);float rim=pow(1.-max(dot(n,eye),0.),3.);vec3 sun=normalize(vec3(-.55,.53,-.67));float shine=pow(max(dot(reflect(-sun,n),eye),0.),100.);vec3 c=mix(tint*.55,vec3(.37,.59,.65),rim*.58)+vec3(.95,.77,.49)*shine*.72;c*=mix(1.,.42,night);gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`} />
  </mesh>;
}
function lowWaterSegments(reduced: boolean) { return reduced ? 40 : 100; }

export function VisualSliceEnvironment({ appearance, low, night, reduced }: { appearance: PlanetAppearance; low: boolean; night: boolean; reduced: boolean }) {
  const sea = useMemo(() => new Color(appearance.color).lerp(new Color("#174455"), .58), [appearance.color]);
  return <>
    <color attach="background" args={[night ? "#071624" : "#93b9c4"]} />
    <fog attach="fog" args={[night ? "#102a3c" : "#91b5c2", 78, 210]} />
    {!night && <Environment files={root + "kloofendal_48d_partly_cloudy_puresky_2k.hdr"} background environmentIntensity={.5} backgroundIntensity={.85} />}
    <hemisphereLight args={[night ? "#8fa6c9" : "#e4f0ff", "#425043", night ? .8 : .72]} />
    <directionalLight position={[-45, 47, -60]} color={night ? "#a9c8e8" : "#fff0cd"} intensity={night ? .7 : 1.45} castShadow={!low} shadow-mapSize={[low ? 512 : 2048, low ? 512 : 2048]} shadow-camera-left={-52} shadow-camera-right={52} shadow-camera-top={52} shadow-camera-bottom={-52} shadow-camera-far={180} shadow-normalBias={.035} />
    <CoastalTerrain low={low} />
    <InletWater night={night} reduced={reduced} color={sea} />
    <ScannedScatter file="island_tree_01.glb" kind="hero" low={low} />
    <ScannedScatter file="island_tree_02.glb" kind="tree" low={low} />
    <ScannedScatter file="fern_02.glb" kind="fern" low={low} />
    <ScannedScatter file="shrub_03.glb" kind="shrub" low={low} />
    <ScannedScatter file="rock_moss_set_01.glb" kind="rock" low={low} />
  </>;
}
