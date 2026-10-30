"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { RenderTier } from "@/domain/cosmic-visuals";

/** Diagnostics on the canvas for reproducible browser measurements, never per-frame React state. */
export function SceneMetrics({ tier }: { tier: RenderTier }) {
  const sample = useRef({ seconds: 0, frames: [] as number[] });
  useFrame(({ gl, camera }, dt) => {
    if (document.hidden) { sample.current = { seconds: 0, frames: [] }; return; }
    sample.current.seconds += dt; sample.current.frames.push(dt * 1000);
    if (sample.current.seconds < 1) return;
    const sorted = sample.current.frames.sort((a, b) => a - b);
    gl.domElement.dataset.renderMetrics = JSON.stringify({ tier, fps: Math.round(sorted.length / sample.current.seconds), p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)]), calls: gl.info.render.calls, points: gl.info.render.points, triangles: gl.info.render.triangles, dpr: gl.getPixelRatio(), camera: camera.position.toArray() });
    sample.current = { seconds: 0, frames: [] };
  });
  return null;
}
