import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const folder = path.join(process.env.LOCALAPPDATA, "UNIVERSE-OF-ME", "asset-audit", "candidate-assets", "pine-source-conversion", "browser-evidence");
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
  recordVideo: { dir: folder, size: { width: 1440, height: 900 } } });
const page = await context.newPage();
const issues = [];
page.on("pageerror", error => issues.push(error.message));
page.on("console", message => { if (message.type() === "error") issues.push(message.text()); });
page.on("requestfailed", request => {
  if (!request.failure()?.errorText?.includes("ERR_ABORTED")) issues.push(`${request.url()}: ${request.failure()?.errorText}`);
});
const started = Date.now();
let result;
try {
  await page.goto("http://127.0.0.1:3310/forest-origin-lab", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator("canvas[data-forest-origin-ready='true']").waitFor({ timeout: 150000 });
  await page.waitForTimeout(4000);
  const initial = JSON.parse(await page.locator("canvas").getAttribute("data-forest-origin-metrics") || "{}");
  await page.screenshot({ path: path.join(folder, "origin-source-camera.png") });
  await page.locator("canvas").click({ position: { x: 720, y: 450 } });
  await page.keyboard.down("w");
  await page.waitForTimeout(2000);
  await page.keyboard.up("w");
  await page.screenshot({ path: path.join(folder, "origin-walk.png") });
  const afterMove = JSON.parse(await page.locator("canvas").getAttribute("data-forest-origin-metrics") || "{}");
  result = { loadedMs: Date.now() - started, initial, afterMove, issues };
} catch (error) {
  await page.screenshot({ path: path.join(folder, "origin-failed.png") }).catch(() => {});
  result = { failed: String(error), elapsedMs: Date.now() - started, issues };
}
await page.close();
const video = await page.video()?.path();
await context.close();
await browser.close();
if (video) await copyFile(video, path.join(folder, "origin-preview-walk.webm"));
await writeFile(path.join(folder, "origin-preview-results.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
