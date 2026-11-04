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
  const craters = Array.from({ length: 38 }, (_, i) => {
    const y = random() * 2 - 1, angle = random() * Math.PI * 2, r = Math.sqrt(1 - y * y);
    const radius = .035 + random() ** 2 * .23, age = .54 + ((i * .618034) % 1) * .46;
    return { x: Math.cos(angle) * r, y, z: Math.sin(angle) * r, inverseRadiusSquared: 1 / (radius * radius), age, radius };
  });
  const stormLongitude = random() * Math.PI * 2, stormLatitude = random() * .7 - .35;
  const stormX = Math.cos(stormLongitude), stormZ = Math.sin(stormLongitude);
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
      let relief = 0, ejecta = 0;
      for (const crater of craters) {
        const distance = (2 - 2 * (x * crater.x + y * crater.y + z * crater.z)) * crater.inverseRadiusSquared;
        if (distance > 2.15) continue;
        const d = distance + (n3 - .5) * .22 + (grain - .5) * .07;
        const wall = smooth(.51, .87, d) * (1 - smooth(.9, 1.2, d));
        const bowl = 1 - smooth(.14, .91, d);
        const terrace = smooth(.28, .51, d) * (1 - smooth(.58, .76, d));
        const centralPeak = crater.radius > .16 ? (1 - smooth(.025, .16, d)) * .052 : 0;
        relief += (wall * (.067 + n2 * .083) - bowl * .25 + terrace * .026 + centralPeak) * crater.age;
        ejecta += crater.age * smooth(.74, 1.02, d) * (1 - smooth(1.16, 2.04, d)) * smooth(.27, .65, n3);
      }
      const ridge = (1 - Math.abs(n1 * 2 - 1)) ** 5;
      height = clamp(.12 + terrain * .58 + ridge * .10 + relief + n3 * .105 + grain * .058);
      const mineral = smooth(.48, .72, n1) * .18;
      const shade = .35 + terrain * .70 + ridge * .085 + relief * .59 + ejecta * .15 + n3 * .115 + grain * .082;
      r = base[0] * shade + mineral * 48; g = base[1] * shade + mineral * 39; b = base[2] * shade + mineral * 30;
      roughness = .86 + n2 * .12 - ejecta * .05;
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
      roughness = lerp(.176 + shelf * .043 + n3 * .021, .85 + n2 * .12, Math.max(land, snow));
      const weather = noise(x * 3.8 + n1 * .7 + 13, y * 7.2, z * 3.8 + 9);
      const wisps = noise(x * 33 + weather * 8, y * 43 + n1 * 5, z * 33 - weather * 6);
      cloud = smooth(.49, .75, weather * .64 + wisps * .26 + grain * .10) * .94;
    } else if (appearance.type === "ice") {
      const plate = noise(x * 6.6 + n0 * 2.4 + n3 * .16, y * 6.6 + n1 * 1.1, z * 6.6 - n1 * 1.5);
      const offset = plate - .51 + (n3 - .5) * .024;
      const stress = smooth(.30, .63, n1 * .61 + n2 * .39);
      const trough = (1 - smooth(.004, .027, Math.abs(offset))) * stress;
      const fault = (1 - smooth(.0015, .011 + stress * .009, Math.abs(offset))) * stress;
      const branches = (1 - smooth(.001, .013, Math.abs(n2 + n3 * .12 - .55))) * stress * smooth(.10, .45, trough);
      const frost = .66 + terrain * .36 + n3 * .10 + grain * .043 + trough * .09;
      const blueIce = Math.max(fault, branches * .55);
      r = lerp(base[0] * frost, 42, blueIce * .74); g = lerp(base[1] * frost, 90, blueIce * .64); b = lerp(base[2] * frost, 125, blueIce * .52);
      height = .46 + terrain * .21 + trough * .062 - fault * .19 - branches * .055 + n3 * .073 + grain * .031;
      roughness = lerp(.65 + n2 * .24, .39, blueIce);
    } else {
      const dy = (y - stormLatitude) / .145;
      let storm = 0, curl = 0;
      if (Math.abs(dy) < 1.45 && x * stormX + z * stormZ > .5) {
        const dx = (z * stormX - x * stormZ) / .30;
        const distance = Math.hypot(dx, dy);
        storm = 1 - smooth(.28, 1.45, distance);
        if (storm > 0) curl = Math.sin(Math.atan2(dy, dx) * 2 + distance * 10) * storm * smooth(.04, .36, distance);
      }
      // Unequal jets shear the texture east/west; finer filaments follow the same flow.
      const latitude = y + (n0 - .5) * .06 + (n1 - .5) * .038 + curl * .036;
      const filament = noise(x * 13 + n1 * 2, latitude * 69, z * 13 - n1 * 3);
      const broad = Math.sin(latitude * (31 + 22 * y * y) + n2 * .65) * .5 + .5;
      const shear = Math.sin(latitude * 106 + n1 * 2.9 + filament * 3.8) * .5 + .5;
      const belt = smooth(.20, .79, broad * .67 + shear * .19 + filament * .14);
      const jetGroup = Math.sin(y * 11 + .55);
      const contrast = .16 + .12 * (1 - y * y) + n0 * .075 + jetGroup * .055;
      const shade = .54 + belt * contrast + jetGroup * .036 + filament * .134 + n3 * .052 + grain * .027;
      const cream = smooth(.58, .91, broad * .72 + filament * .28) * .13;
      r = base[0] * shade + cream * 132 + storm * 11 + curl * 15;
      g = base[1] * shade + cream * 110 + storm * 5 + curl * 11;
      b = base[2] * shade + cream * 93 - storm * 6 + curl * 7;
      roughness = .92 + filament * .06; // No solid-surface bump or metallic glints.
    }
    result.color[0] = r; result.color[1] = g; result.color[2] = b;
    result.height = clamp(height); result.roughness = clamp(roughness); result.cloud = cloud;
    return result;
  };
}

/** Resumable bake; every tier uses the same continuous surface sampler. */
export function createPlanetBake(appearance: Pick<PlanetAppearance, "type" | "color" | "seed">, tier: RenderTier) {
  const width = EXTERIOR_BUDGETS[tier].width, height = width / 2;
  const albedo = new Uint8Array(width * height * 4), surface = new Uint8Array(albedo.length);
  const sample = planetSurfaceSampler(appearance);
  const longitude = Array.from({ length: width }, (_, x) => x / (width - 1) * Math.PI * 2), cos = longitude.map(Math.cos), sin = longitude.map(Math.sin);
  let row = 0;
  const maps = { albedo, surface, width, height };
  return { maps, get done() { return row === height; }, advance(rows = 4) {
    const end = Math.min(height, row + rows);
    for (; row < end; row++) {
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
  } };
}

export type PlanetPixels = ReturnType<typeof createPlanetBake>["maps"];
export function bakePlanetMaps(appearance: Pick<PlanetAppearance, "type" | "color" | "seed">, tier: RenderTier) {
  const bake = createPlanetBake(appearance, tier); bake.advance(bake.maps.height); return bake.maps;
}

/** GPU ownership stays with PlanetMesh; no unbounded global texture cache. */
export function createPlanetTextures(appearance: Pick<PlanetAppearance, "type" | "color" | "seed">, tier: RenderTier) {
  return texturesFromPixels(bakePlanetMaps(appearance, tier), tier);
}

export function texturesFromPixels(maps: PlanetPixels, tier: RenderTier) {
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
