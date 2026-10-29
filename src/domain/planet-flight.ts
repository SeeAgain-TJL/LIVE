import type { CameraBookmark, Planet, Vec3 } from "./types.ts";
import { safeCameraPosition } from "./exploration.ts";

/** Keep the approach on the current viewing side instead of jumping to world +Z. */
export function planetApproach(planet: Planet, origin: CameraBookmark, planets: Planet[], aspect: number): CameraBookmark {
  const delta = origin.position.map((n, i) => n - planet.position[i]);
  const length = Math.hypot(...delta);
  const direction = length < 0.001 ? [0, 0.15, 1] : delta.map(n => n / length);
  // Fit the surface (and rings) while leaving visible atmosphere and a safe near plane.
  const framingRadius = planet.appearance.size * (planet.appearance.rings ? 2.4 : 1.1);
  const halfAngle = Math.atan(Math.tan(43 * Math.PI / 360) * Math.min(1, Math.max(0.2, aspect)));
  const distance = Math.max(planet.appearance.size + 0.6, framingRadius / Math.sin(halfAngle) * 1.08);
  return { position: safeCameraPosition(planet.position.map((n, i) => n + direction[i] * distance) as Vec3, planets), target: [...planet.position] };
}

/** Total pointer travel matters: dragging away and back must not count as a tap. */
export function isPlanetTap(distance: number, pointerCount: number, elapsed: number): boolean {
  return distance <= 7 && pointerCount === 1 && elapsed < 650;
}
