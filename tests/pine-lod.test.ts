import test from "node:test";
import assert from "node:assert/strict";
import { MeshStandardMaterial, type WebGLRenderer, type WebGLProgramParametersWithUniforms } from "three";
import { applyPineLodFade, shouldApplyPineLodFade } from "../src/components/forest-lab/pine-lod-fade.ts";

test("rigid tree wood stays crisp during canopy LOD fades regardless of source naming case", () => {
  for (const name of ["pine_trunk", "Pine_Trunk_LOD1", "FIR_BARK", "dead-branches", "Stem Material"]) {
    const material = new MeshStandardMaterial();
    material.name = name;
    assert.equal(shouldApplyPineLodFade(material), false, name);
    material.dispose();
  }
});

test("LOD weight never multiplies bark RGB, while vertex colors and prior shader hooks survive", () => {
  for (const [name, transparent] of [["pine_bark", false], ["fir_twig", true]] as const) {
    const material = new MeshStandardMaterial({ transparent }); material.name = name;
    material.onBeforeCompile = shader => { shader.vertexShader += "\n// canopy field retained"; };
    applyPineLodFade(material);
    const shader = { vertexShader: "#include <common>\n#include <color_vertex>", fragmentShader: "#include <common>\n#include <alphatest_fragment>", uniforms: {} } as WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as WebGLRenderer);
    assert.ok(!shader.vertexShader.includes("vColor.xyz *= instanceColor.xyz;"));
    assert.ok(shader.vertexShader.includes("vColor *= color;"));
    assert.ok(shader.vertexShader.includes("canopy field retained"));
    assert.equal(shader.fragmentShader.includes("diffuseColor.a *= pineLodWeight"), transparent);
    assert.equal(shader.vertexShader.includes("pineLodWeight=instanceColor.r"), transparent);
    material.dispose();
  }
});

test("transparent source atlases retain their LOD fade", () => {
  const material = new MeshStandardMaterial({ transparent: true });
  material.name = "pine_trunk_atlas";
  assert.equal(shouldApplyPineLodFade(material), true);
  material.dispose();
});
