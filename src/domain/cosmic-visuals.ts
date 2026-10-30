import type { CameraBookmark, Quality, Vec3 } from "./types.ts";
import { galaxyPosition } from "./galaxy.ts";

export type RenderTier = "high" | "medium" | "low";
export const COSMIC_BUDGETS = {
  high: { stars: 5000, galaxy: 10000, dust: 800, dpr: 1.5 },
  medium: { stars: 3800, galaxy: 7500, dust: 600, dpr: 1.35 },
  low: { stars: 1600, galaxy: 2800, dust: 220, dpr: 1 },
} as const;
export function renderTier(quality: Quality, smallDevice: boolean): RenderTier {
  return quality === "auto" ? smallDevice ? "low" : "medium" : quality;
}
export function seededRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
export function identitySeed(id: string): number {
  return Array.from(id).reduce((hash, c) => Math.imul(hash ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
}
/** Appearance is derived, never written into the user's Galaxy or Planet records. */
export function galaxyStyle(id: string) {
  const seed = identitySeed(id), random = seededRandom(seed);
  const morphology = seed % 4;
  return { seed, radius: 6 + Math.pow(random(), 1.5) * 13, arms: morphology === 2 ? 4 : 2, twist: morphology === 3 ? 7 : 3.5 + random() * 2,
    flatten: morphology === 0 ? 0.64 : 0.72 + random() * 0.28, tilt: [0.32 + random() * 1.18, random() * Math.PI, -0.65 + random() * 1.3] as Vec3,
    morphology, elliptical: morphology === 0, barred: morphology === 1, speed: 0.0015 + random() * 0.003 };
}
export function galaxyOverview(count: number, aspect: number): CameraBookmark {
  const halfAngle = Math.atan(Math.tan(43 * Math.PI / 360) * Math.min(1, Math.max(0.2, aspect)));
  // Fit projected extents, not a huge bounding sphere dominated by the farthest depth.
  let distance = 76 / Math.min(1, Math.max(.2, aspect));
  for (let i = 0; i < count; i++) {
    const [x, y, z] = galaxyPosition(i);
    distance = Math.max(distance, z + (Math.max(Math.abs(x), Math.abs(y)) + 17) / Math.tan(halfAngle));
  }
  return { position: [0, distance * 0.15, distance], target: [0, 0, 0] };
}
/** Mixed core / arm / halo samples, interleaved so draw-range LOD retains the silhouette. */
export function galaxySamples(id: string, count: number, dust = false) {
  const style = galaxyStyle(id), random = seededRandom(style.seed + (dust ? 119 : 0));
  const positions = new Float32Array(count * 3), radii = new Float32Array(count), sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const core = !dust && random() < 0.24;
    const halo = random() < 0.13;
    const r = core ? Math.pow(random(), 0.65) * 0.24 : Math.pow(random(), 0.8) * (halo ? 1.28 : 1);
    const arm = Math.floor(random() * style.arms) * Math.PI * 2 / style.arms;
    const spread = (random() + random() + random() - 1.5) * (0.2 + 0.4 * r);
    const angle = core || halo || style.elliptical ? random() * Math.PI * 2 : arm + r * style.twist + spread;
    const thickness = style.elliptical ? 0.4 : core ? 0.18 : halo ? 0.13 : 0.02 + 0.025 * r;
    const bar = style.barred && r < 0.32 && !core;
    positions.set([Math.cos(angle) * r * style.radius, (random() + random() - 1) * style.radius * thickness,
      Math.sin(angle) * r * style.radius * style.flatten * (bar ? 0.28 : 1)], i * 3);
    radii[i] = r;
    sizes[i] = dust ? 0.7 + random() * 1.3 : 0.012 + Math.pow(random(), 8) * 0.1;
  }
  return { positions, radii, sizes };
}
