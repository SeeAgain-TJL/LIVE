import assert from "node:assert/strict";
import test from "node:test";
import { LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, SRGBColorSpace } from "three";
import { bakePlanetMaps, createPlanetBake, createPlanetTextures, EXTERIOR_BUDGETS, planetSurfaceSampler } from "../src/components/three/planet-texture.ts";
import { PlanetPixelCache } from "../src/components/three/planet-pixel-cache.ts";
import { EXTERIOR_GPU_BUDGET, exteriorMapBytes, planExteriorLod, type LodCandidate } from "../src/components/three/exterior-lod.ts";
import { createSeed } from "../src/data/seed.ts";

test("all five surfaces are deterministic, seam/pole continuous and do not mutate appearances", () => {
  const data = createSeed(), original = JSON.stringify(data);
  for (const { appearance } of data.planets) {
    const maps = bakePlanetMaps(appearance, "low");
    assert.deepEqual(maps, bakePlanetMaps(appearance, "low"));
    assert.notDeepEqual(maps.albedo, bakePlanetMaps({ ...appearance, seed: appearance.seed + 1 }, "low").albedo);
    for (const pixels of [maps.albedo, maps.surface]) {
      for (let y = 0; y < maps.height; y++) {
        const start = y * maps.width * 4;
        assert.deepEqual(pixels.slice(start, start + 4), pixels.slice(start + (maps.width - 1) * 4, start + maps.width * 4));
      }
      for (const y of [0, maps.height - 1]) for (let x = 1; x < maps.width; x++) {
        const start = y * maps.width * 4;
        assert.deepEqual(pixels.slice(start, start + 4), pixels.slice(start + x * 4, start + x * 4 + 4));
      }
    }
  }
  assert.equal(JSON.stringify(data), original);
});

test("recolouring never changes topography, roughness or weather; water remains smooth beside rough land", () => {
  for (const { appearance } of createSeed().planets) {
    const a = bakePlanetMaps({ ...appearance, color: "#ffffff" }, "low");
    const b = bakePlanetMaps({ ...appearance, color: "#8b3546" }, "low");
    assert.deepEqual(a.surface, b.surface);
    assert.notDeepEqual(a.albedo, b.albedo);
  }
  const sample = planetSurfaceSampler({ type: "ocean", color: "#5c93aa", seed: 91 });
  let sea = 0, land = 0, weather = 0;
  for (let i = 0; i < 1000; i++) {
    const y = 1 - 2 * (i + .5) / 1000, radius = Math.sqrt(1 - y * y), angle = i * 2.399963;
    const s = sample(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    assert(s.height >= 0 && s.height <= 1 && s.roughness >= 0 && s.roughness <= 1);
    if (s.roughness < .25) { sea++; assert(Math.abs(s.height - .17) < .02); }
    if (s.roughness > .85) land++;
    if (s.cloud > .1) weather++;
  }
  assert(sea > 50 && land > 50 && weather > 20);
});

test("three quality tiers bound texture/geometry cost and give GPU maps the correct colour space and disposal", () => {
  assert(EXTERIOR_BUDGETS.low.width < EXTERIOR_BUDGETS.medium.width && EXTERIOR_BUDGETS.medium.width < EXTERIOR_BUDGETS.high.width);
  assert(EXTERIOR_BUDGETS.low.segments < EXTERIOR_BUDGETS.medium.segments && EXTERIOR_BUDGETS.medium.segments < EXTERIOR_BUDGETS.high.segments);
  assert(!EXTERIOR_BUDGETS.low.bump && !EXTERIOR_BUDGETS.low.clouds);
  const maps = createPlanetTextures(createSeed().planets[0].appearance, "low");
  assert.equal(maps.albedo.colorSpace, SRGBColorSpace); assert.equal(maps.surface.colorSpace, NoColorSpace);
  assert.equal(maps.albedo.minFilter, LinearMipmapLinearFilter); assert.equal(maps.surface.wrapS, RepeatWrapping);
  let disposed = 0;
  maps.albedo.addEventListener("dispose", () => disposed++); maps.surface.addEventListener("dispose", () => disposed++);
  maps.dispose(); assert.equal(disposed, 2);
});

test("resumed texture rows match synchronous pixels and cache obeys LRU byte budget", () => {
  const appearance = createSeed().planets[1].appearance;
  const sliced = createPlanetBake(appearance, "medium");
  while (!sliced.done) sliced.advance(13);
  assert.deepEqual(sliced.maps, bakePlanetMaps(appearance, "medium"));
  const bytes = sliced.maps.albedo.byteLength + sliced.maps.surface.byteLength;
  const cache = new PlanetPixelCache(bytes * 2);
  cache.set("a", sliced.maps); cache.set("b", sliced.maps);
  assert.equal(cache.get("a"), sliced.maps);
  cache.set("c", sliced.maps);
  assert.equal(cache.get("b"), undefined); assert.equal(cache.get("a"), sliced.maps);
  assert.equal(cache.bytes, bytes * 2); assert.equal(cache.size, 2);
  cache.set("a", sliced.maps); assert.equal(cache.bytes, bytes * 2);
  cache.set("too-large", { ...sliced.maps, albedo: new Uint8Array(bytes * 3) });
  assert.equal(cache.get("too-large"), undefined); assert.equal(cache.bytes, bytes * 2);
});

test("exterior LOD budgets 50 planets and reserves the current flight ahead of visible detail", () => {
  const far: LodCandidate = { id: "far", pixels: 24, distanceInRadii: 100, visible: true, retained: true, focused: false, hovered: false, approaching: 0, previous: null };
  const visible = Array.from({ length: 50 }, (_, i) => ({ ...far, id: String(i), pixels: i < 15 ? 200 : 24 }));
  const focus = { ...far, id: "flight", focused: true, visible: false };
  const expired = { ...far, id: "expired", visible: false, retained: false, previous: "high" as const };
  for (const ceiling of ["low", "medium", "high"] as const) {
    const results = planExteriorLod([...visible, focus, expired], ceiling);
    assert.equal(results[0].id, "flight");
    assert.equal(results[0].tier, ceiling);
    assert.equal(results.find(p => p.id === expired.id)?.tier, null);
    assert.ok(results.filter(p => p.visible).every(p => p.tier));
    assert.ok(results.reduce((sum, p) => sum + (p.tier ? exteriorMapBytes(p.tier) : 0), 0) <= EXTERIOR_GPU_BUDGET[ceiling] * 2 ** 20);
  }
  const borderline = { ...far, pixels: 100 };
  assert.equal(planExteriorLod([borderline], "high")[0].tier, "medium");
  assert.equal(planExteriorLod([{ ...borderline, previous: "high" }], "high")[0].tier, "high");
  assert.equal(planExteriorLod([{ ...far, distanceInRadii: 8 }], "high")[0].tier, "high");
});
