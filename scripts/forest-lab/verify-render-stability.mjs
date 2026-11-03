import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import sharp from "sharp";

const folder = path.resolve(process.env.PINE_EVIDENCE || "artifacts-local/pine-batch1");
await mkdir(folder, { recursive: true });
const routes = process.env.PINE_ROUTES ? JSON.parse(process.env.PINE_ROUTES) :
  Array(5).fill("/forest-origin-lab?trees=16&props=1000&radius=35");

// Read status only after rendering (not immediately after compile/link): forcing
// synchronous compilation there changes scheduling and can hide the original fault.
function instrument() {
  const report = { programs: [], events: [], draws: 0, contexts: [] };
  window.__pineDiagnostics = report;
  const seen = new WeakSet();
  for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    const parameter = prototype.getProgramParameter;
    prototype.getProgramParameter = function (program, key) {
      const result = parameter.call(this, program, key);
      if (key === this.LINK_STATUS && result === false && !seen.has(program)) {
        seen.add(program);
        report.programs.push({ linked: false, linkLog: this.getProgramInfoLog(program), contextLost: this.isContextLost(),
          shaders: (this.getAttachedShaders(program) || []).map(shader => ({ type: this.getShaderParameter(shader, this.SHADER_TYPE),
            compiled: this.getShaderParameter(shader, this.COMPILE_STATUS), log: this.getShaderInfoLog(shader), source: this.getShaderSource(shader) })) });
      }
      return result;
    };
    for (const method of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      const original = prototype[method];
      if (!original) continue;
      prototype[method] = function (...args) {
        const result = original.apply(this, args);
        report.draws++;
        const program = this.getParameter(this.CURRENT_PROGRAM);
        if (program && !seen.has(program)) {
          seen.add(program);
          const extension = this.getExtension("WEBGL_debug_renderer_info");
          if (!report.contexts.length) report.contexts.push({ renderer: extension && this.getParameter(extension.UNMASKED_RENDERER_WEBGL),
            version: this.getParameter(this.VERSION), maxTextures: this.getParameter(this.MAX_TEXTURE_IMAGE_UNITS),
            maxAttributes: this.getParameter(this.MAX_VERTEX_ATTRIBS) });
          const shaders = (this.getAttachedShaders(program) || []).map(shader => ({
            type: this.getShaderParameter(shader, this.SHADER_TYPE), compiled: this.getShaderParameter(shader, this.COMPILE_STATUS),
            log: this.getShaderInfoLog(shader), source: this.getShaderSource(shader) }));
          const linked = this.getProgramParameter(program, this.LINK_STATUS);
          const linkLog = this.getProgramInfoLog(program);
          // Validate with the actual textures/attributes bound for this draw.
          this.validateProgram(program);
          report.programs.push({ linked, linkLog, validated: this.getProgramParameter(program, this.VALIDATE_STATUS),
            validationLog: this.getProgramInfoLog(program), contextLost: this.isContextLost(), shaders });
        }
        return result;
      };
    }
  }
  for (const type of ["webglcontextlost", "webglcontextrestored", "webglcontextcreationerror"]) {
    window.addEventListener(type, event => report.events.push({ type, message: event.statusMessage || "", time: performance.now() }), true);
  }
}

