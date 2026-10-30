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
  return { seed, radius: 6.5 + random() * 3.2, arms: seed % 3 + 2, twist: 3.7 + random() * 2,
    flatten: 0.65 + random() * 0.35, tilt: [0.55 + random() * 0.95, random() * Math.PI, -0.6 + random() * 1.2] as Vec3,
    elliptical: seed % 5 === 0, speed: 0.003 + random() * 0.004 };
}
export function galaxyOverview(count: number, aspect: number): CameraBookmark {
  const radius = Math.max(12, ...Array.from({ length: count }, (_, i) => Math.hypot(...galaxyPosition(i)) + 11));
  const distance = radius / Math.sin(Math.atan(Math.tan(43 * Math.PI / 360) * Math.min(1, Math.max(0.2, aspect))));
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
    const thickness = core ? 0.12 : halo ? 0.08 : 0.014 + 0.025 * r;
    positions.set([Math.cos(angle) * r * style.radius, (random() + random() - 1) * style.radius * thickness,
      Math.sin(angle) * r * style.radius * style.flatten], i * 3);
    radii[i] = r;
    sizes[i] = dust ? 0.7 + random() * 1.3 : 0.012 + Math.pow(random(), 8) * 0.1;
  }
  return { positions, radii, sizes };
}
