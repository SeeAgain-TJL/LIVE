import { bakePlanetMaps } from "./planet-texture";
import type { PlanetAppearance } from "@/domain/types";
import type { RenderTier } from "@/domain/cosmic-visuals";

self.onmessage = (event: MessageEvent<{ key: string; appearance: PlanetAppearance; tier: RenderTier }>) => {
  const { key, appearance, tier } = event.data;
  const started = performance.now();
  const maps = bakePlanetMaps(appearance, tier);
  self.postMessage({ key, maps, bakeMs: performance.now() - started }, { transfer: [maps.albedo.buffer, maps.surface.buffer] });
};
