import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createSeed } from "../../src/data/seed";
import type { LabMetrics } from "../../src/components/guide-lab/asset-contract";

// Original 3-keyframe head-turn VRMA fixture, generated in memory (no third-party motion).
function testVrma() {
  const values = new Float32Array([0, 1, 2, 0, 0, 0, 1, 0, Math.sin(0.2), 0, Math.cos(0.2), 0, 0, 0, 1]);
  const json = {
    asset: { version: "2.0", generator: "UNIVERSE OF ME isolated test" },
    extensionsUsed: ["VRMC_vrm_animation"], extensions: { VRMC_vrm_animation: { specVersion: "1.0", humanoid: { humanBones: { hips: { node: 0 }, head: { node: 1 } } } } },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "hips", translation: [0, 1, 0], children: [1] }, { name: "head", translation: [0, 0.5, 0] }],
    buffers: [{ byteLength: values.byteLength }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 12 }, { buffer: 0, byteOffset: 12, byteLength: 48 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "SCALAR", min: [0], max: [2] }, { bufferView: 1, componentType: 5126, count: 3, type: "VEC4" }],
    animations: [{ name: "original-head-turn-test", samplers: [{ input: 0, output: 1, interpolation: "LINEAR" }], channels: [{ sampler: 0, target: { node: 1, path: "rotation" } }] }],
  };
  const text = Buffer.from(JSON.stringify(json)); const padded = Math.ceil(text.length / 4) * 4;
  const result = Buffer.alloc(28 + padded + values.byteLength, 32);
  result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(padded, 12); result.writeUInt32LE(0x4e4f534a, 16); text.copy(result, 20);
  result.writeUInt32LE(values.byteLength, 20 + padded); result.writeUInt32LE(0x004e4942, 24 + padded);
  Buffer.from(values.buffer).copy(result, 28 + padded); return result;
}

const KEY = "universe-of-me:data:v1";
async function prepare(page: Page) {
  const seed = createSeed(); const now = "2026-01-01T00:00:00.000Z";
  seed.planets = [{ ...seed.planets[0], id: "lab-test-planet", name: "实验验收星球（非人生记录）", isDemo: false }];
  seed.memories = [{ id: "lab-test-memory", planetId: "lab-test-planet", title: "动作验收样本（隔离测试数据）", body: "这段文字仅存在于自动化测试的隔离浏览器，用于验证真实档案 ID → 三维记忆球 → 手骨锚点。不是用户人生经历。", occurredOn: "2026-01-02", kind: "text", mediaIds: [], createdAt: now, updatedAt: now }];
  const raw = JSON.stringify(seed);
  await page.addInitScript(({ key, raw }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
    const state = globalThis as typeof globalThis & { labWrites: string[] };
    state.labWrites = [];
    for (const method of ["setItem", "removeItem", "clear"] as const) {
      Storage.prototype[method] = function () { state.labWrites.push(method); throw new Error("Lab attempted storage write"); };
    }
    IDBFactory.prototype.open = function () { state.labWrites.push("indexedDB.open"); throw new Error("Lab opened media DB"); };
    IDBFactory.prototype.deleteDatabase = function () { state.labWrites.push("indexedDB.delete"); throw new Error("Lab deleted DB"); };
  }, { key: KEY, raw });
  await page.goto("/guide-lab");
  await expect(page.locator("main")).toHaveAttribute("data-model-status", "ready", { timeout: 30_000 });
  await expect(page.locator(".global-guide")).toHaveCount(0);
  return raw;
}
async function metrics(page: Page): Promise<LabMetrics> {
  await expect(page.getByTestId("lab-metrics")).toHaveAttribute("data-values", /fps/);
  return JSON.parse((await page.getByTestId("lab-metrics").getAttribute("data-values"))!);
}
const state = (page: Page) => page.getByTestId("actor-state");

