import { chromium } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import fs from "node:fs/promises";
import path from "node:path";
import { galaxyPosition } from "../src/domain/galaxy.ts";
import { galaxyStyle } from "../src/domain/cosmic-visuals.ts";

// Run after build. All writes belong to NEW, isolated browser profiles, never the user's archive.
const baseURL = process.env.SPATIAL_REVIEW_URL ?? "http://127.0.0.1:3400";
const output = path.resolve("artifacts-local/v4-a2");
await fs.mkdir(output, { recursive: true });
const comparison = JSON.parse(await fs.readFile(path.resolve("docs/reviews/v4-a2/comparison-view.json"), "utf8"));
let baselineImage = "before-overview.png";
try { await fs.access(path.join(output, baselineImage)); } catch {
  baselineImage = "before-overview.webp";
  await fs.copyFile(path.resolve("docs/reviews/v4-a2/before-overview.webp"), path.join(output, baselineImage));
}
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = { baseURL, recordedAt: new Date().toISOString(), baseline: comparison, viewport: comparison.viewport, browser: browser.version(), samples: [], errors: [], consoleErrors: [] };
const metrics = async page => JSON.parse((await page.locator("canvas").first().getAttribute("data-render-metrics")) ?? "{}");
const waitScene = async (page, selector = ".galaxy-scene-label") => { await page.locator(selector).first().waitFor({ state: "attached" }); await page.waitForTimeout(2600); };
const watch = page => { page.on("pageerror", e => report.errors.push(e.message)); page.on("console", m => { if (m.type() === "error") report.consoleErrors.push(m.text()); }); };
async function view(page, bookmark) {
  await page.evaluate(v => localStorage.setItem("universe-of-me:cosmic-camera:v1", JSON.stringify(v)), bookmark);
  await page.goto(`${baseURL}/`); await page.reload(); await waitScene(page);
}
async function pan(page, dx) {
  const box = await page.locator("canvas").first().boundingBox(), x = box.x + box.width * .64, y = box.y + box.height * .77;
  await page.mouse.move(x, y); await page.mouse.down({ button: "right" }); await page.mouse.move(x + dx, y, { steps: 24 }); await page.mouse.up({ button: "right" }); await page.waitForTimeout(1700);
}
async function projectedClick(page, world) {
  const state = await metrics(page), box = await page.locator("canvas").first().boundingBox();
  const camera = new PerspectiveCamera(state.fov ?? 43, box.width / box.height, .1, 30000);
  camera.position.fromArray(state.camera); camera.lookAt(...state.target); camera.updateMatrixWorld();
  const projected = new Vector3(...world).project(camera);
  await page.mouse.click(box.x + (projected.x + 1) * box.width / 2, box.y + (1 - projected.y) * box.height / 2);
}
try {
  const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1 });
  const page = await context.newPage(); watch(page); await page.goto(baseURL); await waitScene(page);
  report.renderer = await page.locator("canvas").first().evaluate(canvas => { const gl = canvas.getContext("webgl2"), ext = gl?.getExtension("WEBGL_debug_renderer_info"); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unavailable"; });
  const original = await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"));
  await page.getByLabel("宇宙渲染质量").selectOption("medium");
  await view(page, comparison.view);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(output, "after-overview.png") });
  report.sameView = await metrics(page);
  // Actual lateral camera translation, unchanged orientation: no screen-space parallax imitation.
  await pan(page, -55); await page.screenshot({ path: path.join(output, "parallax-left.png") }); report.left = await metrics(page);
  await pan(page, 110); await page.screenshot({ path: path.join(output, "parallax-right.png") }); report.right = await metrics(page);
  report.parallax = report.left.landmarks.map((landmark, i) => ({ world: landmark.world, shiftPx: Math.abs(landmark.x - report.right.landmarks[i].x), visibleBoth: landmark.visible && report.right.landmarks[i].visible }));
  for (const [id, index] of [["unclassified", 0], ["growth", 1], ["dream", 4]]) {
    const target = galaxyPosition(index), radius = galaxyStyle(id).radius;
    await view(page, { target, position: [target[0], target[1] + radius * .65, target[2] + radius * 2.7] });
    await page.screenshot({ path: path.join(output, `galaxy-${id}-close.png`) });
  }
  await page.goto(`${baseURL}/galaxy/unclassified`); await waitScene(page, ".planet-label");
  await page.waitForTimeout(3000); await page.screenshot({ path: path.join(output, "system-layout.png") }); report.systemCamera = await metrics(page);
  const systemBox = await page.locator("canvas").first().boundingBox();
  await page.mouse.move(systemBox.width * .65, systemBox.height * .7); await page.mouse.down();
  await page.mouse.move(systemBox.width * .65 - 135, systemBox.height * .7 + 42, { steps: 32 }); await page.mouse.up(); await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(output, "system-oblique.png") });
  report.dataUnchanged = original === await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"));
  await context.close();

  // Warm the shaders and collect independent steady-state + orbit/pan samples, no video recorder competing for the GPU.
  const perfContext = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1.5 });
  const perf = await perfContext.newPage(); watch(perf);
  for (const scene of ["universe", "interior"]) {
    await perf.goto(scene === "universe" ? baseURL : `${baseURL}/galaxy/unclassified`);
    await waitScene(perf, scene === "universe" ? ".galaxy-scene-label" : ".planet-label");
    const reference = await metrics(perf);
    for (const quality of ["low", "medium", "high"]) {
      // Every tier starts from exactly the same camera; moving samples use the same gesture.
      const bookmark = { position: reference.camera, target: reference.target };
      await perf.evaluate(({ scene, bookmark }) => localStorage.setItem(scene === "universe" ? "universe-of-me:cosmic-camera:v1" : "universe-of-me:camera:v1:galaxy:unclassified", JSON.stringify(bookmark)), { scene, bookmark });
      await perf.reload(); await waitScene(perf, scene === "universe" ? ".galaxy-scene-label" : ".planet-label");
      if (scene === "universe") await perf.getByLabel("宇宙渲染质量").selectOption(quality);
      else { await perf.getByRole("button", { name: "渲染与数据设置", exact: true }).click(); await perf.getByRole("combobox", { name: "渲染质量", exact: true }).selectOption(quality); await perf.keyboard.press("Escape"); }
      await perf.waitForTimeout(3500);
      const stationary = [];
      for (let i = 0; i < 6; i++) { await perf.waitForTimeout(1100); stationary.push(await metrics(perf)); }
      await perf.screenshot({ path: path.join(output, `${scene}-${quality}.png`) });
      const moving = [], box = await perf.locator("canvas").first().boundingBox(), x = box.x + box.width * .65, y = box.y + box.height * .72;
      await perf.mouse.move(x, y); await perf.mouse.down({ button: "right" });
      for (let i = 0; i < 5; i++) { await perf.mouse.move(x + Math.sin(i * 1.4) * 65, y + Math.cos(i * 1.4) * 25, { steps: 40 }); await perf.waitForTimeout(1050); moving.push(await metrics(perf)); }
      await perf.mouse.up({ button: "right" });
      report.samples.push({ scene, quality, stationary, moving });
      console.log(`Measured ${scene}/${quality}`);
    }
  }
  await perfContext.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const phone = await mobile.newPage(); watch(phone); await phone.goto(baseURL); await waitScene(phone); await phone.screenshot({ path: path.join(output, "mobile.png") });
  report.mobile = { overflow: await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), metrics: await metrics(phone), emulationOnly: true };
  await phone.getByRole("button", { name: "进入星系：未分类星系", exact: true }).tap(); await phone.waitForURL("**/galaxy/unclassified"); report.mobile.touchNavigation = true; await mobile.close();

  const recording = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1, recordVideo: { dir: path.join(output, "raw-video"), size: report.viewport } });
  const travel = await recording.newPage(); watch(travel); await travel.goto(baseURL); await waitScene(travel); await travel.waitForTimeout(3000);
  await projectedClick(travel, galaxyPosition(0));
  await travel.waitForURL("**/galaxy/unclassified"); await waitScene(travel, ".planet-label"); await travel.waitForTimeout(4000);
  await projectedClick(travel, [1, 0, 0]);
  await travel.locator('main[data-journey-phase="approaching"]').waitFor();
  await travel.screenshot({ path: path.join(output, "planet-near.png") });
  await travel.waitForURL("**/planet/demo-1"); await travel.waitForTimeout(2800);
  await travel.screenshot({ path: path.join(output, "memory-arrival.png") });
  await travel.getByRole("link", { name: "返回所属星系", exact: true }).click();
  await travel.locator('main[data-journey-phase="idle"]').waitFor(); await travel.waitForTimeout(1500);
  const video = travel.video(); await recording.close(); await video.saveAs(path.join(output, "universe-galaxy-planet.webm"));
  await fs.writeFile(path.join(output, "performance.json"), JSON.stringify(report, null, 2));
  const pictures = ["parallax-left", "parallax-right", "galaxy-unclassified-close", "galaxy-growth-close", "galaxy-dream-close", "system-layout", "system-oblique", "planet-near", "memory-arrival", "mobile"];
  await fs.writeFile(path.join(output, "review.html"), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>V4-A2 实时渲染对照</title><style>body{background:#060a12;color:#dbe5f3;font:16px/1.8 system-ui;max-width:1600px;margin:24px auto;padding:20px}img,video{width:100%;border:1px solid #304057;border-radius:8px}.compare{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:20px 0}a{color:#a9caff}@media(max-width:800px){.compare{grid-template-columns:1fr}}</style><h1>V4.0-A2 真实浏览器视觉审阅</h1><p>Chrome / WebGL；截图未重绘。隔离浏览器使用原项目外观示例星球，没有用户人生记录；正式引导者保持原样。左 A1 / 右 A2，1600×1000、DPR 1、相同相机 position/target/FOV；星系展示坐标已调整。视觉是否达到预期由用户确认。</p><div class="compare"><figure><figcaption>A1 · ${comparison.commit}</figcaption><img src="${baselineImage}" alt="A1 同视角"></figure><figure><figcaption>A2 · 同视角</figcaption><img src="after-overview.png" alt="A2 同视角"></figure></div><h2>连续真实录屏：宇宙 → 星系 → 星球 → 返回</h2><video src="universe-galaxy-planet.webm" controls preload="metadata"></video><p>两路由之间仍使用短渐隐衔接，不是统一天文坐标下完全无缝的旅行。录屏没有拼接。</p>${pictures.map(name => `<figure><figcaption>${name}</figcaption><img src="${name}.png" alt="${name}"></figure>`).join("")}<a href="performance.json">设备条件、逐秒帧时间、资源计数和视差测量原始数据</a></html>`);
  console.log(JSON.stringify({ errors: report.errors, consoleErrors: report.consoleErrors, dataUnchanged: report.dataUnchanged, parallax: report.parallax, mobile: report.mobile }, null, 2));
} finally { await browser.close(); }
