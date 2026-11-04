import test from "node:test";
import assert from "node:assert/strict";
import { MeshStandardMaterial } from "three";
import { shouldApplyPineLodFade } from "../src/components/forest-lab/pine-lod-fade.ts";

test("rigid tree wood stays crisp during canopy LOD fades regardless of source naming case", () => {
  for (const name of ["pine_trunk", "Pine_Trunk_LOD1", "FIR_BARK", "dead-branches", "Stem Material"]) {
    const material = new MeshStandardMaterial();
    material.name = name;
    assert.equal(shouldApplyPineLodFade(material), false, name);
    material.dispose();
  }
});

test("transparent source atlases retain their LOD fade", () => {
  const material = new MeshStandardMaterial({ transparent: true });
  material.name = "pine_trunk_atlas";
  assert.equal(shouldApplyPineLodFade(material), true);
  material.dispose();
});
