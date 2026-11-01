"use client";

/* eslint-disable react-hooks/immutability -- R3F and Three.js own these mutable scene objects. */

import { Suspense, useEffect, useMemo, useRef, type ComponentRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, OrbitControls, useGLTF, useTexture } from "@react-three/drei";
import { PlaneGeometry, Raycaster, RepeatWrapping, Vector2, Vector3 } from "three";
import { Water } from "three/addons/objects/Water2.js";
import { SceneMetrics } from "./scene-metrics";

function Scan({ name, position, rotation = 0, scale = 1 }: { name: string; position: [number, number, number]; rotation?: number; scale?: number }) {
  const { scene } = useGLTF(`/world-slice/r2-${name}.glb`);
  const instance = useMemo(() => scene.clone(), [scene]);
  return <primitive object={instance} position={position} rotation={[0, rotation, 0]} scale={scale} />;
}

function Ocean() {
  const [first, second] = useTexture(["/world-slice/r2-Water_1_M_Normal.jpg", "/world-slice/r2-Water_2_M_Normal.jpg"]);
  const water = useMemo(() => {
    first.wrapS = first.wrapT = second.wrapS = second.wrapT = RepeatWrapping;
    first.needsUpdate = second.needsUpdate = true;
    const mesh = new Water(new PlaneGeometry(360, 360), {
      color: 0x607e87, textureWidth: 512, textureHeight: 512,
      normalMap0: first, normalMap1: second,
      flowDirection: new Vector2(.8, .25), flowSpeed: .018, reflectivity: .08, scale: 3.5,
    });
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -.55;
    return mesh;
  }, [first, second]);
  useEffect(() => () => { water.geometry.dispose(); water.material.dispose(); }, [water]);
  return <primitive object={water} />;
}

function ExploreController() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, gl, scene } = useThree();
  const keys = useRef(new Set<string>());
  const ray = useMemo(() => new Raycaster(), []);
  const direction = useMemo(() => new Vector3(), []);
  const start = useMemo(() => new Vector3(), []);
  const last = useMemo(() => new Vector3(Number.NaN, 0, 0), []);
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "海岸技术验证：拖动观察，右键平移，滚轮缩放，聚焦后 WASD 移动");
    const down = (event: KeyboardEvent) => { if (/^[wasd]$/i.test(event.key)) { keys.current.add(event.key.toLowerCase()); event.preventDefault(); } };
    const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    const blur = () => keys.current.clear();
    canvas.addEventListener("keydown", down); window.addEventListener("keyup", up); canvas.addEventListener("blur", blur);
    return () => { canvas.removeEventListener("keydown", down); window.removeEventListener("keyup", up); canvas.removeEventListener("blur", blur); };
  }, [gl]);
  useFrame((_, dt) => {
    const control = controls.current; if (!control) return;
    if (keys.current.size) {
      camera.getWorldDirection(direction); direction.y = 0; direction.normalize();
      const lateral = new Vector3().crossVectors(direction, camera.up).normalize();
      for (const key of keys.current) {
        const offset = (key === "w" || key === "s" ? direction : lateral).clone().multiplyScalar(Math.min(dt, .04) * 5 * (key === "s" || key === "a" ? -1 : 1));
        camera.position.add(offset); control.target.add(offset);
      }
    }
    camera.position.x = Math.max(-29, Math.min(31, camera.position.x));
    camera.position.z = Math.max(-15, Math.min(38, camera.position.z));
    if (camera.position.distanceToSquared(last) > .0001) {
      start.set(camera.position.x, 40, camera.position.z);
      ray.set(start, new Vector3(0, -1, 0));
      const solid = scene.children.filter(child => child.type === "Group");
      const hit = ray.intersectObjects(solid, true).find(item => item.object.visible);
      camera.position.y = Math.max(hit ? hit.point.y + 1.7 : 1.8, camera.position.y);
      last.copy(camera.position);
    }
  });
  return <OrbitControls ref={controls} makeDefault target={[0, 1.5, -8]} minDistance={2} maxDistance={60} maxPolarAngle={Math.PI * .48} enableDamping dampingFactor={.08} rotateSpeed={.4} panSpeed={.65} />;
}

function CoastContent() {
  return <>
    <Environment files="/world-slice/kloofendal_48d_partly_cloudy_puresky_2k.hdr" background environmentIntensity={.65} backgroundIntensity={.8} />
    <fog attach="fog" args={["#a8b6b9", 110, 300]} />
    <hemisphereLight args={["#dbe7ed", "#4e5552", .72]} />
    <directionalLight position={[-38, 55, 25]} intensity={2.1} color="#fff2dc" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-60} shadow-camera-right={60} shadow-camera-top={50} shadow-camera-bottom={-50} shadow-camera-far={150} shadow-normalBias={.04} />
    <Scan name="coast_line_01" position={[0, 0, 1]} />
    <Scan name="coastal_cliff_02" position={[0, -.2, -21]} />
    <Scan name="coast_rocks_01" position={[24, -.15, 4]} rotation={-.24} scale={.75} />
    <Ocean />
    <ExploreController />
    <SceneMetrics tier="high" auxiliaryPasses={2} />
  </>;
}

export function CoastLabScene() {
  return <div style={{ width: "100%", height: "100%" }}>
    <Canvas shadows camera={{ position: [8, 6, 19], fov: 56, near: .1, far: 1000 }} dpr={1} gl={{ antialias: true, powerPreference: "high-performance" }}>
      <Suspense fallback={null}><CoastContent /></Suspense>
    </Canvas>
    <aside style={{ position: "absolute", left: 20, top: 20, padding: "9px 12px", background: "#071a27b8", color: "white", borderRadius: 6, fontSize: 14 }}>
      海岸扫描资产实验 · 未通过视觉与性能验收
    </aside>
  </div>;
}
