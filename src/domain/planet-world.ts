import type { Vec3 } from "./types.ts";

/** Presentation only: deterministic terrain and anchors, never saved into the archive. */
export function worldHeight(x: number, z: number) {
  const lake = -3.6 * Math.exp(-((x + 14) ** 2 / 180 + (z + 1) ** 2 / 420));
  const clearing = Math.exp(-(x * x + z * z) / 400);
  const hills = (Math.sin(x * .075 + .6) * Math.cos(z * .065) * 4 + Math.sin(z * .14 + x * .06) * 1.7) * (1 - clearing);
  const ridge = Math.max(0, -z - 26) * .17 * (1 + .45 * Math.sin(x * .11));
  return .7 + hills + lake + ridge;
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
export const WORLD_BATCH_SIZE = 24;
