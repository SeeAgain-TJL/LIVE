import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { decodeLibraryPack } from "../src/components/three/visual-library-pack.ts";
import { deferredVisuals, presetAppearance, visualPresetFor, visualPresets } from "../src/components/three/visual-library.ts";

const base = new URL("../public/planet-visual-assets/v1/", import.meta.url);
const credits = readFileSync(new URL("credits.json", base), "utf8");
const manifest = JSON.parse(credits);

test("explicit preset seeds preserve the existing appearance shape and type", () => {
  assert.equal(visualPresets.filter(p => !p.special).length, 10);
  assert.equal(visualPresets.length + deferredVisuals.length, 16);
  assert.equal(new Set(visualPresets.map(p => p.seed)).size, visualPresets.length);
  for (const p of visualPresets) {
    const appearance = presetAppearance(p, 2.1);
    assert.deepEqual(Object.keys(appearance).sort(), ["color", "rings", "seed", "size", "type"]);
    assert.equal(appearance.size, 2.1);
    assert.equal(visualPresetFor(appearance), p);
    assert.equal(visualPresetFor({ ...appearance, type: p.type === "ice" ? "ocean" : "ice" }), undefined);
    assert.equal(visualPresetFor({ ...appearance, seed: 512 }), undefined);
  }
});

test("all 36 licensed offline packs decode into the current two texture channels with closed seams", () => {
  assert.equal(credits, readFileSync(new URL("../docs/planet-visual-library-v1/assets.json", import.meta.url), "utf8"));
  for (const preset of visualPresets) {
    const asset = manifest.assets[preset.id];
    assert.ok(asset.sources.length);
    for (const source of asset.sources) assert.ok(manifest.sources[source].license);
    for (const tier of ["high", "medium", "low"] as const) {
      const { file, bytes, sha256, width, height } = asset.tiers[tier];
      const packed = readFileSync(new URL(file, base));
      assert.equal(packed.length, bytes);
      assert.equal(createHash("sha256").update(packed).digest("hex"), sha256);
      const raw = gunzipSync(packed);
      const decoder = decodeLibraryPack(raw, tier);
      assert.equal(decoder.maps.width, width);
      assert.equal(decoder.maps.height, height);
      assert.equal(decoder.done, false);
      while (!decoder.done) decoder.advance(11);
      for (const map of [decoder.maps.albedo, decoder.maps.surface]) {
        assert.equal(map.length, width * height * 4);
        for (let y = 0; y < height; y += 17) {
          const first = y * width * 4, last = first + (width - 1) * 4;
          assert.deepEqual(map.subarray(first, first + 4), map.subarray(last, last + 4), file);
        }
      }
      if (preset.type === "ocean") {
        assert.ok(decoder.maps.surface.some((value, i) => i % 4 === 2 && value > 100), file);
      }
    }
  }
  assert.throws(() => decodeLibraryPack(new Uint8Array(8), "low"), /Invalid exterior asset pack/);
});
