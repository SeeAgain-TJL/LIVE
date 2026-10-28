import { DataTexture, LinearFilter, RGBAFormat, SRGBColorSpace } from "three";
import type { PlanetAppearance } from "@/domain/types";

function hash(x: number, y: number, seed: number) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 19.19) * 43758.5453;
  return n - Math.floor(n);
}
function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(x: number, y: number, seed: number) {
  let value = 0, weight = 0.55;
  for (let i = 0; i < 5; i++) { value += noise(x, y, seed + i) * weight; x *= 2.03; y *= 2.03; weight *= 0.48; }
  return value;
}
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v * (1 - t) + b[i] * t);

/** Locally generated equirectangular albedo; no remote image or personal-data requests. */
export function createPlanetTexture(appearance: PlanetAppearance, low: boolean) {
  const width = low ? 256 : 512, height = width / 2;
  const pixels = new Uint8Array(width * height * 4);
  const hex = appearance.color.slice(1);
  const base = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  for (let y = 0; y < height; y++) {
    const latitude = y / height;
    for (let x = 0; x < width; x++) {
      // Periodic longitude mapping avoids a hard meridian seam.
      const angle = x / width * Math.PI * 2;
      const nx = Math.cos(angle) * 3 + 4, ny = latitude * 7 + Math.sin(angle) * 2;
      const n = fbm(nx, ny, appearance.seed);
      const detail = noise(nx * 35, ny * 35, appearance.seed);
      let color: number[];
      if (appearance.type === "gas" || appearance.type === "ringed") {
        const band = Math.sin(latitude * 100 + n * 12) * 0.5 + 0.5;
        const storm = Math.sin(latitude * 37 + n * 9) * 0.5 + 0.5;
        color = mix(base.map(v => v * 0.47), base.map(v => Math.min(255, v * 1.16 + 18)), band * 0.65 + storm * 0.22 + detail * 0.08);
      } else if (appearance.type === "ocean") {
        const land = n > 0.51;
        color = land ? mix([48, 69, 48], [137, 147, 105], Math.min(1, (n - 0.51) * 5)) : mix([8, 24, 43], base, n * 0.86);
        const cloud = fbm(nx * 1.8 + 12, ny * 1.7, appearance.seed + 20);
        if (cloud > 0.58) color = mix(color, [228, 236, 229], Math.min(0.88, (cloud - 0.58) * 5));
        if (Math.abs(latitude - 0.5) > 0.445 + n * 0.025) color = mix(color, [206, 220, 221], 0.85);
      } else if (appearance.type === "ice") {
        const crack = Math.pow(Math.abs(Math.sin(n * 38 + latitude * 15)), 0.3);
        color = mix([37, 72, 88], base.map(v => Math.min(255, v * 1.13)), crack * 0.65 + n * 0.3);
      } else {
        color = mix(base.map(v => v * 0.3), base.map(v => Math.min(255, v * 1.2)), Math.min(1, n * 1.2 + detail * 0.17));
        const crater = Math.sin(n * 90) * Math.sin(detail * 8);
        color = color.map(v => v * (0.88 + crater * 0.12));
      }
      const index = (y * width + x) * 4;
      pixels[index] = color[0]; pixels[index + 1] = color[1]; pixels[index + 2] = color[2]; pixels[index + 3] = 255;
    }
  }
  const texture = new DataTexture(pixels, width, height, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
