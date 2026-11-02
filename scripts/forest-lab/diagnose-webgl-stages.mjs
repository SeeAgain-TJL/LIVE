import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { chromium } from "playwright";

const folder = path.join(process.env.LOCALAPPDATA, "UNIVERSE-OF-ME", "asset-audit", "candidate-assets", "pine-source-conversion", "webgl-diagnostics", process.env.PINE_DIAGNOSTIC_FOLDER || "stages");
await mkdir(folder, { recursive: true });
const stages = process.env.PINE_STAGES ? JSON.parse(process.env.PINE_STAGES) :
  [[0, 0], [1, 0], [4, 0], [8, 0], [8, 500], [16, 1000], [32, 3000]];
const result = [];
const instrument = () => {
  const diagnostics = [];
  Object.defineProperty(window, "__pineWebglDiagnostics", { value: diagnostics });
  for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    for (const method of ["compileShader", "linkProgram", "validateProgram"]) {
      const original = prototype[method];
      prototype[method] = function (...args) {
        const returned = original.apply(this, args);
        const object = args[0];
        const isShader = method === "compileShader";
        const status = this.getShaderParameter && isShader
          ? this.getShaderParameter(object, this.COMPILE_STATUS)
          : this.getProgramParameter(object, method === "linkProgram" ? this.LINK_STATUS : this.VALIDATE_STATUS);
        if (!status) diagnostics.push({ method, status, infoLog: isShader ? this.getShaderInfoLog(object) : this.getProgramInfoLog(object),
          error: this.getError(), shaderType: isShader ? this.getShaderParameter(object, this.SHADER_TYPE) : undefined,
          source: isShader ? this.getShaderSource(object)?.slice(0, 500) : undefined, time: performance.now() });
        return returned;
      };
    }
  }
  window.addEventListener("webglcontextlost", event => diagnostics.push({ method: "contextLost", status: false,
    reason: event.statusMessage, time: performance.now() }), true);
  window.addEventListener("webglcontextcreationerror", event => diagnostics.push({ method: "contextCreationError", status: false,
    reason: event.statusMessage, time: performance.now() }), true);
};

for (const [trees, props] of stages) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript(instrument);
  const errors = [];
  page.on("pageerror", error => errors.push(error.stack || error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("requestfailed", request => { if (!request.failure()?.errorText?.includes("ERR_ABORTED")) errors.push(`${request.url()}: ${request.failure()?.errorText}`); });
  const started = Date.now();
  try {
    await page.goto(`http://127.0.0.1:3310/forest-origin-lab?trees=${trees}&props=${props}&radius=35`, { waitUntil: "domcontentloaded" });
    await page.locator("canvas[data-forest-origin-ready='true']").waitFor({ timeout: 90000 });
    await page.waitForTimeout(2200);
    const canvas = page.locator("canvas");
    await canvas.screenshot({ path: path.join(folder, `stage-${trees}-${props}.png`) });
    const stats = await sharp(path.join(folder, `stage-${trees}-${props}.png`)).stats();
    const metrics = JSON.parse(await canvas.getAttribute("data-forest-origin-metrics") || "{}");
    await canvas.click({ position: { x: 720, y: 450 } });
    await page.keyboard.down("w"); await page.waitForTimeout(750); await page.keyboard.up("w");
    await page.mouse.move(720, 450); await page.mouse.down(); await page.mouse.move(800, 430, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(500);
    const diagnostics = await page.evaluate(() => window.__pineWebglDiagnostics);
    result.push({ trees, props, loadedMs: Date.now() - started, metrics, image: { mean: stats.channels.slice(0, 3).map(c => c.mean),
      stdev: stats.channels.slice(0, 3).map(c => c.stdev) }, diagnostics, errors });
  } catch (error) {
    result.push({ trees, props, failed: String(error), elapsedMs: Date.now() - started, diagnostics: await page.evaluate(() => window.__pineWebglDiagnostics).catch(() => []), errors });
  }
  console.log("STAGE", trees, props, JSON.stringify({ loadedMs: result.at(-1).loadedMs, metrics: result.at(-1).metrics,
    image: result.at(-1).image, diagnostics: result.at(-1).diagnostics?.length, errors: errors.length, failed: result.at(-1).failed }));
  await writeFile(path.join(folder, "stages.json"), JSON.stringify(result, null, 2));
  await context.close(); await browser.close();
}
