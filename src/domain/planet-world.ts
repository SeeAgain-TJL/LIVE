import type { Memory, Planet, Vec3 } from "./types.ts";
import { isPersonalPlanet } from "./planet.ts";

/** A single, derived ocean-world candidate. This never changes stored planet records. */
export function visualSlicePlanetId(planets: Planet[], memories: Memory[]): string | null {
  return planets.find(planet => planet.appearance.type === "ocean" && isPersonalPlanet(planet, memories))?.id ?? null;
}

/** Presentation only: deterministic terrain and anchors, never saved into the archive. */
export function worldHeight(x: number, z: number) {
  const lake = -3.6 * Math.exp(-((x + 14) ** 2 / 180 + (z + 1) ** 2 / 420));
  const clearing = Math.exp(-(x * x + z * z) / 400);
  const hills = (Math.sin(x * .075 + .6) * Math.cos(z * .065) * 4 + Math.sin(z * .14 + x * .06) * 1.7) * (1 - clearing);
  const ridge = Math.max(0, -z - 26) * .17 * (1 + .45 * Math.sin(x * .11));
  return .7 + hills + lake + ridge;
}
export function sliceWorldHeight(x: number, z: number) {
  // A sheltered coastal basin: sea to the west, walkable glade to the east,
  // rising headland beyond. Detail is geometric, not a flat image backdrop.
  const coast = -10 + 3.2 * Math.sin(z * .085) + 1.3 * Math.sin(z * .27 + .7);
  const inland = Math.max(0, Math.min(1, (x - coast) / 8));
  const hills = (Math.sin(x * .12 + z * .045) * Math.cos(z * .11) * 1.8
    + Math.sin(x * .31 + z * .18) * .48 + Math.sin(x * .77 - z * .51) * .13) * inland;
  const ridge = Math.max(0, -z - 24) * .24 * (1 + .25 * Math.sin(x * .14));
  const glade = 1 - .72 * Math.exp(-((x - 4) ** 2 + (z + 5) ** 2) / 250);
  return -1.3 + inland * (2.3 + hills * glade + ridge);
}
export function worldHash(id: string) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function worldMemoryPosition(id: string): Vec3 {
  const h = worldHash(id), angle = (h % 10000) / 10000 * Math.PI * 1.7 - Math.PI * .85;
  const r = 4 + ((h >>> 12) % 1000) / 1000 * 10;
  const x = 4 + Math.sin(angle) * r * .65, z = -3 - Math.cos(angle) * r;
  return [x, Math.max(.5, worldHeight(x, z)) + 1.4, z];
}
export function sliceWorldMemoryPosition(id: string): Vec3 {
  const [x, , z] = worldMemoryPosition(id);
  return [x, Math.max(.5, sliceWorldHeight(x, z)) + 1.4, z];
}
export const WORLD_BATCH_SIZE = 24;