const results = [];
for (const [index, route] of routes.entries()) {
  // Independent Chrome process + fresh browser context, no browser cache reuse.
  const browser = await chromium.launch({ channel: "chrome", headless: process.env.PINE_HEADED !== "1" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript(instrument);
  const errors = [];
  page.on("pageerror", error => errors.push(error.stack || error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("requestfailed", request => errors.push(`${request.url()} ${request.failure()?.errorText}`));
  const started = Date.now();
  let result = { attempt: index + 1, route, errors };
  try {
    await page.goto((process.env.FOREST_LAB_URL || "http://127.0.0.1:3310") + route, { waitUntil: "domcontentloaded" });
    const canvas = page.locator("canvas");
    await page.waitForFunction(() => document.querySelector("canvas[data-forest-origin-ready='true']") ||
      window.__pineDiagnostics.events.length || window.__pineDiagnostics.programs.some(p => !p.linked), null, { timeout: 120000 });
    assert.equal(await page.locator("canvas[data-forest-origin-ready='true']").count(), 1, "Rendering failed before readiness");
    if (process.env.PINE_SETTLE === "1") await page.waitForFunction(() => {
      const value=JSON.parse(document.querySelector("canvas")?.dataset.forestStreaming || "null");
      return value && value.trees>0 && value.props>0 && !value.pendingTiles.length && !value.pendingResources.length && !value.queued;
    }, null, { timeout: 120000 });
    await page.waitForTimeout(3000);
    result.initial = JSON.parse(await canvas.getAttribute("data-forest-origin-metrics"));
    const screenshot = path.join(folder, `load-${index + 1}.png`);
    await page.screenshot({ path: screenshot });
    const stats = await sharp(screenshot).stats();
    result.image = stats.channels.slice(0, 3).map(({ mean, stdev }) => ({ mean, stdev }));
    await canvas.click({ position: { x: 720, y: 450 } });
    await page.keyboard.down("w"); await page.waitForTimeout(600); await page.keyboard.up("w");
    await page.mouse.move(720, 450); await page.mouse.down(); await page.mouse.move(820, 420, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(1200);
    result.moved = JSON.parse(await canvas.getAttribute("data-forest-origin-metrics"));
    result.diagnostics = await page.evaluate(() => window.__pineDiagnostics);
    assert.equal(errors.length, 0, "Browser errors");
    assert.equal(result.diagnostics.events.length, 0, "WebGL context event");
    assert.ok(result.diagnostics.programs.length > 0, "No real WebGL draw");
    assert.ok(result.diagnostics.programs.every(p => p.linked && p.validated && p.shaders.every(s => s.compiled)), "Shader failure");
    const required = route.includes("diagnostic=fir") ? "fir_twig" : route.includes("diagnostic=fern") ? "fern_02_source_pbr" : null;
    if (required) assert.ok(result.diagnostics.programs.some(p => p.shaders.some(s => s.source?.includes(required))), "Target material was not drawn");
    assert.ok(result.image.every(c => c.mean < 245 && c.stdev > 20), "Blank image");
    if (result.initial.direction) {
      const expected = [-0.982, 0.126, -0.140];
      assert.ok(result.initial.direction.reduce((sum, value, i) => sum + value * expected[i], 0) > 0.999, "Source camera orientation");
      assert.notDeepEqual(result.moved.camera, result.initial.camera, "Walking did not move");
      assert.notDeepEqual(result.moved.direction, result.initial.direction, "Dragging did not turn");
    }
    result.passed = true;
  } catch (error) {
    result.failed = String(error);
    result.diagnostics ??= await page.evaluate(() => window.__pineDiagnostics).catch(() => null);
    await page.screenshot({ path: path.join(folder, `failed-${index + 1}.png`) }).catch(() => {});
  } finally {
    result.elapsedMs = Date.now() - started;
    await context.close(); await browser.close();
  }
  results.push(result);
  await writeFile(path.join(folder, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ ...result, diagnostics: { programs: result.diagnostics?.programs.length,
    failures: result.diagnostics?.programs.filter(p => !p.linked || !p.validated).map(p => ({
      linked: p.linked, validated: p.validated, contextLost: p.contextLost, linkLog: p.linkLog, validationLog: p.validationLog,
      shaders: p.shaders.map(s => ({ name: s.source?.match(/#define SHADER_NAME (.+)/)?.[1], compiled: s.compiled, log: s.log })) })),
    events: result.diagnostics?.events } }));
}
if (results.some(result => !result.passed)) process.exitCode = 1;
