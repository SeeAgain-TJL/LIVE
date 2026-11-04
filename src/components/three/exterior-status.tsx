"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Mesh } from "three";
import { exteriorReadiness } from "./use-planet-textures";
import { exteriorTextureStats } from "./planet-texture-pipeline";

/** Exterior-only diagnostics: no storage, providers or internal-world changes. */
export function ExteriorStatus() {
  const elapsed = useRef(0);
  useFrame(({ gl, scene }, dt) => {
    elapsed.current += dt;
    if (elapsed.current < .1) return;
    elapsed.current = 0;
    const readiness = exteriorReadiness(gl);
    const materials = new Set(), geometries = new Set();
    scene.traverse(object => {
      if (object instanceof Mesh) { geometries.add(object.geometry); for (const m of Array.isArray(object.material) ? object.material : [object.material]) materials.add(m); }
    });
    gl.domElement.dataset.exteriorTextures = JSON.stringify({ ...readiness, ...exteriorTextureStats(), materials: materials.size, meshGeometries: geometries.size });
    gl.domElement.dataset.exteriorReady = String(readiness.total > 0 && readiness.pending === 0);
  });
  return null;
}
