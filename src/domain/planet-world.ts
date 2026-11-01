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
  // Authored cove and two distant headlands share one height source with the
  // water depth, foam, camera floor and memory markers. No archive fields change.
  const coast = -11 + 3.5 * Math.sin(z * .064 + .4) + 1.6 * Math.sin(z * .19);
  const inland = Math.max(0, Math.min(1, (x - coast) / 13));
  const headland = 9.5 * Math.exp(-((x + 37) ** 2 / 700 + (z + 73) ** 2 / 1150))
    + 8 * Math.exp(-((x + 72) ** 2 / 850 + (z + 122) ** 2 / 1100));
  const inlandRidge = Math.max(0, -z - 25) * .19 * (1 + .22 * Math.sin(x * .095));
  const broad = (Math.sin(x * .087 + z * .027) * Math.cos(z * .068) * 1.45
    + Math.sin(x * .23 + z * .13) * .32) * inland;
  const detail = (Math.sin(x * .63 - z * .49) * .08
    + Math.sin(x * 1.13 + z * .83) * .045) * inland;
  const pathX = 5 + 3 * Math.sin(z * .046);
  const path = Math.exp(-((x - pathX) ** 2 / 18)) * Math.max(0, Math.min(1, (z + 53) / 16));
  return -1.9 + inland * (3.15 + inlandRidge + broad + detail - path * .37) + headland;
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
