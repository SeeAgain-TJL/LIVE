import type { Planet, PlanetAppearance, Vec3 } from "./types.ts";
import type { StellarSource } from "./spatial-scene.ts";
import { identitySeed, seededRandom, type RenderTier } from "./cosmic-visuals.ts";

export interface EnvironmentBody { position: Vec3; size: number; appearance: PlanetAppearance }
export function safeEnvironmentCamera(position: Vec3, bodies: Array<{ position: Vec3; size: number }>): Vec3 {
  let safe = position;
  for (const body of bodies) {
    const delta = safe.map((n, i) => n - body.position[i]), distance = Math.hypot(...delta), boundary = body.size * 2.5 + 1;
    if (distance < boundary) safe = body.position.map((n, i) => n + (distance < .001 ? [0, 0, 1][i] : delta[i] / distance) * boundary) as Vec3;
  }
  return safe;
}

/** Legacy deterministic descriptors retained for migration/tests. The renderer deliberately
 * does not instantiate them; empty systems use vacancySlots instead. */
export function environmentBodies(identity: string, planets: Planet[], source: StellarSource): EnvironmentBody[] {
  if (planets.length) return [];
  const seed = identitySeed(identity);
  return [
    { offset: [13, -6, 4], type: "rocky", color: "#b4987c", size: 1.2, rings: false },
    { offset: [29, -9, -12], type: "ringed", color: "#aebbbd", size: 2.5, rings: true },
    { offset: [9, 4, -30], type: "ice", color: "#779bbd", size: 1.6, rings: false },
  ].map((body, i) => ({ position: body.offset.map((n, j) => n + source.position[j]) as Vec3, size: body.size,
    appearance: { type: body.type as PlanetAppearance["type"], color: body.color, size: body.size, rings: body.rings, seed: (seed % 500) + i * 17 } }));
}
export interface VacancySlot { id: string; label: string; position: Vec3; size: number }

/** Empty systems use legible future locations rather than invented solid planets. */
export function vacancySlots(identity: string, planets: Planet[], source: StellarSource): VacancySlot[] {
  if (planets.length) return [];
  const seed = identitySeed(identity);
  const count = 1 + (seed % 3);
  const offsets: Vec3[] = [[13, -5, -2], [-17, 4, -18], [6, -7, -31]];
  return offsets.slice(0, count).map((offset, index) => ({
    id: `${identity}-vacancy-${index}`,
    label: `待创建星位 ${index + 1}`,
    size: 1.15 + index * .18,
    position: offset.map((value, axis) => value + source.position[axis]) as Vec3,
  }));
}

/** A tilted elliptical asteroid belt, with gaps around saved worlds and the camera's central corridor. */
export function systemDebris(identity: string, planets: Planet[], source: StellarSource, tier: RenderTier) {
  const random = seededRandom(identitySeed(identity) + 361);
  const count = planets.length === 0 ? tier === "low" ? 55 : tier === "medium" ? 110 : 180 : tier === "low" ? 180 : tier === "medium" ? 520 : 900;
  const pieces: { position: Vec3; size: number; rotation: Vec3 }[] = [];
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2, r = 23 + (random() + random() - 1) * 3;
    const position: Vec3 = [source.position[0] + Math.cos(angle) * r, source.position[1] + Math.sin(angle) * r * .32 - 2, source.position[2] + Math.sin(angle) * r * .78];
    if (planets.some(p => Math.hypot(...position.map((n, j) => n - p.position[j])) < p.appearance.size * 3)) continue;
    pieces.push({ position, size: .025 + Math.pow(random(), 3) * .17, rotation: [random() * 6, random() * 6, random() * 6] });
  }
  return pieces;
}
