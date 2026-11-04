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

/** Local tangent frames give glaciers a direction, a finite extent and no UV pole. */
function iceCatchments(random: () => number) {
  const phase = random() * Math.PI * 2;
  return Array.from({ length: 13 }, (_, i) => {
    const y = 1 - 2 * (i + .35 + random() * .3) / 13;
    const angle = phase + i * 2.399963 + (random() - .5) * .41;
    const c = Math.cos(angle), s = Math.sin(angle), r = Math.sqrt(1 - y * y);
    const heading = random() * Math.PI * 2, a = Math.cos(heading), b = Math.sin(heading);
    return { x: c * r, y, z: s * r,
      ax: -s * a - c * y * b, ay: r * b, az: c * a - s * y * b,
      bx: s * b - c * y * a, by: r * a, bz: -c * b - s * y * a,
      length: .32 + random() * .35, width: .065 + random() * .128,
      bend: (random() - .5) * 2, strength: .53 + random() * .47 };
  });
}

/** Seeded succession of unequal belts and zones, sampled after advecting latitude. */
function cloudJets(random: () => number, ringed: boolean) {
  const samples = new Float32Array(513);
  let start = -1, previous = .52;
  while (start < 1) {
    const width = .055 + random() ** 1.65 * (ringed ? .29 : .24), end = start + width;
    const next = (previous > .53 ? .24 : .64) + random() * .25;
    for (let i = Math.ceil((start + 1) * 256); i < samples.length && i <= (end + 1) * 256; i++) {
      const t = (i / 256 - 1 - start) / width;
      samples[i] = lerp(previous, next, smooth(0, .33, t)) + (smooth(.41, .55, t) - smooth(.67, .91, t)) * (previous - next) * .24;
    }
    previous = next; start = end;
  }
  return samples;
}

