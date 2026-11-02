import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const folder = path.join(process.env.LOCALAPPDATA, "UNIVERSE-OF-ME", "asset-audit", "candidate-assets", "pine-source-conversion", "browser-evidence");
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const issues = [];
page.on("pageerror", error => issues.push(error.message));
page.on("console", message => { if (message.type() === "error") issues.push(message.text()); });
page.on("requestfailed", request => {
  if (!request.failure()?.errorText?.includes("ERR_ABORTED")) issues.push(`${request.url()}: ${request.failure()?.errorText}`);
});
const started = Date.now();
await page.goto("http://127.0.0.1:3310/single-tree-lab", { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "已固化冷杉" }).click();
await page.getByRole("button", { name: "Alpha 混合" }).click();
await page.locator("canvas[data-single-tree-ready='true']").waitFor({ timeout: 120000 });
await page.waitForTimeout(3500);
const loadedMs = Date.now() - started;
const near = JSON.parse(await page.locator("canvas").getAttribute("data-single-tree-metrics") || "{}");
await page.screenshot({ path: path.join(folder, "realized-fir-near.png") });
await page.getByRole("button", { name: "中景" }).click();
await page.waitForTimeout(2500);
const mid = JSON.parse(await page.locator("canvas").getAttribute("data-single-tree-metrics") || "{}");
await page.screenshot({ path: path.join(folder, "realized-fir-mid.png") });
const gpu = await page.evaluate(() => {
  const gl = document.querySelector("canvas")?.getContext("webgl2");
  const ext = gl?.getExtension("WEBGL_debug_renderer_info");
  return ext && gl?.getParameter(ext.UNMASKED_RENDERER_WEBGL);
});
await context.close();
await browser.close();
const result = { loadedMs, near, mid, gpu, issues, viewport: [1440, 900], dpr: 1 };
await writeFile(path.join(folder, "realized-fir-results.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