test("VRM rig: A/B actual camera travel, C actual palm-space orb, cancel, reload and read-only archive", async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1050 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const raw = await prepare(page);
  await page.getByLabel("当前浏览器的星球").selectOption("lab-test-planet");
  await expect(state(page)).toHaveText("idle");
  await page.waitForTimeout(2000);
  const initial = await metrics(page);
  expect(initial.hand[1]).toBeLessThan(1.05); // No persistent T-pose from animation/IK caching.
  await expect.poll(async () => (await metrics(page)).blinkPeak, { timeout: 8000 }).toBeGreaterThan(0.7);
  const breathing = await metrics(page);
  expect(Math.abs(breathing.chestPitch - initial.chestPitch)).toBeGreaterThan(0.0001);
  await page.screenshot({ path: "test-results/vrm-01-idle.png", fullPage: true });
  await page.getByRole("button", { name: "A → B · 注视、指引、飞行、欢迎" }).click();
  await expect(state(page)).toHaveText("attention");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/vrm-02-attention.png", fullPage: true });
  await expect(state(page)).toHaveText("pointing", { timeout: 10_000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: "test-results/vrm-03-pointing.png", fullPage: true });
  const pointing = await metrics(page);
  expect(pointing.bodyYaw).toBeGreaterThan(0.5);
  await expect(state(page)).toHaveText("guiding", { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "A → B · 注视、指引、飞行、欢迎" })).toBeDisabled();
  await page.screenshot({ path: "test-results/vrm-04-flight.png", fullPage: true });
  await expect(state(page)).toHaveText("arrived", { timeout: 12_000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: "test-results/vrm-05-arrived.png", fullPage: true });
  const arrival = await metrics(page);
  expect(Math.hypot(...arrival.camera.map((n, i) => n - initial.camera[i]))).toBeGreaterThan(0.6);
  await expect(state(page)).toHaveText("idle", { timeout: 10_000 });
  await expect.poll(async () => (await metrics(page)).hand[1], { timeout: 5000 }).toBeLessThan(1.05);
  await page.getByLabel("查找当前星球的记忆").fill("动作验收");
  await page.getByLabel(/找到 1 条/).selectOption("lab-test-memory");
  const summon = page.getByRole("button", { name: "C · 注视 → 伸手 → 掌心展示" });
  await summon.click();
  await expect(state(page)).toHaveText("summoning", { timeout: 10_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "test-results/vrm-06-summoning.png", fullPage: true });
  await expect(state(page)).toHaveText("presenting", { timeout: 15_000 });
  await expect(page.getByRole("region", { name: "掌心记忆内容" })).toContainText("不是用户人生经历");
  await page.waitForTimeout(1200);
  const palm = await metrics(page);
  expect(palm.palmError).toBeLessThan(0.01);
  expect(Math.hypot(...palm.orb.map((n, i) => n - palm.hand[i]))).toBeLessThan(0.2);
  expect(Math.hypot(...palm.hand.map((n, i) => n - initial.hand[i]))).toBeGreaterThan(0.15);
  await page.screenshot({ path: "test-results/vrm-07-presenting.png", fullPage: true });
  const environment = await page.evaluate(() => {
    const gl = document.querySelector("canvas")!.getContext("webgl2")!;
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return { userAgent: navigator.userAgent, cores: navigator.hardwareConcurrency, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  });
  const report = JSON.stringify({ fixture: "isolated synthetic archive, not user memories", environment, viewport: page.viewportSize(), initial, breathing, pointing, arrival, palm }, null, 2);
  await writeFile("test-results/vrm-measurements.json", report);
  await testInfo.attach("vrm-performance-and-coordinates", { body: report, contentType: "application/json" });
  await page.keyboard.press("Escape");
  await expect(state(page)).toHaveText("idle");
  await expect(page.getByRole("region", { name: "掌心记忆内容" })).toHaveCount(0);
  await page.getByRole("button", { name: "A → B · 注视、指引、飞行、欢迎" }).click();
  await expect(state(page)).toHaveText("pointing", { timeout: 10_000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(3500);
  await expect(state(page)).toHaveText("idle");
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe(raw);
  expect(await page.evaluate(() => (globalThis as typeof globalThis & { labWrites: string[] }).labWrites)).toEqual([]);
  await page.reload();
  await expect(page.locator("main")).toHaveAttribute("data-model-status", "ready", { timeout: 30_000 });
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe(raw);
  await page.getByText("资产接口与诊断", { exact: true }).click();
  await page.getByLabel("导入 VRMA 动作", { exact: true }).setInputFiles({ name: "original-test.vrma", mimeType: "application/octet-stream", buffer: testVrma() });
  await expect(page.getByText(/本地 VRMA 正在通过/)).toBeVisible();
  await page.waitForTimeout(1200);
  expect(Math.abs((await metrics(page)).headYaw)).toBeGreaterThan(0.02);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "注视与转身" })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("lab loader failures, local model replacement and mobile reduced-motion actions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepare(page);
  await page.getByText("资产接口与诊断", { exact: true }).click();
  await page.getByLabel("导入本地 VRM", { exact: true }).setInputFiles({ name: "invalid.vrm", mimeType: "application/octet-stream", buffer: Buffer.from("invalid") });
  await expect(page.locator("main")).toHaveAttribute("data-model-status", "error");
  await expect(page.locator(".lab-loading[role=alert]")).toContainText("GLB/VRM/VRMA");
  await page.getByRole("button", { name: "恢复官方技术样本" }).click();
  await expect(page.locator("main")).toHaveAttribute("data-model-status", "ready", { timeout: 30_000 });
  const inspect = await page.getByRole("button", { name: "注视与转身" }).boundingBox();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: inspect!.x + 20, y: inspect!.y + 20 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(state(page)).toHaveText("idle", { timeout: 6000 });
  await page.getByRole("button", { name: "欢迎动作", exact: true }).click();
  await expect(state(page)).toHaveText("arrived");
  await expect(state(page)).toHaveText("idle", { timeout: 6000 });
  await expect.poll(async () => (await metrics(page)).hand[1], { timeout: 5000 }).toBeLessThan(1.05);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => (globalThis as typeof globalThis & { labWrites: string[] }).labWrites)).toEqual([]);
  await page.screenshot({ path: "test-results/vrm-08-mobile.png", fullPage: true });
});
