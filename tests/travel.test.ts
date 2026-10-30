import assert from "node:assert/strict";
import test from "node:test";
import { comfortableProgress, stagedProgress, journeyPhase, TRAVEL_PROFILES } from "../src/domain/travel.ts";
import { readTravelMode, saveTravelMode, TRAVEL_KEY } from "../src/data/travel-preferences.ts";
import { environmentBodies, systemDebris, safeEnvironmentCamera } from "../src/domain/system-environment.ts";
import { stellarSource } from "../src/domain/spatial-scene.ts";
import { createSeed } from "../src/data/seed.ts";

test("staged travel starts/stops gently, is monotone and provides a deliberate arrival hold", () => {
  assert.equal(stagedProgress(-1), 0); assert.equal(stagedProgress(2), 1);
  let previous = 0;
  for (let i = 0; i <= 1000; i++) { const p = stagedProgress(i / 1000); assert(p >= previous && p <= 1); previous = p; }
  assert(stagedProgress(.001) / .001 < .001);
  assert((1 - stagedProgress(.999)) / .001 < .001);
  assert.deepEqual([journeyPhase(.1), journeyPhase(.4), journeyPhase(.9), journeyPhase(1, true)], ["starting", "cruising", "slowing", "settling"]);
  assert(TRAVEL_PROFILES.comfort.galaxy > TRAVEL_PROFILES.standard.galaxy);
  assert(TRAVEL_PROFILES.standard.planet > TRAVEL_PROFILES.fast.planet);
  assert(TRAVEL_PROFILES.comfort.hold >= 1);
  assert(TRAVEL_PROFILES.comfort.arrivalScale < TRAVEL_PROFILES.fast.arrivalScale);
});

test("approach remapping limits the late rush in perceived scale rather than moving at constant world speed", () => {
  const distance = (t: number) => 100 - comfortableProgress(t, 100, 5) * 95;
  assert.equal(distance(0), 100); assert(Math.abs(distance(1) - 5) < 1e-8);
  const a = Math.log(distance(.3) / distance(.4)), b = Math.log(distance(.5) / distance(.6));
  assert(Math.abs(a - b) < 1e-8);
  assert.equal(comfortableProgress(.4, 10, 20), stagedProgress(.4));
});

test("travel preferences are optional, default comfort, and never touch archive keys", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage"), store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) } });
  try {
    assert.equal(readTravelMode(), "comfort"); saveTravelMode("fast"); assert.equal(readTravelMode(), "fast");
    assert.deepEqual([...store.keys()], [TRAVEL_KEY]); store.set(TRAVEL_KEY, "invalid"); assert.equal(readTravelMode(), "comfort");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("blocked"); } });
    assert.equal(readTravelMode(), "comfort"); assert.doesNotThrow(() => saveTravelMode("comfort"));
  } finally { if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor); else Reflect.deleteProperty(globalThis, "localStorage"); }
});

test("environment bodies and debris are deterministic, tier bounded and separate from saved records", () => {
  const data = createSeed(), original = JSON.stringify(data), source = stellarSource(data.planets);
  assert.deepEqual(environmentBodies("growth", data.planets, source), []);
  const emptySource = stellarSource([]), bodies = environmentBodies("growth", [], emptySource);
  assert.equal(bodies.length, 3); assert.deepEqual(bodies, environmentBodies("growth", [], emptySource));
  assert(bodies.every(b => !('id' in b) && !('name' in b)));
  const safe = safeEnvironmentCamera(bodies[0].position, bodies);
  assert(Math.hypot(...safe.map((n, i) => n - bodies[0].position[i])) > bodies[0].appearance.size * 2.5);
  for (const tier of ["low", "medium", "high"] as const) {
    const pieces = systemDebris("unclassified", data.planets, source, tier);
    assert(pieces.length <= { low: 180, medium: 520, high: 900 }[tier]);
    assert.deepEqual(pieces, systemDebris("unclassified", data.planets, source, tier));
    for (const piece of pieces) for (const planet of data.planets) assert(Math.hypot(...piece.position.map((n, i) => n - planet.position[i])) >= planet.appearance.size * 3);
  }
  assert.equal(JSON.stringify(data), original);
});
