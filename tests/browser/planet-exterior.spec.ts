import { expect, test, type Page } from "@playwright/test";
import { createSeed } from "../../src/data/seed";
import type { Vec3 } from "../../src/domain/types";

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
  fixture.planets = fixture.planets.map((p, i) => ({ ...p, isDemo: false, description: "外观验收示例，仅存在隔离测试浏览器。",
    position: [i < 3 ? (i - 1) * 3.7 : (i - 3.5) * 3.7, i < 3 ? -1.6 : 2, 0] as Vec3, appearance: { ...p.appearance, size: 1.2 } }));
  const raw = JSON.stringify(fixture);
  await page.evaluate(raw => {
    localStorage.setItem("universe-of-me:data:v1", raw);
    localStorage.setItem("universe-of-me:camera:v1:galaxy:unclassified", JSON.stringify({ position: [0, 0, 10], target: [0, 0, 0] }));
  }, raw);
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

test("camera responds before textures and releases offscreen maps while prioritizing a real flight", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const fixture = createSeed();
  const seeds = fixture.planets;
  fixture.planets = Array.from({ length: 50 }, (_, i) => ({
    ...seeds[i % 5], id: `lod-test-${i}`, name: `外观测试星球 ${i + 1}`, isDemo: false,
    position: (i === 0 ? [0, 0, 0] : i === 1 ? [210, 0, 0] : [-240 - i * 4, i % 4 * 4, 0]) as Vec3,
    appearance: { ...seeds[i % 5].appearance, size: .8 },
  }));
  const raw = JSON.stringify(fixture);
  await page.addInitScript(raw => {
    localStorage.setItem("universe-of-me:data:v1", raw);
    localStorage.setItem("universe-of-me:cosmic-quality:v1", "high");
    localStorage.setItem("universe-of-me:camera:v1:galaxy:unclassified", JSON.stringify({ position: [0, 0, 42], target: [0, 0, 0] }));
    const NativeWorker = window.Worker;
    let paused = true;
    window.addEventListener("resume-texture-test", () => { paused = false; }, { once: true });
    window.Worker = class extends NativeWorker {
      override postMessage(message: unknown) {
        if (paused) window.addEventListener("resume-texture-test", () => super.postMessage(message), { once: true });
        else super.postMessage(message);
      }
    };
  }, raw);
  await page.goto("/galaxy/unclassified");
  const canvas = page.locator(".universe-canvas canvas");
  await expect(canvas).toHaveAttribute("data-exterior-interactive", "true");
  const label = page.locator(".planet-label").first();
  const y = async () => (await label.boundingBox())!.y;
  const box = (await canvas.boundingBox())!, initialY = await y();
  await page.mouse.move(box.x + box.width * .72, box.y + box.height * .7);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -280);
  await expect.poll(async () => Math.abs(await y() - initialY)).toBeGreaterThan(1);
  await expect(canvas).not.toHaveAttribute("data-exterior-ready", "true");
  await page.evaluate(() => window.dispatchEvent(new Event("resume-texture-test")));
  await settled(page, "high");
  const stats = async () => JSON.parse((await canvas.getAttribute("data-exterior-textures"))!);
  const start = await stats();
  expect(start.targets).toBe(1);
  expect(start.total).toBe(50);
  expect(start.resident.high).toBe(0);
  await page.getByRole("button", { name: /^外观测试星球 2 / }).click();
  await page.getByRole("button", { name: "靠近星球", exact: true }).click();
  await expect.poll(async () => {
    const s = await stats();
    return [s.targets, s.resident.high, s.resident.medium + s.resident.low];
  }, { timeout: 30_000 }).toEqual([1, 1, 0]);
  const end = await stats();
  expect(end.mapBytes).toBeLessThanOrEqual(end.mapBudgetBytes);
  expect(await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"))).toBe(raw);
  await testInfo.attach("lod-eviction", { body: JSON.stringify({ start, end }, null, 2), contentType: "application/json" });
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
