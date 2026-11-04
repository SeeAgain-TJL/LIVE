import type { PlanetPixels } from "./planet-texture.ts";

/** CPU bytes only: GPU resources remain owned/disposed by each mounted PlanetMesh. */
export class PlanetPixelCache {
  private entries = new Map<string, PlanetPixels>();
  bytes = 0;
  readonly limit: number;
  constructor(limit = 32 * 1024 * 1024) { this.limit = limit; }
  get size() { return this.entries.size; }
  get(key: string) {
    const value = this.entries.get(key);
    if (value) { this.entries.delete(key); this.entries.set(key, value); }
    return value;
  }
  set(key: string, value: PlanetPixels) {
    const bytes = value.albedo.byteLength + value.surface.byteLength;
    const old = this.entries.get(key);
    if (old) { this.bytes -= old.albedo.byteLength + old.surface.byteLength; this.entries.delete(key); }
    if (bytes > this.limit) return;
    this.entries.set(key, value); this.bytes += bytes;
    while (this.bytes > this.limit) {
      const first = this.entries.keys().next().value!;
      const removed = this.entries.get(first)!;
      this.bytes -= removed.albedo.byteLength + removed.surface.byteLength; this.entries.delete(first);
    }
  }
}
