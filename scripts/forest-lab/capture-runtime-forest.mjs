import { mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { chromium } from "playwright";

const folder = path.join(process.env.LOCALAPPDATA, "UNIVERSE-OF-ME", "asset-audit", "candidate-assets", "pine-source-conversion", "runtime-evidence");
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
  recordVideo: { dir: folder, size: { width: 1440, height: 900 } } });
const page = await context.newPage();
const issues = [];
const requests = [];
page.on("pageerror", error => issues.push(error.stack || error.message));
page.on("console", message => { if (message.type() === "error") issues.push(message.text()); });
page.on("requestfailed", request => { if (!request.failure()?.errorText?.includes("ERR_ABORTED")) issues.push(`${request.url()}: ${request.failure()?.errorText}`); });
page.on("response", response => { if (response.url().includes("forest-origin-assets")) requests.push({ url: response.url(), status: response.status(), size: response.headers()["content-length"] }); });
const started = Date.now();
let result;
try {
  await page.goto((process.env.FOREST_LAB_URL || "http://127.0.0.1:3310") + "/forest-runtime-lab", { waitUntil: "domcontentloaded" });
  await page.locator("canvas[data-forest-origin-ready='true']").waitFor({ timeout: 120000 });
  await page.waitForTimeout(5000);
  const canvas = page.locator("canvas");
  const initial = JSON.parse(await canvas.getAttribute("data-forest-origin-metrics") || "{}");
  await page.screenshot({ path: path.join(folder, "initial.png") });
  await canvas.click({ position: { x: 720, y: 450 } });
  await page.keyboard.down("w"); await page.waitForTimeout(4500); await page.keyboard.up("w");
  await page.screenshot({ path: path.join(folder, "walk.png") });
  const walking = JSON.parse(await canvas.getAttribute("data-forest-origin-metrics") || "{}");
  await page.mouse.move(720, 450); await page.mouse.down(); await page.mouse.move(1030, 370, { steps: 24 }); await page.mouse.up();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(folder, "turn.png") });
  const turning = JSON.parse(await canvas.getAttribute("data-forest-origin-metrics") || "{}");
  const stats = await sharp(path.join(folder, "initial.png")).stats();
  result = { loadedMs: Date.now() - started, initial, walking, turning,
    image: { mean: stats.channels.slice(0, 3).map(channel => channel.mean), stdev: stats.channels.slice(0, 3).map(channel => channel.stdev) },
    requests, issues };
} catch (error) {
  result = { failed: String(error), elapsedMs: Date.now() - started, requests, issues };
  await page.screenshot({ path: path.join(folder, "failed.png") }).catch(() => {});
}
await page.close();
const video = await page.video()?.path();
await context.close(); await browser.close();
if (video) await copyFile(video, path.join(folder, "walk.webm"));
await writeFile(path.join(folder, "results.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, requests: requests.length }, null, 2));
