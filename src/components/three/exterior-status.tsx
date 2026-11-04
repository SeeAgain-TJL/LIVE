"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Mesh } from "three";
import { exteriorReadiness } from "./use-planet-textures";
import { exteriorTextureStats } from "./planet-texture-pipeline";
import { EXTERIOR_GPU_BUDGET } from "./exterior-lod";
import type { RenderTier } from "@/domain/cosmic-visuals";

/** Exterior-only diagnostics: no storage, providers or internal-world changes. */
export function ExteriorStatus({ tier, count }: { tier: RenderTier; count: number }) {
  const elapsed = useRef(0);
  useFrame(({ gl, scene, controls }, dt) => {
    const canvas = gl.domElement;
    if (!canvas.dataset.exteriorInteractive && controls && canvas.dataset.travelPhase) {
      canvas.dataset.exteriorInteractive = "true";
    }
    elapsed.current += dt;
    if (elapsed.current < .1) return;
    elapsed.current = 0;
    const readiness = exteriorReadiness(gl);
    const materials = new Set(), geometries = new Set();
    scene.traverse(object => {
      if (object instanceof Mesh) { geometries.add(object.geometry); for (const m of Array.isArray(object.material) ? object.material : [object.material]) materials.add(m); }
    });
    const { pending: queuePending, ...pipeline } = exteriorTextureStats();
    canvas.dataset.exteriorTextures = JSON.stringify({ ...pipeline, ...readiness, queuePending, ceiling: tier, mapBudgetBytes: EXTERIOR_GPU_BUDGET[tier] * 2 ** 20, materials: materials.size, meshGeometries: geometries.size });
    canvas.dataset.exteriorReady = String(canvas.dataset.exteriorPlan === tier && readiness.total === count
      && readiness.targets === Number(canvas.dataset.exteriorPlanTargets) && readiness.pending === 0);
  });
  return null;
}
