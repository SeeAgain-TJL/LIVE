"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Environment, useGLTF, useTexture } from "@react-three/drei";
import { BufferGeometry, Color, Float32BufferAttribute, Matrix4, Mesh, MeshStandardMaterial, Object3D, RepeatWrapping, SRGBColorSpace, type InstancedMesh } from "three";
import type { PlanetAppearance } from "@/domain/types";
import { sliceWorldHeight } from "@/domain/planet-world";
import { coastPlaces, type CoastAsset, type CoastPlace, type CoastTier } from "@/domain/coast-composition";
import { CoastWater } from "./coast-water";

const root = "/world-slice/";
const modelFiles = ["island_tree_01-lod1.glb", "island_tree_02-lod2.glb", "fern_02.glb", "shrub_03.glb", "rock_moss_set_01.glb"];
const terrainUrls = ["leafy_grass_diff.jpg", "leafy_grass_normal.jpg", "coast_sand_04_diff.jpg", "coast_sand_04_normal.jpg", "aerial_grass_rock_diff.jpg", "aerial_grass_rock_normal.jpg"].map(file => root + file);
export function preloadVisualSlice() { for (const file of modelFiles) useGLTF.preload(root + file); useTexture.preload(terrainUrls); }

function ScannedScatter({ file, kind, tier }: { file: string; kind: CoastAsset; tier: CoastTier }) {
  const gltf = useGLTF(root + file);
  const meshes = useMemo(() => {
    gltf.scene.updateMatrixWorld(true);
    const found: Mesh[] = [];
    gltf.scene.traverse(object => { if (object instanceof Mesh) found.push(object); });
    if (!found.length) throw new Error(`Missing mesh: ${file}`);
    return kind === "forest" || kind === "hero" ? found : found.slice(0, 1);
  }, [gltf, file, kind]);
  const locations = useMemo(() => coastPlaces(kind, tier), [kind, tier]);
  // Split batches by space so React Three Fiber can cull distant vegetation.
  const clusters = useMemo(() => {
    const groups = new Map<number, CoastPlace[]>();
    for (const place of locations) { const key = Math.floor(place.z / 24) * 10 + Math.floor(place.x / 24); groups.set(key, [...(groups.get(key) ?? []), place]); }
    return [...groups.entries()];
  }, [locations]);
  return <group>{meshes.flatMap(source => clusters.map(([key, places]) => <ScannedPart key={`${source.uuid}-${key}`} source={source} locations={places} shadows={tier === "high" && kind === "hero"} rock={kind === "rock"} />))}</group>;
}

function ScannedPart({ source, locations, shadows, rock }: { source: Mesh; locations: CoastPlace[]; shadows: boolean; rock: boolean }) {
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

function CoastalTerrain({ tier }: { tier: CoastTier }) {
  const textures = useTexture(terrainUrls);
  const material = useMemo(() => {
    const copies = textures.map((texture, i) => {
      const copy = texture.clone(); copy.wrapS = copy.wrapT = RepeatWrapping;
      if (i % 2 === 0) copy.colorSpace = SRGBColorSpace;
      copy.needsUpdate = true; return copy;
    });
    const material = new MeshStandardMaterial({ map: copies[0], normalMap: tier === "low" ? null : copies[1], roughness: .92, color: 0xffffff });
    material.onBeforeCompile = shader => {
      shader.uniforms.sandMap = { value: copies[2] };
      shader.uniforms.rockMap = { value: copies[4] };
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vCoastPos;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCoastPos = position;");
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vCoastPos;\nuniform sampler2D sandMap;\nuniform sampler2D rockMap;")
        .replace("#include <map_fragment>", `
          #ifdef USE_MAP
            float breakup = sin(vCoastPos.x * .19 + sin(vCoastPos.z * .13)) * .17
              + sin(vCoastPos.z * .37 - vCoastPos.x * .16) * .09;
            float beach = 1. - smoothstep(.03, 1.05, vCoastPos.y + breakup);
            float ridge = smoothstep(5.2, 11.5, vCoastPos.y + breakup * 3.);
            float trailX = 5. + 3. * sin(vCoastPos.z * .046);
            float trail = (1. - smoothstep(.9, 3.2, abs(vCoastPos.x - trailX)))
              * smoothstep(-53., -37., vCoastPos.z);
            beach = max(beach, trail * .53);
            vec3 grass = texture2D(map, vMapUv).rgb;
            vec3 sand = texture2D(sandMap, vMapUv * .84).rgb;
            vec3 stone = texture2D(rockMap, vMapUv * .72).rgb;
            vec3 terrainColor = mix(grass * vec3(.83, .96, .82), sand * vec3(.9, .87, .79), beach);
            terrainColor = mix(terrainColor, stone * vec3(.57, .72, .67), ridge * (1. - beach));
            diffuseColor.rgb *= terrainColor;
          #endif
        `);
    };
    return { material, copies };
  }, [textures, tier]);
  useEffect(() => () => { material.material.dispose(); material.copies.forEach(texture => texture.dispose()); }, [material]);
  const geometry = useMemo(() => {
    const size = 220, segments = tier === "low" ? 140 : tier === "medium" ? 220 : 300, vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (let j = 0; j <= segments; j++) for (let i = 0; i <= segments; i++) {
      const x = (i / segments - .5) * size, z = (j / segments - .5) * size, y = sliceWorldHeight(x, z);
      vertices.push(x, y, z); uvs.push(x / 5.5, z / 5.5);
    }
    for (let j = 0; j < segments; j++) for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i, b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  }, [tier]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material.material} receiveShadow />;
}

export function VisualSliceEnvironment({ appearance, tier, night, reduced }: { appearance: PlanetAppearance; tier: CoastTier; night: boolean; reduced: boolean }) {
  const sea = useMemo(() => new Color(appearance.color).lerp(new Color("#174455"), .58), [appearance.color]);
  return <>
    <color attach="background" args={[night ? "#071624" : "#93b9c4"]} />
    <fog attach="fog" args={[night ? "#102a3c" : "#91b5c2", 78, 210]} />
    {!night && <Environment files={root + "kloofendal_48d_partly_cloudy_puresky_2k.hdr"} background environmentIntensity={.5} backgroundIntensity={.85} />}
    <hemisphereLight args={[night ? "#8fa6c9" : "#e4f0ff", "#425043", night ? .8 : .72]} />
    <directionalLight position={[-45, 47, -60]} color={night ? "#a9c8e8" : "#fff0cd"} intensity={night ? .7 : 1.45} castShadow={tier !== "low"} shadow-mapSize={[tier === "high" ? 2048 : tier === "medium" ? 1024 : 512, tier === "high" ? 2048 : tier === "medium" ? 1024 : 512]} shadow-camera-left={-52} shadow-camera-right={52} shadow-camera-top={52} shadow-camera-bottom={-52} shadow-camera-far={180} shadow-normalBias={.035} />
    <CoastalTerrain tier={tier} />
    <CoastWater night={night} reduced={reduced} color={sea} tier={tier} />
    <ScannedScatter file="island_tree_01-lod1.glb" kind="hero" tier={tier} />
    <ScannedScatter file="island_tree_02-lod2.glb" kind="forest" tier={tier} />
    <ScannedScatter file="fern_02.glb" kind="fern" tier={tier} />
    <ScannedScatter file="shrub_03.glb" kind="shrub" tier={tier} />
    <ScannedScatter file="rock_moss_set_01.glb" kind="rock" tier={tier} />
  </>;
}
