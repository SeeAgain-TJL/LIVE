import { expect, test } from "@playwright/test";
import { createSeed } from "../../src/data/seed";

test("five exterior types survive quality switching without GPU resource growth or archive writes", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", msg => { if (msg.type() === "error" && /shader|webgl|gl_invalid/i.test(msg.text())) errors.push(msg.text()); });
  await page.goto("/");
  const fixture = createSeed();
  fixture.planets = fixture.planets.map(p => ({ ...p, isDemo: false, description: "外观验收示例，仅存在隔离测试浏览器。" }));
  const raw = JSON.stringify(fixture);
  await page.evaluate(raw => localStorage.setItem("universe-of-me:data:v1", raw), raw);
  await page.goto("/galaxy/unclassified");
  await expect(page.locator(".planet-label")).toHaveCount(5);
  const metrics = async () => JSON.parse(await page.locator("canvas").first().getAttribute("data-render-metrics") ?? "{}");
  const samples: { triangles: number; textures: number; geometries: number }[] = [];
  for (const tier of ["low", "medium", "high", "low", "high"]) {
    await page.getByRole("button", { name: "渲染与数据设置", exact: true }).click();
    await page.getByRole("combobox", { name: "渲染质量", exact: true }).selectOption(tier);
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await metrics()).tier).toBe(tier);
    await page.waitForTimeout(1200); // Allow the renderer to upload/dispose after React commits.
    samples.push(await metrics());
    expect(await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"))).toBe(raw);
  }
  expect(samples[0].triangles).toBeLessThan(samples[1].triangles);
  expect(samples[1].triangles).toBeLessThan(samples[2].triangles);
  await testInfo.attach("exterior-resource-samples", { body: JSON.stringify(samples, null, 2), contentType: "application/json" });
  for (const [a, b] of [[0, 3], [2, 4]]) {
    expect(samples[a].textures).toBe(samples[b].textures);
    expect(samples[a].geometries).toBe(samples[b].geometries);
  }
  expect(errors).toEqual([]);
});
