"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Frustum, Matrix4, Sphere, Vector3 } from "three";
import type { Planet } from "@/domain/types";
import type { RenderTier } from "@/domain/cosmic-visuals";
import { planExteriorLod } from "./exterior-lod";

export interface ExteriorLodSignal {
  priority: number;
  atmosphere: number;
}
export interface ExteriorLodPlan { tier: RenderTier | null; hidden: boolean; compact: boolean; signal: ExteriorLodSignal }
interface History extends ExteriorLodSignal { lastVisible: number; depth: number }

export function useExteriorLod(planets: Planet[], ceiling: RenderTier, focusId: string | null, hoveredId: string | null) {
  const [plans, setPlans] = useState(new Map<string, ExteriorLodPlan>());
  const historyRef = useRef(new Map<string, History>());
  const sample = useRef({ last: -Infinity, signature: "" });
  const scratch = useMemo(() => ({ frustum: new Frustum(), view: new Vector3(), sphere: new Sphere(), matrix: new Matrix4() }), []);
  useFrame(({ camera, size, gl, clock, controls }) => {
    if (!controls || !gl.domElement.dataset.travelPhase) return;
    const now = clock.elapsedTime;
    const history = historyRef.current;
    const signature = `${ceiling}:${focusId}:${hoveredId}:${planets.length}:${size.width}:${size.height}`;
    if (signature === sample.current.signature && now - sample.current.last < .10) return;
    sample.current = { last: now, signature };
    camera.updateMatrixWorld();
    const { frustum, view, sphere, matrix } = scratch;
    frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const scale = size.height * gl.getPixelRatio() * camera.projectionMatrix.elements[5];
    const ids = new Set(planets.map(p => p.id));
    for (const id of history.keys()) if (!ids.has(id)) history.delete(id);
    const candidates = planets.map(p => {
      const state = history.get(p.id) ?? { lastVisible: -Infinity, depth: Infinity, priority: 0, atmosphere: 0 };
      history.set(p.id, state);
      sphere.center.fromArray(p.position);
      const radius = p.appearance.size;
      sphere.radius = radius * (p.appearance.rings ? 2.45 : 1.05);
      const visible = frustum.intersectsSphere(sphere);
      const depth = -view.copy(sphere.center).applyMatrix4(camera.matrixWorldInverse).z;
      const distanceInRadii = sphere.center.distanceTo(camera.position) / radius;
      const pixels = Math.min(4000, scale * radius / Math.max(radius, depth));
      if (visible) state.lastVisible = now;
      const approaching = Number.isFinite(state.depth) ? (state.depth - depth) * 6 : 0;
      state.depth = depth;
      state.atmosphere = Math.max(0, Math.min(1, (pixels - 18) / 17));
      return {
        id: p.id, pixels, distanceInRadii, visible, retained: now - state.lastVisible < .45,
        focused: p.id === focusId, hovered: p.id === hoveredId, approaching,
        previous: plans.get(p.id)?.tier ?? null,
      };
    });
    const next = new Map<string, ExteriorLodPlan>();
    let changed = plans.size !== planets.length;
    let targets = 0;
    for (const p of planExteriorLod(candidates, ceiling)) {
      const signal = history.get(p.id)!;
      signal.priority = p.priority;
      const hidden = !p.visible && !p.focused && !p.retained;
      const old = plans.get(p.id);
      const compact = !p.focused && p.pixels < (old?.compact ? 36 : 28);
      if (!old || old.tier !== p.tier || old.hidden !== hidden || old.compact !== compact) changed = true;
      next.set(p.id, { tier: p.tier, hidden, compact, signal });
      if (p.tier) targets++;
    }
    gl.domElement.dataset.exteriorPlan = changed ? "" : ceiling;
    gl.domElement.dataset.exteriorPlanTargets = String(targets);
    if (changed) setPlans(next);
  }, -.4); // After camera safety/travel, before rendering and diagnostics.
  return plans;
}
