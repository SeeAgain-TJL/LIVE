import type { Planet, Vec3 } from "./types.ts";

export interface StellarSource { position: Vec3; radius: number; intensity: number }
/** Rendered vertices, shared with diagnostics; not synthetic screen-space markers. */
export const SPATIAL_LANDMARKS: [Vec3, Vec3] = [[10, -3, 48], [210, -60, -900]];
/** A real local source derived from the preserved world bounds, kept clear of planets. */
export function stellarSource(planets: Planet[]): StellarSource {
  const left = Math.min(-8, ...planets.map(p => p.position[0] - p.appearance.size * 2.5));
  return { position: [left - 8, 8, 1], radius: 2.2, intensity: 2300 };
}
export function safeStellarCamera(position: Vec3, source: StellarSource): Vec3 {
  const delta = position.map((n, i) => n - source.position[i]), length = Math.hypot(...delta);
  const boundary = source.radius + 1.2;
  if (length >= boundary) return position;
  return source.position.map((n, i) => n + (length < 0.001 ? [0, 0, 1][i] : delta[i] / length) * boundary) as Vec3;
}
/** Tilted circular guide passes through the original planet and shares the same star. */
export function orbitFrame(planet: Planet, source: StellarSource, index: number) {
  const axis = planet.position.map((n, i) => n - source.position[i]) as Vec3;
  const radius = Math.hypot(...axis);
  const reference: Vec3 = [Math.sin(index * 1.7) * 0.55, 1, Math.cos(index * 1.7) * 0.55];
  const tangent: Vec3 = [reference[1] * axis[2] - reference[2] * axis[1], reference[2] * axis[0] - reference[0] * axis[2], reference[0] * axis[1] - reference[1] * axis[0]];
  const length = Math.hypot(...tangent) || 1;
  return { axis, tangent: tangent.map(n => n / length * radius) as Vec3, radius };
}
/** Shared curved-path envelope with zero displacement/velocity at endpoints. */
export function travelArc(progress: number, distance: number, reduced: boolean): number {
  return reduced ? 0 : Math.sin(Math.PI * progress) ** 2 * Math.min(8, distance * 0.075);
}
