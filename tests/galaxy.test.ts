import assert from "node:assert/strict";
import test from "node:test";
import { createSeed } from "../src/data/seed.ts";
import { DATA_KEY, GALAXY_MIGRATION_BACKUP_KEY, LocalUniverseRepository, type StoragePort } from "../src/data/local-repository.ts";
import { DEFAULT_GALAXY, galaxyPosition, travelUrl } from "../src/domain/galaxy.ts";

class Storage implements StoragePort {
  values = new Map<string, string>();
  failKey = "";
  writes = 0;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (key === this.failKey) throw new Error("quota");
    this.writes++; this.values.set(key, value);
  }
}

function oldArchive(version: 1 | 2, missingMembership = false) {
  const seed = createSeed();
  const now = "2026-10-01T00:00:00.000Z";
  const archive = {
    ...seed, schemaVersion: version, revision: 14,
    galaxies: seed.galaxies.filter(g => g.id !== DEFAULT_GALAXY.id),
    planets: seed.planets.map((p, i) => ({ ...p, galaxyId: i === 1 ? "growth" : null, name: i === 0 ? "用户原有名称" : p.name })),
    memories: [{ id: "memory-kept", planetId: seed.planets[0].id, kind: version === 2 ? "mixed" : "text", title: "原始记录", body: "原文不能改变\n第二行", occurredOn: "2020-02-29", createdAt: now, updatedAt: now, ...(version === 2 ? { mediaIds: ["media-kept"] } : {}) }],
    ...(version === 2 ? { media: [{ id: "media-kept", memoryId: "memory-kept", kind: "image", name: "original.png", mimeType: "image/png", size: 12, createdAt: now }] } : {}),
  };
  if (version === 1) delete (archive as { media?: unknown }).media;
  if (missingMembership) delete (archive.planets[0] as { galaxyId?: unknown }).galaxyId;
  return archive;
}

test("v1/v2 galaxy migration preserves exact backup, stages, coordinates, text, dates and media references", () => {
  for (const version of [1, 2] as const) for (const missing of [false, true]) {
    const old = oldArchive(version, missing);
    const raw = JSON.stringify(old, null, 2);
    const storage = new Storage(); storage.setItem(DATA_KEY, raw);
    const repository = new LocalUniverseRepository(storage);
    const migrated = repository.load();
    assert.equal(storage.getItem(GALAXY_MIGRATION_BACKUP_KEY), raw);
    assert.equal(migrated.schemaVersion, 2); assert.equal(migrated.revision, 14);
    assert.equal(migrated.planets[0].galaxyId, DEFAULT_GALAXY.id);
    assert.equal(migrated.planets[1].galaxyId, "growth");
    assert.equal(migrated.galaxies.filter(g => g.id === DEFAULT_GALAXY.id).length, 1);
    for (let i = 0; i < old.planets.length; i++) {
      assert.deepEqual(migrated.planets[i], { ...old.planets[i], galaxyId: i === 1 ? "growth" : DEFAULT_GALAXY.id });
    }
    assert.deepEqual(migrated.memories[0], { ...old.memories[0], mediaIds: version === 2 ? ["media-kept"] : [] });
    assert.deepEqual(migrated.media, version === 2 ? old.media : []);
    const restoredStorage = new Storage();
    restoredStorage.setItem(DATA_KEY, storage.getItem(GALAXY_MIGRATION_BACKUP_KEY)!);
    assert.deepEqual(new LocalUniverseRepository(restoredStorage).load(), migrated, "backup must restore the same usable archive");
    const writes = storage.writes;
    assert.deepEqual(repository.load(), migrated);
    assert.equal(storage.writes, writes, "second load must not write again");
    repository.save({ ...migrated, planets: migrated.planets.map((p, i) => i === 0 ? { ...p, name: "迁移后编辑" } : p) }, migrated.revision);
    assert.equal(storage.getItem(GALAXY_MIGRATION_BACKUP_KEY), raw);
    assert.equal(repository.load().planets[0].name, "迁移后编辑");
  }
});

test("failed backup or migration writes preserve original data and allow later recovery", () => {
  for (const failKey of [GALAXY_MIGRATION_BACKUP_KEY, DATA_KEY]) {
    const storage = new Storage();
    const raw = JSON.stringify(oldArchive(2)); storage.setItem(DATA_KEY, raw); storage.failKey = failKey;
    assert.throws(() => new LocalUniverseRepository(storage).load(), /迁移未完成/);
    assert.equal(storage.getItem(DATA_KEY), raw);
    if (failKey === DATA_KEY) assert.equal(storage.getItem(GALAXY_MIGRATION_BACKUP_KEY), raw);
    storage.failKey = "";
    assert.equal(new LocalUniverseRepository(storage).load().memories[0].body, "原文不能改变\n第二行");
    assert.equal(storage.getItem(GALAXY_MIGRATION_BACKUP_KEY), raw);
  }
});

test("invalid/future archives and dangling explicit membership are never rewritten", () => {
  for (const raw of ["{broken", JSON.stringify({ ...oldArchive(2), schemaVersion: 99 }), JSON.stringify({ ...oldArchive(2), planets: [{ ...oldArchive(2).planets[0], galaxyId: "nonexistent" }] })]) {
    const storage = new Storage(); storage.setItem(DATA_KEY, raw);
    assert.throws(() => new LocalUniverseRepository(storage).load());
    assert.equal(storage.getItem(DATA_KEY), raw);
    assert.equal(storage.getItem(GALAXY_MIGRATION_BACKUP_KEY), null);
  }
});

test("galaxy positions separate clusters and travel parameters encode destination IDs", () => {
  for (let i = 0; i < 20; i++) {
    const position = galaxyPosition(i);
    assert(position.every(Number.isFinite));
    for (let j = 0; j < i; j++) assert(Math.hypot(...position.map((n, axis) => n - galaxyPosition(j)[axis])) > 9);
  }
  const url = new URL(travelUrl({ kind: "planet", id: "name / &星球" }, 7), "http://localhost");
  assert.equal(url.searchParams.get("travelPlanet"), "name / &星球");
  assert.equal(url.searchParams.get("trip"), "7");
});
