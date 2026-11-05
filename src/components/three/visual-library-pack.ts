import type { PlanetAppearance } from "../../domain/types.ts";
import type { RenderTier } from "../../domain/cosmic-visuals.ts";
import { visualPresetFor } from "./visual-library.ts";

const widths = { high: 1024, medium: 512, low: 256 } as const;
const HEADER = 8;
export function decodeLibraryPack(bytes: Uint8Array, tier: RenderTier) {
  const width = widths[tier], height = width / 2;
  if (bytes.length !== HEADER + width * height * 6 ||
    bytes[0] !== 80 || bytes[1] !== 86 || bytes[2] !== 76 || bytes[3] !== 49 ||
    (bytes[4] | bytes[5] << 8) !== width || (bytes[6] | bytes[7] << 8) !== height) {
    throw new Error("Invalid exterior asset pack");
  }
  const albedo = new Uint8Array(width * height * 4), surface = new Uint8Array(albedo.length);
  const maps = { albedo, surface, width, height };
  let row = 0;
  return { maps, get done() { return row === height; }, advance(rows = 4) {
    for (const end = Math.min(height, row + rows); row < end; row++) {
      let r = 0, g = 0, b = 0, h = 0, roughness = 0, cloud = 0;
      for (let x = 0; x < width; x++) {
        const j = row * width + x, i = j * 4, s = HEADER + j * 6;
        albedo[i] = r = (r + bytes[s]) & 255;
        albedo[i + 1] = g = (g + bytes[s + 1]) & 255;
        albedo[i + 2] = b = (b + bytes[s + 2]) & 255;
        albedo[i + 3] = 255;
        surface[i] = h = (h + bytes[s + 3]) & 255;
        surface[i + 1] = roughness = (roughness + bytes[s + 4]) & 255;
        surface[i + 2] = cloud = (cloud + bytes[s + 5]) & 255;
        surface[i + 3] = 255;
      }
    }
  } };
}

export async function loadLibraryBake(appearance: Pick<PlanetAppearance, "type" | "seed">, tier: RenderTier) {
  const preset = visualPresetFor(appearance);
  if (!preset) return null;
  const response = await fetch(new URL(`/planet-visual-assets/v1/${preset.id}-${tier}.pvl`, globalThis.location.origin), {
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok || !response.body) throw new Error(`Exterior asset not available: ${preset.id} (${response.status})`);
  const bytes = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  return decodeLibraryPack(new Uint8Array(bytes), tier);
}
