import { sliceWorldHeight } from "./planet-world.ts";

export type CoastTier = "high" | "medium" | "low";
export type CoastAsset = "hero" | "forest" | "fern" | "shrub" | "rock";
export interface CoastPlace { x: number; z: number; scale: number; turn: number }

function hash(n: number) { const v = Math.sin(n * 127.127 + 4.31) * 43758.5453; return v - Math.floor(v); }

/** Spatially authored bands: a clear overlook, curved walking path, wooded ridge and rocky shore. */
export function coastPlaces(kind: CoastAsset, tier: CoastTier): CoastPlace[] {
  if (kind === "hero") return (tier === "low" ? [
    { x: 25, z: -12, scale: 1.22, turn: .5 },
  ] : [
    { x: 25, z: -12, scale: 1.22, turn: .5 },
    { x: 34, z: -37, scale: 1.05, turn: 2.1 },
  ]);
  const counts = {
    high: { forest: 60, fern: 74, shrub: 42, rock: 36 },
    medium: { forest: 36, fern: 44, shrub: 28, rock: 24 },
    low: { forest: 14, fern: 18, shrub: 12, rock: 12 },
  }[tier];
  const count = counts[kind];
  const result: CoastPlace[] = [];
  for (let i = 0; i < count * 18 && result.length < count; i++) {
    const a = hash(i * 7 + kind.length * 29), b = hash(i * 13 + kind.length * 71);
    const headland = kind === "forest" && i % 3 === 0;
    const forestBand = i % 2 === 0 ? 22 : 40;
    const x = headland ? -50 + a * 29 : kind === "forest" ? forestBand + a * 27 : kind === "rock" ? -18 + a * 47 : -8 + a * 45;
    const z = headland ? -91 + b * 43 : kind === "forest" ? -82 + b * 68 : -55 + b * 95;
    const y = sliceWorldHeight(x, z);
    if (y < (kind === "rock" ? -.45 : .3)) continue;
    // Preserve the camera overlook and a readable, curved route to the cove.
    const pathX = 5 + 3 * Math.sin(z * .046);
    if (z > -44 && z < 33 && Math.abs(x - pathX) < (kind === "forest" ? 12 : kind === "rock" ? 4 : 3.5)) continue;
    if (kind === "forest" && z > -9 && x < 24) continue;
    const scale = (kind === "forest" ? 1.05 : kind === "rock" ? .9 : kind === "fern" ? 1.35 : 2.3)
      * (.7 + hash(i * 19 + 8) * .6);
    result.push({ x, z, scale, turn: hash(i * 23 + 5) * Math.PI * 2 });
  }
  return result;
}
