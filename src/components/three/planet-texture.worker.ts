import { loadLibraryBake } from "./visual-library-pack";
import { visualPresetFor } from "./visual-library";
import { bakePlanetMaps } from "./planet-texture";
import type { PlanetAppearance } from "@/domain/types";
import type { RenderTier } from "@/domain/cosmic-visuals";

self.onmessage = async (event: MessageEvent<{ key: string; appearance: PlanetAppearance; tier: RenderTier }>) => {
  const { key, appearance, tier } = event.data;
  const started = performance.now();
  try {
    const prepared = visualPresetFor(appearance) ? await loadLibraryBake(appearance, tier) : null;
    prepared?.advance(prepared.maps.height);
    const maps = prepared?.maps ?? bakePlanetMaps(appearance, tier);
    self.postMessage({ key, maps, bakeMs: performance.now() - started }, { transfer: [maps.albedo.buffer, maps.surface.buffer] });
  } catch (error) {
    self.postMessage({ key, error: error instanceof Error ? error.message : String(error) });
  }
};
