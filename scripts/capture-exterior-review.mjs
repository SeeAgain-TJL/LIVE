import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { createSeed } from "../src/data/seed.ts";

// Production build, installed Google Chrome, disposable profile and explicit visual fixtures.
const phase = process.argv[2] ?? "after";
if (!["before", "after"].includes(phase)) throw new Error("Expected before or after");
const baseURL = process.env.EXTERIOR_REVIEW_URL ?? "http://127.0.0.1:3320";
const output = path.resolve(`artifacts-local/exterior-batch-1/${phase}`);
await fs.mkdir(output, { recursive: true });
await fs.mkdir("docs/exterior-batch-1", { recursive: true });
const fixture = createSeed();
fixture.planets = fixture.planets.map(p => ({ ...p, isDemo: false, name: `外观验收示例 · ${p.appearance.type}`, description: "仅为隔离 Chrome 的外观测试，不代表用户经历。" }));
const raw = JSON.stringify(fixture);
const overview = { position: [0, 12, 42], target: [-2, 0, -3] };
const report = { phase, recordedAt: new Date().toISOString(), baseURL, browserMode: "installed Google Chrome, headless, hardware WebGL", cpu: os.cpus()[0].model, totalMemoryBytes: os.totalmem(), viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5, samples: [], resources: [], screenshots: [], screenshotHashes: {}, failedResponses: [], errors: [], dataUnchanged: true };
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  report.browser = browser.version();
  const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: report.deviceScaleFactor });
  const page = await context.newPage();
  page.on("pageerror", e => report.errors.push(e.message));
  page.on("response", response => { if (response.status() >= 400) report.failedResponses.push({ status: response.status(), url: response.url() }); });
  page.on("console", msg => { if (msg.type() === "error") report.errors.push(msg.text()); });
  await page.goto(baseURL);
  await page.locator(".galaxy-scene-label").first().waitFor();
  const canvas = page.locator("canvas").first();
  const metrics = async () => JSON.parse(await canvas.getAttribute("data-render-metrics"));
  const read = async () => { await page.waitForTimeout(1100); return metrics(); };
  async function view(quality, bookmark, reduced = false) {
    await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
    await page.evaluate(({ raw, quality, bookmark }) => {
      localStorage.setItem("universe-of-me:data:v1", raw);
      localStorage.setItem("universe-of-me:cosmic-quality:v1", quality);
      localStorage.setItem("universe-of-me:camera:v1:galaxy:unclassified", JSON.stringify(bookmark));
    }, { raw, quality, bookmark });
    await page.goto(`${baseURL}/galaxy/unclassified`);
    await page.locator(".planet-label").first().waitFor({ state: "attached" });
    await page.getByRole("button", { name: "电影模式", exact: true }).click();
    await page.waitForFunction(tier => JSON.parse(document.querySelector("canvas")?.dataset.renderMetrics ?? "{}").tier === tier, quality);
    await page.waitForTimeout(2500); // Shader compilation / texture upload excluded from warm frame samples.
    if (await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1")) !== raw) report.dataUnchanged = false;
  }
  async function screenshot(name) {
    const bytes = await page.screenshot({ path: path.join(output, `${name}.png`) });
    report.screenshots.push(`${name}.png`);
    report.screenshotHashes[`${name}.png`] = createHash("sha256").update(bytes).digest("hex");
  }
  for (const quality of ["low", "medium", "high"]) {
    await view(quality, overview);
    if (!report.renderer) report.renderer = await canvas.evaluate(c => {
      const gl = c.getContext("webgl2"), debug = gl.getExtension("WEBGL_debug_renderer_info");
      return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "unavailable";
    });
    const still = [];
    for (let i = 0; i < 6; i++) still.push(await read());
    await screenshot(`overview-${quality}`);
    const box = await canvas.boundingBox();
    const moving = [];
    await page.mouse.move(box.x + box.width * .7, box.y + box.height * .75);
    await page.mouse.down({ button: "right" });
    for (let i = 0; i < 6; i++) {
      await page.mouse.move(box.x + box.width * .7 + (i % 2 ? 0 : 65), box.y + box.height * .75, { steps: 35 });
      moving.push(await read());
    }
    await page.mouse.up({ button: "right" });
    report.samples.push({ scene: "five-planets", quality, still, moving });
  }
  for (const p of fixture.planets) {
    const distance = p.appearance.size * (p.appearance.rings ? 7.3 : 4.4);
    const bookmark = { target: p.position, position: p.position.map((n, i) => n + [-.72, .3, .625][i] * distance) };
    await view("high", bookmark, true); // Same camera/seed, frozen self rotation in both builds.
    const samples = [];
    for (let i = 0; i < 3; i++) samples.push(await read());
    report.samples.push({ scene: p.appearance.type, quality: "high", bookmark, samples });
    await screenshot(`${p.appearance.type}-high`);
    if (phase === "after" && p.appearance.type === "ocean") {
      for (const quality of ["medium", "low"]) { await view(quality, bookmark, true); await screenshot(`ocean-${quality}`); }
    }
  }
  if (phase === "after") {
    await view("low", overview);
    await page.getByRole("button", { name: "返回探索界面", exact: true }).click();
    for (const tier of ["low", "medium", "high", "low", "high"]) {
      await page.getByRole("button", { name: "渲染与数据设置", exact: true }).click();
      await page.getByRole("combobox", { name: "渲染质量", exact: true }).selectOption(tier);
      await page.keyboard.press("Escape");
      await page.waitForFunction(t => JSON.parse(document.querySelector("canvas")?.dataset.renderMetrics ?? "{}").tier === t, tier);
      await page.waitForTimeout(1200);
      report.resources.push(await metrics());
    }
    for (const [a, b] of [[0, 3], [2, 4]]) {
      for (const field of ["textures", "geometries"]) if (report.resources[a][field] !== report.resources[b][field]) report.errors.push(`Resource growth: ${field}`);
    }
    if (await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1")) !== raw) report.dataUnchanged = false;
  }
  await context.close();
  await fs.writeFile(`docs/exterior-batch-1/${phase}.json`, JSON.stringify(report, null, 2) + "\n");
  await fs.writeFile(path.join(output, "review.html"), `<!doctype html><meta charset="utf-8"><title>Exterior Batch 1 ${phase}</title><style>body{background:#060912;color:#dae3ef;font:16px/1.7 system-ui;max-width:1600px;margin:auto;padding:24px}img{max-width:100%}</style><h1>Exterior Batch 1 ${phase} · 实际 Chrome 截图</h1><p>隔离外观验收示例，无用户经历。真实 WebGL 场景，未重绘。</p>${report.screenshots.map(name => `<figure><figcaption>${name}</figcaption><img src="${name}" alt="${name}"></figure>`).join("")}`);
  console.log(JSON.stringify({ phase, renderer: report.renderer, screenshots: report.screenshots, dataUnchanged: report.dataUnchanged, errors: report.errors }));
  if (!report.dataUnchanged || report.errors.some(e => !e.includes("404"))) process.exitCode = 1;
} finally { await browser.close(); }
