import assert from "node:assert/strict";
import test from "node:test";
import { isDate, matchesYear, nextPosition, validatePlanet } from "../src/domain/planet.ts";
import { createSeed } from "../src/data/seed.ts";
import { DATA_KEY, RECOVERY_KEY, LocalUniverseRepository, parseUniverse, type StoragePort } from "../src/data/local-repository.ts";

class InMemoryStorage implements StoragePort {
  values = new Map<string, string>();
  failWrites = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failWrites) throw new Error("Quota exceeded"); this.values.set(key, value); }
}

test("calendar validation rejects normalized impossible days and accepts leap years", () => {
  assert.equal(isDate("2024-02-29"), true);
  assert.equal(isDate("2025-02-29"), false);
  assert.equal(isDate("2020-04-31"), false);
  assert.equal(isDate("yesterday"), false);
});

test("planet ranges allow unnamed drafts but reject inverted or ambiguous intervals", () => {
  const planet = createSeed().planets[0];
  assert.equal(validatePlanet(planet), null);
  assert.match(validatePlanet({ ...planet, endDate: "2020-01-01" })!, /开始日期/);
  assert.match(validatePlanet({ ...planet, startDate: "2022-01-01", endDate: "2020-01-01" })!, /不能早于/);
  assert.match(validatePlanet({ ...planet, ongoing: true, startDate: "2020-01-01", endDate: "2022-01-01" })!, /持续中/);
});

test("year search includes entire spanning stages and handles undated drafts", () => {
  const planet = { ...createSeed().planets[0], startDate: "2010-06-01", endDate: "2015-02-01" };
  assert.equal(matchesYear(planet, 2012), true);
  assert.equal(matchesYear(planet, 2010), true);
  assert.equal(matchesYear(planet, 2015), true);
  assert.equal(matchesYear(planet, 2016), false);
  assert.equal(matchesYear({ ...planet, endDate: null, ongoing: true }, new Date().getFullYear()), true);
  assert.equal(matchesYear({ ...planet, startDate: null }, 2012), false);
});

test("seed never invents named personal stages or memories", () => {
  const seed = createSeed();
  assert.equal(seed.planets.length, 5);
  assert(seed.planets.every(p => p.name === null && p.startDate === null && p.isDemo));
  assert.equal(seed.memories.length, 0);
  assert.equal(parseUniverse(JSON.stringify(seed)).planets.length, 5);
});

test("local saves persist records, increment revisions and retain previous snapshot", () => {
  const storage = new InMemoryStorage();
  const repository = new LocalUniverseRepository(storage);
  const first = repository.save(repository.load(), 0);
  const edited = { ...first, planets: first.planets.map((p, i) => i === 0 ? { ...p, name: "我自己命名的时光", isDemo: false } : p) };
  const second = repository.save(edited, first.revision);
  assert.equal(second.revision, 2);
  assert.equal(repository.load().planets[0].name, "我自己命名的时光");
  assert.equal(parseUniverse(storage.getItem(RECOVERY_KEY)!).revision, 1);
});

test("stale tabs cannot overwrite newer memories", () => {
  const storage = new InMemoryStorage();
  const repository = new LocalUniverseRepository(storage);
  const old = repository.save(repository.load(), 0);
  repository.save(old, old.revision);
  const before = storage.getItem(DATA_KEY);
  assert.throws(() => repository.save(old, old.revision), /另一标签页/);
  assert.equal(storage.getItem(DATA_KEY), before);
});

test("a tab cannot resurrect a universe deleted in another tab", () => {
  const storage = new InMemoryStorage();
  const repository = new LocalUniverseRepository(storage);
  const first = repository.save(repository.load(), 0);
  storage.values.delete(DATA_KEY);
  assert.throws(() => repository.save(first, first.revision), /移除了宇宙/);
  assert.equal(storage.getItem(DATA_KEY), null);
});

test("corrupt or future data is preserved and never replaced by demo data", () => {
  for (const raw of ["{broken", JSON.stringify({ ...createSeed(), schemaVersion: 2 })]) {
    const storage = new InMemoryStorage();
    storage.setItem(DATA_KEY, raw);
    assert.throws(() => new LocalUniverseRepository(storage).load());
    assert.equal(storage.getItem(DATA_KEY), raw);
  }
});

test("quota failures report an actionable error and preserve the existing archive", () => {
  const storage = new InMemoryStorage();
  const repository = new LocalUniverseRepository(storage);
  const first = repository.save(repository.load(), 0);
  const before = storage.getItem(DATA_KEY);
  storage.failWrites = true;
  assert.throws(() => repository.save(first, first.revision), /本地保存失败/);
  assert.equal(storage.getItem(DATA_KEY), before);
});

test("archive validation rejects dangling memories, duplicate IDs and invalid appearance", () => {
  const seed = createSeed();
  const now = new Date().toISOString();
  assert.throws(() => parseUniverse(JSON.stringify({ ...seed, memories: [{ id: "m1", planetId: "missing", kind: "text", title: "title", body: "body", occurredOn: "2024-01-01", createdAt: now, updatedAt: now }] })), /记忆/);
  assert.throws(() => parseUniverse(JSON.stringify({ ...seed, planets: [...seed.planets, seed.planets[0]] })), /星球/);
  seed.planets[0].appearance.size = -2;
  assert.throws(() => parseUniverse(JSON.stringify(seed)), /星球/);
});

test("new worlds receive deterministic, separated coordinates", () => {
  const seed = createSeed();
  const position = nextPosition(seed.planets);
  assert.deepEqual(position, nextPosition(seed.planets));
  assert(!seed.planets.some(p => JSON.stringify(p.position) === JSON.stringify(position)));
  assert(position.every(Number.isFinite));
});
