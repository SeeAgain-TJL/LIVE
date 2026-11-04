import { expect, test, type Page } from "@playwright/test";
import { createSeed } from "../../src/data/seed";

async function settled(page: Page, tier: string) {
  await expect.poll(async () => page.locator("canvas").first().evaluate(canvas => {
    const metrics = JSON.parse(canvas.dataset.renderMetrics ?? "{}");
    return { tier: metrics.tier, ready: canvas.dataset.exteriorReady };
  }), { timeout: 60_000 }).toEqual({ tier, ready: "true" });
  // Renderer diagnostics publish once/second; include deferred R3F disposals.
  await page.waitForTimeout(1200);
}

test("five exterior types survive quality switching without GPU resource growth or archive writes", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
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
  const samples: { tier: string; triangles: number; textures: number; geometries: number; programs: number; materials: number; cacheBytes: number; hits: number }[] = [];
  for (const tier of ["low", "medium", "high", "low", "medium", "high", "low", "medium", "high"]) {
    await page.getByRole("button", { name: "渲染与数据设置", exact: true }).click();
    await page.getByRole("combobox", { name: "渲染质量", exact: true }).selectOption(tier);
    await page.keyboard.press("Escape");
    await settled(page, tier);
    const exterior = JSON.parse(await page.locator("canvas").first().getAttribute("data-exterior-textures") ?? "{}");
    samples.push({ ...await metrics(), ...exterior });
    expect(exterior.cacheBytes).toBeLessThanOrEqual(32 * 1024 * 1024);
    expect(exterior.fallback).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"))).toBe(raw);
  }
  expect(samples[0].triangles).toBeLessThan(samples[1].triangles);
  expect(samples[1].triangles).toBeLessThan(samples[2].triangles);
  await testInfo.attach("exterior-resource-samples", { body: JSON.stringify(samples, null, 2), contentType: "application/json" });
  for (const [a, b] of [[0, 3], [1, 4], [2, 5], [0, 6], [1, 7], [2, 8]]) {
    expect(samples[a].textures).toBe(samples[b].textures);
    expect(samples[a].geometries).toBe(samples[b].geometries);
    expect(samples[a].materials).toBe(samples[b].materials);
    expect(samples[a].programs).toBe(samples[b].programs);
  }
  expect(samples.at(-1)!.hits).toBeGreaterThanOrEqual(30);
  const icon = await page.request.get("/favicon.ico");
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"]).toContain("image/");
  expect(errors).toEqual([]);
});

test("blocked Worker uses sliced baking and rapid switches discard stale requests", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  const fixture = createSeed();
  fixture.planets = fixture.planets.map(p => ({ ...p, isDemo: false }));
  const raw = JSON.stringify(fixture);
  await page.addInitScript(raw => {
    localStorage.setItem("universe-of-me:data:v1", raw);
    localStorage.setItem("universe-of-me:cosmic-quality:v1", "high");
    window.Worker = class { constructor() { throw new Error("Worker blocked in fallback test"); } } as unknown as typeof Worker;
  }, raw);
  await page.goto("/galaxy/unclassified");
  await expect(page.locator(".planet-label")).toHaveCount(5);
  for (const tier of ["low", "medium", "high", "medium", "high"]) {
    await page.evaluate(tier => {
      localStorage.setItem("universe-of-me:cosmic-quality:v1", tier);
      window.dispatchEvent(new Event("cosmic-quality"));
    }, tier);
    await page.waitForTimeout(80);
  }
  await settled(page, "high");
  const stats = JSON.parse(await page.locator("canvas").first().getAttribute("data-exterior-textures") ?? "{}");
  expect(stats.fallback).toBe(true);
  expect(stats.fallbackBakeMs).toBeGreaterThan(0);
  expect(stats.cancelled).toBeGreaterThan(0);
  expect(stats.pending).toBe(0);
  expect(stats.total).toBe(5);
  expect(await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"))).toBe(raw);
  await testInfo.attach("sliced-worker-fallback", { body: JSON.stringify(stats, null, 2), contentType: "application/json" });
  expect(errors).toEqual([]);
});