/** Unit-sphere sampling is continuous across the meridian and converges at both poles. */
export function planetSurfaceSampler(appearance: Pick<PlanetAppearance, "type" | "color" | "seed">) {
  const { noise, random } = noiseField(appearance.seed);
  const base = [1, 3, 5].map(i => parseInt(appearance.color.slice(i, i + 2), 16));
  const craters = appearance.type === "rocky" ? Array.from({ length: 38 }, (_, i) => {
    const y = random() * 2 - 1, angle = random() * Math.PI * 2, r = Math.sqrt(1 - y * y);
    const radius = .035 + random() ** 2 * .23, age = .54 + ((i * .618034) % 1) * .46;
    return { x: Math.cos(angle) * r, y, z: Math.sin(angle) * r, inverseRadiusSquared: 1 / (radius * radius), age, radius };
  }) : [];
  const catchments = appearance.type === "ice" ? iceCatchments(random) : [];
  const ringed = appearance.type === "ringed";
  const jets = appearance.type === "gas" || ringed ? cloudJets(random, ringed) : null;
  const storms = jets ? Array.from({ length: 4 }, (_, i) => {
    const longitude = random() * Math.PI * 2 + i * 2.399963;
    return { x: Math.cos(longitude), z: Math.sin(longitude), latitude: (i - 1.5) * .36 + (random() - .5) * .17,
      width: i === 1 ? .31 : .14 + random() * .11, height: i === 1 ? .15 : .075 + random() * .055, spin: i % 2 ? 1 : -1 };
  }) : [];
  // Reused during baking; callers retaining samples must copy them.
  const result: SurfaceSample = { color: [0, 0, 0], height: .5, roughness: .9, cloud: 0 };
  return (x: number, y: number, z: number): SurfaceSample => {
    const n0 = noise(x * 2.4 + 9, y * 2.4 + 7, z * 2.4 + 3);
    const n1 = noise(x * 5.1 + n0, y * 5.1, z * 5.1);
    const n2 = noise(x * 13.7, y * 13.7 + n1, z * 13.7);
    const n3 = noise(x * 37.3 + n2, y * 37.3, z * 37.3);
    const grain = appearance.type === "rocky" ? noise(x * 113.7, y * 113.7, z * 113.7) : 0;
    const terrain = n0 * .59 + n1 * .26 + n2 * .11 + n3 * .04;
    let height = .5, roughness = .9, cloud = 0;
    let r: number, g: number, b: number;
    if (appearance.type === "rocky") {
      let relief = 0, ejecta = 0, bedrock = 0;
      for (const crater of craters) {
        const distance = (2 - 2 * (x * crater.x + y * crater.y + z * crater.z)) * crater.inverseRadiusSquared;
        if (distance > 2.15) continue;
        const wear = smooth(.29, .76, n2) * (1.22 - crater.age);
        const d = distance + (n2 - .5) * .20 + (n3 - .5) * (.13 + wear * .26);
        const wall = smooth(.55, .89, d) * (1 - smooth(.94, 1.25 + wear * .23, d));
        const bowl = 1 - smooth(.17, .87, d);
        const shelf = (smooth(.23, .36, d) - smooth(.40, .51, d)) + (smooth(.50, .58, d) - smooth(.65, .76, d)) * .65;
        const peak = crater.radius > .16 ? (1 - smooth(.025, .19, d)) * (.045 + n2 * .074) : 0;
        relief += (wall * (.14 - wear * .16) - bowl * .27 + shelf * .044 + peak) * crater.age;
        bedrock = Math.max(bedrock, shelf * (.45 + n2 * .55));
        ejecta += crater.age * smooth(.81, 1.06, d) * (1 - smooth(1.23, 2.04, d)) * smooth(.29, .72, n2 * .66 + n3 * .34);
      }
      const upland = smooth(.40, .69, n0);
      const escarpment = 1 - smooth(.027, .23, Math.abs(n1 + (n2 - .5) * .21 - .56));
      const ridge = upland * escarpment * (.54 + n2 * .46);
      const sediment = smooth(.38, .68, n1 + relief * .37) * (.10 + bedrock * .19);
      height = .25 + terrain * .44 + ridge * .27 + relief + n3 * .050 + grain * .018;
      const shade = .43 + terrain * .57 + ridge * .19 + relief * .63 + ejecta * .10 + n3 * .063 + grain * .039;
      r = base[0] * shade + sediment * 55; g = base[1] * shade + sediment * 43; b = base[2] * shade + sediment * 33;
      roughness = .84 + n2 * .13 - ejecta * .05 - bedrock * .065;
    } else if (appearance.type === "ocean") {
      // Flood elongated basins, leaving broken microcontinents and shallow shelves.
      const crust = noise(x * 3.7 + n0 * 1.55 + 11, y * 2.3 + n1 * .77, z * 3.7 - n0 * .96);
      const coast = .575 * crust + .207 * n0 + .122 * n1 + .078 * n2 + .018 * n3;
      const land = smooth(.538, .553, coast), elevation = smooth(.54, .79, coast);
      const shelf = smooth(.446, .548, coast), lagoon = shelf * shelf * (1 - land);
      const mountain = (1 - smooth(.03, .25, Math.abs(n2 - .51))) * elevation;
      const highlands = elevation * (.54 + mountain * .46);
      const dry = smooth(.34, .73, n0 * .55 + crust * .45);
      r = lerp(6 + base[0] * .05 + lagoon * 29, 43 + dry * 57 + highlands * 70 + n3 * 12, land);
      g = lerp(11 + base[1] * .18 + lagoon * 61, 59 + dry * 25 + highlands * 43 + n3 * 10, land);
      b = lerp(19 + base[2] * .26 + lagoon * 41, 46 + dry * 18 + highlands * 38 + n3 * 9, land);
      height = lerp(.17, .22 + elevation * .28 + mountain * .10 + n3 * .027, land);
      const front = noise(x * 4.1 + n0 * 3.1 + 8, y * 6.6 + n1 * 1.1, z * 4.1 - n0 * 3.4);
      const filament = noise(x * 9.6 + n1 * 1.6, y * 25 + front * 5, z * 9.6 - n1 * 1.3);
      roughness = lerp(.155 + shelf * .046 + smooth(.33, .74, front) * .064, .86 + n2 * .10, land);
      const shield = smooth(.51, .71, front * .72 + filament * .28);
      const fringe = (1 - smooth(.025, .113, Math.abs(front - .51))) * smooth(.42, .80, filament);
      cloud = clamp(shield * (.41 + filament * .42 + n3 * .17) + fringe * .27);
    } else if (appearance.type === "ice") {
      let flow = 0, trench = 0, ridge = 0, moraine = 0, crevasses = 0;
      for (const c of catchments) {
        const facing = x * c.x + y * c.y + z * c.z;
        if (facing < .67) continue;
        const along = (x * c.ax + y * c.ay + z * c.az) / c.length;
        if (Math.abs(along) >= 1) continue;
        const end = smooth(-1, -.53, along) * (1 - smooth(.24, 1, along));
        const bank = x * c.bx + y * c.by + z * c.bz;
        const channel = (bank + c.bend * (.064 - along * along * .23) + (n1 - .5) * .16) / c.width;
        const spread = .70 + smooth(-.63, -.05, along) * .43 - smooth(.25, .98, along) * .65;
        const cross = Math.abs(channel) / spread;
        if (cross >= 1.83) continue;
        const fade = end * smooth(.67, .79, facing);
        const lobe = (1 - smooth(.30, 1.18 + (n2 - .5) * .52, cross)) * fade * c.strength;
        const rim = cross + (n2 - .5) * .28 + (n3 - .5) * .10;
        const flank = (smooth(.49, .92, rim) - smooth(1.02, 1.55, rim)) * fade;
        // Long streaks follow the ice. Offset crevasse steps follow pressure around bends.
        const veins = noise(channel * 6 + c.strength * 19, along * 2.7, c.bend * 8 + n2 * .65);
        const step = along + .29 * channel * channel + (n2 - .5) * .25;
        const face = (smooth(-.43, -.36, step) - smooth(-.30, -.14, step)) * .63 +
          (smooth(.16, .22, step) - smooth(.29, .49, step));
        const split = Math.abs(channel - .62 * spread + (n2 - .5) * .46);
        const broken = (1 - smooth(.022, .135, split)) * smooth(.24, .60, n2);
        const pressure = step + (n3 - .5) * .13 + channel * (.23 - veins * .32);
        const cracks = (1 - smooth(.012, .046, Math.abs(pressure - .18))) +
          (1 - smooth(.007, .042, Math.abs(pressure + .25 + (veins - .5) * .21))) * .74;
        flow = Math.max(flow, lobe * (.60 + .40 * veins));
        ridge = Math.max(ridge, flank * (.26 + n2 * .60) + lobe * face * .78);
        trench = Math.max(trench, fade * broken);
        moraine = Math.max(moraine, (lobe * .7 + flank * .3) * smooth(.29, .78, veins));
        crevasses = Math.max(crevasses, lobe * (.28 + .72 * smooth(.33, .63, veins)) * cracks);
      }
      const plain = smooth(.25, .72, n0 * .76 + n1 * .24);
      const drift = smooth(.31, .69, n1 * .69 + n2 * .31);
      const exposed = smooth(.018, .71, flow * .72 + moraine * .33 + trench * .45 + crevasses * .74);
      const snow = .69 + plain * .15 + drift * .10 + ridge * .24 + n3 * .039;
      r = lerp(base[0] * snow, 79 + moraine * 58, exposed * .73);
      g = lerp(base[1] * snow, 133 + moraine * 49, exposed * .61);
      b = lerp(base[2] * (snow + .022), 174 + moraine * 46, exposed * .43);
      height = .30 + plain * .18 + drift * .089 + ridge * .34 - flow * .076 - trench * .118 - crevasses * .21 + moraine * .076 + n3 * .037;
      roughness = lerp(.72 + plain * .19, .39 + moraine * .23, exposed);
    } else if (jets) {
      let drift = 0, eye = 0, shoulder = 0;
      for (const storm of storms) {
        const dy = (y - storm.latitude) / storm.height;
        if (Math.abs(dy) > 1.5 || x * storm.x + z * storm.z < .52) continue;
        const dx = (z * storm.x - x * storm.z) / storm.width;
        const distance = dx * dx + dy * dy;
        if (distance > 2.25) continue;
        const envelope = 1 - smooth(.23, 2.25, distance);
        const turn = storm.spin * envelope * 2.7;
        drift += (dy * (Math.cos(turn) - 1) + dx * Math.sin(turn)) * storm.height;
        eye += 1 - smooth(.045, .42, distance + (n2 - .5) * .18);
        shoulder += envelope * (1 - smooth(.06, .30, Math.abs(distance - .68 + (n2 - .5) * .39)));
      }
      const jetPosition = clamp((y + drift + (n0 - .5) * .09 + (n1 - .5) * .041 + 1) * .5) * 512;
      const index = Math.min(511, Math.floor(jetPosition));
      const belt = lerp(jets[index], jets[index + 1], jetPosition - index);
      const filament = noise(x * 7.3 + n1 * 2, (y + drift * .8) * 39 + belt * 1.8, z * 7.3 - n1 * 2);
      const pole = smooth(.74, 1, Math.abs(y));
      const shear = lerp(belt, n1 * .59 + n2 * .41, pole * .81);
      const plumes = smooth(.42, .84, shear * .64 + filament * .36);
      const shade = .51 + shear * (ringed ? .23 : .33) + filament * .16 + plumes * .06 + eye * .11;
      const cream = plumes * (ringed ? .27 : .20) + shoulder * .22;
      r = base[0] * shade + cream * 135 + eye * 22;
      g = base[1] * shade + cream * 119 + eye * 9;
      b = base[2] * shade + cream * 103 - eye * 9;
      roughness = .93 + filament * .05;
    } else {
      [r, g, b] = base;
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
