import { ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, SRGBColorSpace } from "three";
import type { PlanetAppearance } from "../../domain/types.ts";
import type { RenderTier } from "../../domain/cosmic-visuals.ts";

/** Two RGBA8 maps; surface packs linear height / roughness / cloud coverage. */
export const EXTERIOR_BUDGETS = {
  high: { width: 1024, segments: 80, rows: 56, bump: true, clouds: true, anisotropy: 4 },
  medium: { width: 512, segments: 56, rows: 40, bump: true, clouds: true, anisotropy: 2 },
  low: { width: 256, segments: 32, rows: 24, bump: false, clouds: false, anisotropy: 1 },
} as const;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Seeded lattice avoids millions of trigonometric hashes during a texture bake. */
function noiseField(seed: number) {
  let state = (seed >>> 0) + 1;
  const lattice = new Float32Array(32 ** 3);
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  for (let i = 0; i < lattice.length; i++) lattice[i] = random();
  const at = (x: number, y: number, z: number) => lattice[(x & 31) + ((y & 31) << 5) + ((z & 31) << 10)];
  const noise = (x: number, y: number, z: number) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const u = smooth(0, 1, x - ix), v = smooth(0, 1, y - iy), w = smooth(0, 1, z - iz);
    return lerp(lerp(lerp(at(ix, iy, iz), at(ix + 1, iy, iz), u), lerp(at(ix, iy + 1, iz), at(ix + 1, iy + 1, iz), u), v),
      lerp(lerp(at(ix, iy, iz + 1), at(ix + 1, iy, iz + 1), u), lerp(at(ix, iy + 1, iz + 1), at(ix + 1, iy + 1, iz + 1), u), v), w);
  };
  return { noise, random };
}
export interface SurfaceSample { color: [number, number, number]; height: number; roughness: number; cloud: number }

/** Unit-sphere sampling is continuous across the meridian and converges at both poles. */
export function planetSurfaceSampler(appearance: Pick<PlanetAppearance, "type" | "color" | "seed">) {
  const { noise, random } = noiseField(appearance.seed);
  const base = [1, 3, 5].map(i => parseInt(appearance.color.slice(i, i + 2), 16));
  const craters = Array.from({ length: 38 }, () => {
    const y = random() * 2 - 1, angle = random() * Math.PI * 2, r = Math.sqrt(1 - y * y);
    return { x: Math.cos(angle) * r, y, z: Math.sin(angle) * r, radius: .035 + random() ** 2 * .23 };
  });
  const stormLongitude = random() * Math.PI * 2, stormLatitude = random() * .7 - .35;
  // Reused during baking; callers retaining samples must copy them.
  const result: SurfaceSample = { color: [0, 0, 0], height: .5, roughness: .9, cloud: 0 };
  return (x: number, y: number, z: number): SurfaceSample => {
    const n0 = noise(x * 2.4 + 9, y * 2.4 + 7, z * 2.4 + 3);
    const n1 = noise(x * 5.1 + n0, y * 5.1, z * 5.1);
    const n2 = noise(x * 13.7, y * 13.7 + n1, z * 13.7);
    const n3 = noise(x * 37.3 + n2, y * 37.3, z * 37.3);
    const grain = noise(x * 113.7, y * 113.7, z * 113.7);
    const terrain = n0 * .59 + n1 * .26 + n2 * .11 + n3 * .04;
    let height = .5, roughness = .9, cloud = 0;
    let r: number, g: number, b: number;
    if (appearance.type === "rocky") {
      let relief = 0, rim = 0;
      for (const crater of craters) {
        const d = (2 - 2 * (x * crater.x + y * crater.y + z * crater.z)) / (crater.radius * crater.radius);
        if (d > 1.6) continue;
        const edge = Math.exp(-((d - .9) ** 2) * 65);
        relief += edge * .2 - (1 - smooth(.05, .9, d)) * .32; rim += edge;
      }
      const ridge = (1 - Math.abs(n1 * 2 - 1)) ** 5;
      height = clamp(terrain * .65 + ridge * .12 + relief + n3 * .07 + grain * .045);
      const mineral = smooth(.48, .72, n1) * .18;
      const shade = .38 + terrain * .68 + ridge * .1 + relief * .42 + rim * .09 + n3 * .09 + grain * .08;
      r = base[0] * shade + mineral * 48; g = base[1] * shade + mineral * 39; b = base[2] * shade + mineral * 30;
      roughness = .82 + n2 * .16 - rim * .08;
    } else if (appearance.type === "ocean") {
      const land = smooth(.505, .525, terrain), elevation = smooth(.52, .73, terrain);
      const shelf = smooth(.47, .515, terrain);
      const snow = smooth(.79, .94, Math.abs(y) + elevation * .15);
      const mountain = (1 - Math.abs(n2 * 2 - 1)) ** 3 * elevation * n3;
      const mineral = n3 * .12 + grain * .05;
      r = lerp(lerp(5 + base[0] * .035, 18, shelf), 29 + elevation * 85 + mountain * 18 + mineral * 75, land);
      g = lerp(lerp(14 + base[1] * .1, 66, shelf), 57 + elevation * 48 + mountain * 13 + mineral * 60, land);
      b = lerp(lerp(30 + base[2] * .18, 86, shelf), 32 + elevation * 43 + mountain * 10 + mineral * 48, land);
      r = lerp(r, 218, snow); g = lerp(g, 231, snow); b = lerp(b, 232, snow);
      height = lerp(.17, .32 + elevation * .22 + mountain * .08 + n3 * .025 + grain * .012, land);
      roughness = lerp(.22, .86 + n2 * .1, Math.max(land, snow));
      const weather = noise(x * 3.8 + n1 * .7 + 13, y * 7.2, z * 3.8 + 9);
      const wisps = noise(x * 35 + weather * 6, y * 22 + n1 * 2, z * 35);
      cloud = smooth(.52, .72, weather * .58 + wisps * .27 + grain * .15) * .9;
    } else if (appearance.type === "ice") {
      const plate = noise(x * 6 + n0 * 2 + n2 * .12, y * 6 + n1, z * 6);
      const fault = 1 - smooth(.003, .019, Math.abs(plate - .5));
      const secondary = (1 - smooth(.002, .009, Math.abs(n2 - .5))) * .3;
      const fissure = Math.max(fault, secondary), frost = .74 + terrain * .29 + n3 * .09 + grain * .035;
      r = lerp(base[0] * frost, 29, fissure * .78); g = lerp(base[1] * frost, 80, fissure * .7); b = lerp(base[2] * frost, 110, fissure * .6);
      height = .52 + terrain * .15 - fissure * .16 + n3 * .05 + grain * .02;
      roughness = lerp(.58 + n2 * .26, .3, fissure);
    } else {
      const longitude = Math.atan2(z, x);
      const delta = Math.atan2(Math.sin(longitude - stormLongitude), Math.cos(longitude - stormLongitude));
      const dx = delta * Math.sqrt(Math.max(0, 1 - y * y)) / .32, dy = (y - stormLatitude) / .12;
      const stormRadius = Math.sqrt(dx * dx + dy * dy), storm = 1 - smooth(.3, 1.4, stormRadius);
      const curl = Math.sin(Math.atan2(dy, dx) * 2 + stormRadius * 9) * storm;
      const band = Math.sin(y * 58 + n0 * 4 + n1 * 1.8 + n2 * 1.6 + curl * 2) * .5 + .5;
      const fine = Math.sin(y * 142 + n1 * 5 + n2 * 2) * .5 + .5;
      const belt = smooth(.3, .75, band * .82 + fine * .18), shade = .5 + belt * .43 + fine * .075 + n3 * .04 + grain * .025;
      const cream = smooth(.62, .91, band) * .16;
      r = base[0] * shade + cream * 127 + storm * (18 + curl * 13);
      g = base[1] * shade + cream * 103 + storm * (4 + curl * 8); b = base[2] * shade + cream * 73 - storm * 8;
      roughness = .94; // Gas has no solid-surface bump or metallic glints.
    }
    result.color[0] = r; result.color[1] = g; result.color[2] = b;
    result.height = clamp(height); result.roughness = clamp(roughness); result.cloud = cloud;
    return result;
  };
}

