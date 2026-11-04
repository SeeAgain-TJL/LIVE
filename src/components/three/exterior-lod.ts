import type { RenderTier } from "../../domain/cosmic-visuals.ts";
import { EXTERIOR_BUDGETS } from "./planet-texture.ts";

export interface LodCandidate {
  id: string;
  pixels: number;
  distanceInRadii: number;
  visible: boolean;
  retained: boolean;
  focused: boolean;
  hovered: boolean;
  approaching: number;
  previous: RenderTier | null;
}

const tiers = ["low", "medium", "high"] as const;
export const EXTERIOR_GPU_BUDGET = { low: 20, medium: 28, high: 40 } satisfies Record<RenderTier, number>;
export function exteriorMapBytes(tier: RenderTier) {
  let width: number = EXTERIOR_BUDGETS[tier].width, height = width / 2, bytes = 0;
  while (width > 1 || height > 1) {
    bytes += width * height * 8; // Two RGBA8 maps.
    width = Math.max(1, width / 2); height = Math.max(1, height / 2);
  }
  return bytes + 8;
}

function wanted(p: LodCandidate, ceiling: number) {
  if (p.focused) return ceiling;
  const previous = p.previous ? tiers.indexOf(p.previous) : -1;
  if (ceiling >= 2 && (p.pixels >= (previous >= 2 ? 88 : 114) || p.distanceInRadii <= (previous >= 2 ? 13 : 10))) return 2;
  if (ceiling >= 1 && (p.pixels >= (previous >= 1 ? 42 : 56) || p.distanceInRadii <= (previous >= 1 ? 28 : 22))) return 1;
  return 0;
}

export function planExteriorLod(candidates: LodCandidate[], ceiling: RenderTier) {
  const cap = tiers.indexOf(ceiling);
  let remaining = EXTERIOR_GPU_BUDGET[ceiling] * 2 ** 20;
  const entries = candidates.map(p => ({
    ...p, tier: null as RenderTier | null,
    priority: (p.focused ? 20_000 : 0) + (p.visible ? 5000 : 0) + (p.hovered && p.visible ? 2000 : 0)
      + Math.min(p.pixels, 1600) + Math.min(Math.max(0, p.approaching), 150) + (p.previous ? 8 : 0),
  })).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

  // Reserve the affordable overview first; focus can preempt the farthest tiles.
  const focus = entries.find(p => p.focused);
  if (focus) { focus.tier = ceiling; remaining -= exteriorMapBytes(ceiling); }
  const lowBytes = exteriorMapBytes("low");
  for (const p of entries) {
    if (p.tier || !p.visible || remaining < lowBytes) continue;
    p.tier = "low"; remaining -= lowBytes;
  }
  for (const p of entries) {
    if (!p.visible || !p.tier || p.focused) continue;
    for (let i = wanted(p, cap); i > 0; i--) {
      const extra = exteriorMapBytes(tiers[i]) - lowBytes;
      if (extra <= remaining) { p.tier = tiers[i]; remaining -= extra; break; }
    }
  }
  // An offscreen grace period avoids rebakes along the frustum boundary. It never
  // reserves space ahead of visible planets, nor starts a higher quality request.
  for (const p of entries) {
    if (!p.visible && !p.focused && p.retained && p.previous) {
      const tier = tiers[Math.min(cap, tiers.indexOf(p.previous))];
      const bytes = exteriorMapBytes(tier);
      if (tier === p.previous && bytes <= remaining) { p.tier = tier; remaining -= bytes; }
    }
  }
  return entries;
}
