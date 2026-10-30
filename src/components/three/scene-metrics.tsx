"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { PerspectiveCamera, Vector3 } from "three";
import type { RenderTier } from "@/domain/cosmic-visuals";
import { SPATIAL_LANDMARKS } from "@/domain/spatial-scene";

/** One diagnostic update/second, no per-frame React state or archive writes. */
export function SceneMetrics({ tier }: { tier: RenderTier }) {
  const sample = useRef({ seconds: 0, frames: [] as number[] });
  const landmarks = useMemo(() => SPATIAL_LANDMARKS.map(p => new Vector3(...p)), []);
  const projected = useMemo(() => new Vector3(), []);
  useFrame(({ gl, camera, controls, size }, dt) => {
    if (document.hidden) { sample.current = { seconds: 0, frames: [] }; return; }
    sample.current.seconds += dt; sample.current.frames.push(dt * 1000);
    if (sample.current.seconds < 1) return;
    const sorted = sample.current.frames.sort((a, b) => a - b);
    const target = (controls as unknown as { target?: Vector3 } | null)?.target?.toArray();
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    gl.domElement.dataset.renderMetrics = JSON.stringify({
      tier, fps: Math.round(sorted.length / sample.current.seconds), meanMs: +(sample.current.seconds * 1000 / sorted.length).toFixed(2),
      p95Ms: +sorted[Math.floor(sorted.length * .95)].toFixed(2), maxMs: +sorted.at(-1)!.toFixed(2),
      calls: gl.info.render.calls, points: gl.info.render.points, triangles: gl.info.render.triangles, dpr: gl.getPixelRatio(),
      geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, programs: gl.info.programs?.length, heapBytes: heap,
      camera: camera.position.toArray(), target, fov: camera instanceof PerspectiveCamera ? camera.fov : null,
      landmarks: landmarks.map(position => {
        projected.copy(position).project(camera);
        return { world: position.toArray(), x: (projected.x + 1) * size.width / 2, y: (1 - projected.y) * size.height / 2, visible: Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && Math.abs(projected.z) < 1 };
      }),
    });
    sample.current = { seconds: 0, frames: [] };
  });
  return null;
}
