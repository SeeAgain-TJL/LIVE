import type { Memory, Planet, Vec3 } from "./types.ts";

/** Search never mutates or removes worlds; memory matches lead to their owning world. */
export function searchPlanets(planets: Planet[], memories: Memory[], query: string): Planet[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return planets;
  const memoryMatches = new Set(memories.filter(m => `${m.title} ${m.body}`.toLocaleLowerCase().includes(needle)).map(m => m.planetId));
  return planets.filter(p => `${p.name ?? "未命名草稿"} ${p.description}`.toLocaleLowerCase().includes(needle) || memoryMatches.has(p.id));
}

export interface Overview { target: Vec3; position: Vec3; farthestDistance: number }

/** Fit world bounds to the smaller viewport dimension, including rings and breathing room. */
export function universeOverview(planets: Planet[], verticalFov: number, aspect: number, context: { position: Vec3; size: number }[] = []): Overview {
  if (planets.length === 0 && context.length === 0) return { target: [0, 0, 0], position: [0, 7, 30], farthestDistance: 100 };
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const bounds = [...planets.map(p => ({ position: p.position, size: p.appearance.size * (p.appearance.rings ? 2.4 : 1.05) })), ...context];
  for (const p of bounds) {
    const radius = p.size;
    p.position.forEach((n, i) => { min[i] = Math.min(min[i], n - radius); max[i] = Math.max(max[i], n + radius); });
  }
  const target = min.map((n, i) => (n + max[i]) / 2) as Vec3;
  const radius = Math.max(6, Math.hypot(...max.map((n, i) => (n - min[i]) / 2)));
  const halfAngle = Math.atan(Math.tan(verticalFov * Math.PI / 360) * Math.min(1, Math.max(0.1, aspect)));
  const distance = radius / Math.sin(halfAngle) * 1.15;
  return { target, position: [target[0], target[1] + distance * 0.2, target[2] + distance], farthestDistance: distance + radius * 2 };
}

/** Project a camera out of solid surfaces. Ring disks remain traversable space. */
export function safeCameraPosition(position: Vec3, planets: Planet[]): Vec3 {
  let result: Vec3 = [...position];
  for (const planet of planets) {
    const delta = result.map((n, i) => n - planet.position[i]);
    const distance = Math.hypot(...delta);
    const boundary = planet.appearance.size + 0.25;
    if (distance >= boundary) continue;
    const direction = distance < 0.0001 ? [0, 0, 1] : delta.map(n => n / distance);
    result = planet.position.map((n, i) => n + direction[i] * boundary) as Vec3;
  }
  return result;
}