export function bakePlanetMaps(appearance: Pick<PlanetAppearance, "type" | "color" | "seed">, tier: RenderTier) {
  const width = EXTERIOR_BUDGETS[tier].width, height = width / 2;
  const albedo = new Uint8Array(width * height * 4), surface = new Uint8Array(albedo.length);
  const sample = planetSurfaceSampler(appearance);
  const longitude = Array.from({ length: width }, (_, x) => x / (width - 1) * Math.PI * 2), cos = longitude.map(Math.cos), sin = longitude.map(Math.sin);
  for (let row = 0; row < height; row++) {
    const latitude = row / (height - 1) * Math.PI, y = -Math.cos(latitude);
    const radius = row === 0 || row === height - 1 ? 0 : Math.sin(latitude);
    for (let col = 0; col < width; col++) {
      const x = col === width - 1 ? 0 : col; // Exact duplicate seam texels and uniform pole rows.
      const s = sample(-cos[x] * radius, y, sin[x] * radius), i = (row * width + col) * 4;
      const cloud = tier === "low" ? s.cloud * .65 : 0; // Low bakes weather, avoiding a transparent shell.
      for (let c = 0; c < 3; c++) albedo[i + c] = Math.round(Math.max(0, Math.min(255, lerp(s.color[c], 231, cloud))));
      albedo[i + 3] = 255;
      surface[i] = Math.round(s.height * 255); surface[i + 1] = Math.round(s.roughness * 255);
      surface[i + 2] = Math.round(s.cloud * 255); surface[i + 3] = 255;
    }
  }
  return { albedo, surface, width, height };
}

/** GPU ownership stays with PlanetMesh; no unbounded global texture cache. */
export function createPlanetTextures(appearance: Pick<PlanetAppearance, "type" | "color" | "seed">, tier: RenderTier) {
  const maps = bakePlanetMaps(appearance, tier);
  const texture = (pixels: Uint8Array, color = false) => {
    const map = new DataTexture(pixels, maps.width, maps.height, RGBAFormat);
    if (color) map.colorSpace = SRGBColorSpace;
    map.wrapS = RepeatWrapping; map.wrapT = ClampToEdgeWrapping;
    map.generateMipmaps = true; map.minFilter = LinearMipmapLinearFilter; map.magFilter = LinearFilter;
    map.anisotropy = EXTERIOR_BUDGETS[tier].anisotropy; map.needsUpdate = true;
    return map;
  };
  return { albedo: texture(maps.albedo, true), surface: texture(maps.surface), dispose() { this.albedo.dispose(); this.surface.dispose(); } };
}
