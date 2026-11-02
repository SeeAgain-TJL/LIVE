import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const folder = path.join(process.env.LOCALAPPDATA, "UNIVERSE-OF-ME", "asset-audit", "candidate-assets", "single-tree");
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
for (const { variant, alphaMode } of [
  { variant: "previous", alphaMode: "cut" },
  { variant: "original", alphaMode: "cut" },
  { variant: "original", alphaMode: "blend" },
  { variant: "meshopt", alphaMode: "blend" },
  { variant: "lod10", alphaMode: "blend" },
  { variant: "lod03", alphaMode: "blend" },
  { variant: "lod01", alphaMode: "blend" },
]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const issues = [];
  page.on("pageerror", error => issues.push(error.message));
  page.on("console", message => { if (message.type() === "error") issues.push(message.text()); });
  page.on("requestfailed", request => issues.push(`${request.url()}: ${request.failure()?.errorText}`));
  const start = Date.now();
  await page.goto("http://127.0.0.1:3310/single-tree-lab", { waitUntil: "domcontentloaded", timeout: 30000 });
  if (variant === "previous") await page.getByRole("button", { name: "旧减面导出" }).click();
  if (variant === "meshopt") await page.getByRole("button", { name: "无减面压缩" }).click();
  if (variant === "lod10") await page.getByRole("button", { name: "受限简化 10%" }).click();
  if (variant === "lod03") await page.getByRole("button", { name: "受限简化 3%" }).click();
  if (variant === "lod01") await page.getByRole("button", { name: "受限简化 1%" }).click();
  if (alphaMode === "blend") await page.getByRole("button", { name: "Alpha 混合" }).click();
  await page.locator("canvas[data-single-tree-ready='true']").waitFor({ state: "detached", timeout: 1000 }).catch(() => {});
  await page.locator("canvas[data-single-tree-ready='true']").waitFor({ timeout: 180000 });
  const loadedMs = Date.now() - start;
  await page.waitForTimeout(4000);
  const near = JSON.parse(await page.locator("canvas").getAttribute("data-single-tree-metrics") || "{}");
  await page.locator("main > div:last-child").evaluate(element => { element.style.display = "none"; });
  await page.screenshot({ path: path.join(folder, `webgl-${variant}-${alphaMode}-near.png`) });
  await page.locator("main > div:last-child").evaluate(element => { element.style.display = "flex"; });
  await page.getByRole("button", { name: "中景" }).click();
  await page.waitForTimeout(2500);
  const mid = JSON.parse(await page.locator("canvas").getAttribute("data-single-tree-metrics") || "{}");
  await page.locator("main > div:last-child").evaluate(element => { element.style.display = "none"; });
  await page.screenshot({ path: path.join(folder, `webgl-${variant}-${alphaMode}-mid.png`) });
  const gpu = await page.evaluate(() => {
    const gl = document.querySelector("canvas")?.getContext("webgl2");
    const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    return { renderer: debug && gl?.getParameter(debug.UNMASKED_RENDERER_WEBGL), userAgent: navigator.userAgent };
  });
  let moving = null;
  if (variant === "original" && alphaMode === "blend") {
    await page.mouse.move(720, 450);
    await page.mouse.down();
    for (let step = 0; step < 24; step++) {
      await page.mouse.move(720 + step * 12, 450 - step * 2);
      await page.waitForTimeout(50);
    }
    moving = JSON.parse(await page.locator("canvas").getAttribute("data-single-tree-metrics") || "{}");
    await page.mouse.up();
  }
  results.push({ variant, alphaMode, loadedMs, near, mid, moving, gpu, issues });
  await context.close();
}
await browser.close();
await writeFile(path.join(folder, "single-tree-results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
