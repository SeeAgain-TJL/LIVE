import { chromium } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import fs from "node:fs/promises";
import path from "node:path";
import { galaxyPosition } from "../src/domain/galaxy.ts";
import { galaxyStyle } from "../src/domain/cosmic-visuals.ts";
import { stellarSource } from "../src/domain/spatial-scene.ts";
import { createSeed } from "../src/data/seed.ts";

// Only new isolated Chrome contexts. Never attach to a user's Chrome profile or clear their data.
const baseURL = process.env.STELLAR_REVIEW_URL ?? "http://127.0.0.1:3300";
const output = path.resolve("artifacts-local/v4-a3");
await fs.mkdir(output, { recursive: true });
const comparison = JSON.parse(await fs.readFile(path.join(output, "comparison-view.json"), "utf8"));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = { date: new Date().toISOString(), browser: browser.version(), viewport: comparison.viewport, comparison, errors: [], consoleErrors: [], failedResponses: [], samples: [], journeys: [] };
const metric = async p => JSON.parse((await p.locator("canvas").first().getAttribute("data-render-metrics")) ?? "{}");
const watch = p => { p.on("pageerror", e => report.errors.push(e.message)); p.on("response", r => { if (r.status() >= 400) report.failedResponses.push({ status: r.status(), url: r.url() }); }); p.on("console", m => { if (m.type() === "error") report.consoleErrors.push({ message: m.text(), location: m.location() }); }); };
const ready = async p => { await p.locator("canvas").first().waitFor(); await p.waitForFunction(() => document.querySelector("canvas")?.dataset.renderMetrics); await p.waitForTimeout(2800); };
const capture = (p, name) => p.screenshot({ path: path.join(output, `${name}.png`) });
async function setView(p, route, key, view) {
  await p.evaluate(({ key, view }) => localStorage.setItem(key, JSON.stringify(view)), { key, view });
  await p.goto(baseURL + route); await p.reload(); await ready(p);
}
async function clickWorld(p, world) {
  const state = await metric(p), box = await p.locator("canvas").first().boundingBox();
  const camera = new PerspectiveCamera(state.fov, box.width / box.height, .1, 30000);
  camera.position.fromArray(state.camera); camera.lookAt(...state.target); camera.updateMatrixWorld();
  const v = new Vector3(...world).project(camera);
  await p.mouse.click(box.x + (v.x + 1) * box.width / 2, box.y + (1 - v.y) * box.height / 2);
}
try {
  const context = await browser.newContext({ viewport: comparison.viewport, deviceScaleFactor: 1 });
  const p = await context.newPage(); watch(p); await p.goto(baseURL); await ready(p);
  report.renderer = await p.locator("canvas").first().evaluate(c => { const gl = c.getContext("webgl2"), ext = gl.getExtension("WEBGL_debug_renderer_info"); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown"; });
  const archive = await p.evaluate(() => localStorage.getItem("universe-of-me:data:v1"));
  await p.getByLabel("宇宙渲染质量").selectOption("medium");
  await setView(p, "/", "universe-of-me:cosmic-camera:v1", comparison.overview);
  await capture(p, "after-overview"); report.overview = await metric(p);
  for (const [id, index] of [["unclassified", 0], ["growth", 1], ["dream", 4]]) {
    const target = galaxyPosition(index), radius = galaxyStyle(id).radius;
    await setView(p, "/", "universe-of-me:cosmic-camera:v1", { target, position: [target[0], target[1] + radius * .65, target[2] + radius * 2.7] });
    await capture(p, `galaxy-${id}-close`);
  }
  await setView(p, "/galaxy/unclassified", "universe-of-me:camera:v1:galaxy:unclassified", comparison.system);
  await capture(p, "after-system"); report.system = await metric(p);
  const source = stellarSource(createSeed().planets), target = source.position;
  await setView(p, "/galaxy/unclassified", "universe-of-me:camera:v1:galaxy:unclassified", { target, position: [target[0], target[1] + 1, target[2] + source.radius * 8] });
  await capture(p, "stellar-close"); report.stellar = await metric(p);
  await p.goto(baseURL + "/galaxy/growth"); await ready(p); await capture(p, "after-empty-system"); report.emptySystem = await metric(p);
  report.archiveUnchanged = archive === await p.evaluate(() => localStorage.getItem("universe-of-me:data:v1"));
  await context.close();

  // No recorder or second GPU browser while measuring. Equal cameras and device DPR 1.5.
  const perfContext = await browser.newContext({ viewport: comparison.viewport, deviceScaleFactor: 1.5 });
  const perf = await perfContext.newPage(); watch(perf); await perf.goto(baseURL); await ready(perf);
  for (const scene of ["overview", "system"]) for (const quality of ["low", "medium", "high"]) {
    await perf.evaluate(q => localStorage.setItem("universe-of-me:cosmic-quality:v1", q), quality);
    await setView(perf, scene === "overview" ? "/" : "/galaxy/unclassified", scene === "overview" ? "universe-of-me:cosmic-camera:v1" : "universe-of-me:camera:v1:galaxy:unclassified", comparison[scene]);
    await perf.waitForTimeout(3000);
    const stationary = [], moving = [];
    for (let i = 0; i < 5; i++) { await perf.waitForTimeout(1100); stationary.push(await metric(perf)); }
    const box = await perf.locator("canvas").first().boundingBox(), x = box.x + box.width * .66, y = box.y + box.height * .75;
    await perf.mouse.move(x, y); await perf.mouse.down({ button: "right" });
    for (let i = 0; i < 4; i++) { await perf.mouse.move(x + Math.sin(i * 1.3) * 55, y + Math.cos(i * 1.3) * 20, { steps: 25 }); await perf.waitForTimeout(1100); moving.push(await metric(perf)); }
    await perf.mouse.up({ button: "right" });
    report.samples.push({ scene, quality, stationary, moving }); console.log(`Measured ${scene}/${quality}`);
  }
  await perfContext.close();

  for (const mode of ["comfort", "fast"]) {
    const ctx = await browser.newContext({ viewport: comparison.viewport, deviceScaleFactor: 1, recordVideo: { dir: path.join(output, "raw-video"), size: comparison.viewport } });
    await ctx.addInitScript(({ mode, comparison }) => {
      localStorage.setItem("universe-of-me:travel:v1", mode);
      localStorage.setItem("universe-of-me:cosmic-quality:v1", "medium");
      localStorage.setItem("universe-of-me:cosmic-camera:v1", JSON.stringify(comparison.overview));
      localStorage.setItem("universe-of-me:camera:v1:galaxy:unclassified", JSON.stringify(comparison.system));
    }, { mode, comparison });
    const timing = { mode, galaxyMs: 0, planetMs: 0, phases: [] };
    // Event history records real camera phases, independent of the React navigation status.
    await ctx.addInitScript(() => {
      window.__travelPhases = [];
      new MutationObserver(records => { for (const r of records) if (r.attributeName === "data-travel-phase") { const phase = r.target.dataset.travelPhase; if (window.__travelPhases.at(-1)?.phase !== phase) window.__travelPhases.push({ phase, at: performance.now() }); } }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-travel-phase"] });
    });
    const page = await ctx.newPage(), videoStart = Date.now(); watch(page); await page.goto(baseURL); await ready(page); await page.waitForTimeout(1200);
    timing.departureOffsetMs = Date.now() - videoStart;
    let started = Date.now(); await clickWorld(page, galaxyPosition(0));
    await page.waitForURL("**/galaxy/unclassified", { timeout: 30000 }); timing.galaxyMs = Date.now() - started;
    await ready(page); await page.locator('canvas[data-travel-phase="idle"]').waitFor({ timeout: 20000 }); await page.waitForTimeout(2000);
    timing.phases.push(...await page.evaluate(() => window.__travelPhases));
    started = Date.now(); await clickWorld(page, [1, 0, 0]);
    await page.locator('canvas[data-travel-phase="settling"]').waitFor({ timeout: 30000 });
    await capture(page, `planet-near-${mode}`);
    await page.waitForURL("**/planet/demo-1", { timeout: 30000 }); timing.planetMs = Date.now() - started;
    await page.waitForTimeout(3000); await capture(page, `arrival-${mode}`);
    const video = page.video(); await ctx.close(); await video.saveAs(path.join(output, `journey-${mode}.webm`));
    report.journeys.push(timing); console.log(timing);
  }
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const phone = await phoneContext.newPage(); watch(phone); await phone.goto(baseURL); await ready(phone); await capture(phone, "mobile");
  report.mobile = { overflow: await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), metrics: await metric(phone), emulationOnly: true }; await phoneContext.close();
  await fs.writeFile(path.join(output, "performance.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ errors: report.errors, consoleErrors: report.consoleErrors, archiveUnchanged: report.archiveUnchanged }));
} finally { await browser.close(); }
