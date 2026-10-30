import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

// Isolated profiles only. No access to the user's daily browser or memory archive.
const baseURL = process.env.COSMIC_REVIEW_URL ?? "http://127.0.0.1:3300";
const output = path.resolve("artifacts-local/v4-a1");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = { baseURL, recordedAt: new Date().toISOString(), viewport: { width: 1600, height: 1000 }, samples: [], errors: [], dataUnchanged: false };
try {
  const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1.5 });
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(error.message));
  await page.goto(baseURL);
  await page.locator(".galaxy-scene-label").first().waitFor();
  report.browser = browser.version();
  report.renderer = await page.locator("canvas").first().evaluate(canvas => {
    const gl = canvas.getContext("webgl2"); const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "unavailable";
  });
  const original = await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"));
  for (const quality of ["low", "medium", "high"]) {
    await page.getByLabel("宇宙渲染质量").selectOption(quality);
    await page.waitForTimeout(2500);
    const samples = [];
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(1100);
      samples.push(JSON.parse(await page.locator("canvas").first().getAttribute("data-render-metrics")));
    }
    report.samples.push({ scene: "universe", quality, samples });
    await page.screenshot({ path: path.join(output, `universe-${quality}.png`) });
  }
  // Zoom through a real camera bookmark into three different existing galaxies.
  // No Galaxy, Planet or Memory records are modified.
  for (const [id, index] of [["unclassified", 0], ["growth", 1], ["friendship", 2]]) {
    const angle = index * 2.399963, radius = 7 + Math.sqrt(index) * 7;
    const target = [Math.cos(angle) * radius, Math.sin(angle) * radius * 0.8, Math.sin(index * 1.7) * 5];
    const position = [target[0], target[1] + 6, target[2] + 24];
    await page.evaluate(view => localStorage.setItem("universe-of-me:cosmic-camera:v1", JSON.stringify(view)), { target, position });
    await page.reload(); await page.locator(".galaxy-scene-label").first().waitFor(); await page.waitForTimeout(2200);
    await page.screenshot({ path: path.join(output, `galaxy-${id}-close.png`) });
  }
  await page.goto(`${baseURL}/galaxy/unclassified`);
  await page.locator(".planet-label").first().waitFor(); await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(output, "galaxy-interior.png") });
  const interior = [];
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(1100); interior.push(JSON.parse(await page.locator("canvas").first().getAttribute("data-render-metrics"))); }
  report.samples.push({ scene: "interior", quality: "high", samples: interior });
  report.dataUnchanged = original === await page.evaluate(() => localStorage.getItem("universe-of-me:data:v1"));
  await context.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const phone = await mobile.newPage(); await phone.goto(baseURL); await phone.locator(".galaxy-scene-label").first().waitFor(); await phone.waitForTimeout(2500);
  await phone.screenshot({ path: path.join(output, "universe-mobile.png") });
  report.mobile = { noOverflow: await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), metrics: JSON.parse(await phone.locator("canvas").first().getAttribute("data-render-metrics")) };
  await phone.getByRole("button", { name: "进入星系：未分类星系", exact: true }).tap();
  await phone.waitForURL("**/galaxy/unclassified");
  report.mobile.touchNavigation = true;
  await mobile.close();

  const recording = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: path.join(output, "raw-video"), size: { width: 1440, height: 900 } } });
  const travel = await recording.newPage(); await travel.goto(baseURL); await travel.locator(".galaxy-scene-label").first().waitFor(); await travel.waitForTimeout(2500);
  await travel.getByRole("button", { name: "进入星系：未分类星系", exact: true }).click();
  await travel.waitForURL("**/galaxy/unclassified"); await travel.locator(".planet-label").first().waitFor(); await travel.waitForTimeout(4500);
  await travel.getByRole("link", { name: "← 返回宇宙星系", exact: true }).click();
  await travel.locator(".galaxy-scene-label").first().waitFor(); await travel.waitForTimeout(2000);
  const video = travel.video(); await recording.close(); await video.saveAs(path.join(output, "universe-to-galaxy.webm"));
  await fs.writeFile(path.join(output, "performance.json"), JSON.stringify(report, null, 2));
  const pictures = ["universe-high", "galaxy-unclassified-close", "galaxy-growth-close", "galaxy-friendship-close", "galaxy-interior", "universe-mobile"];
  await fs.writeFile(path.join(output, "review.html"), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>V4-A1 实际渲染审阅</title><style>body{background:#060a12;color:#dae3f0;font:16px/1.8 system-ui;max-width:1400px;margin:32px auto;padding:20px}img,video{max-width:100%;border:1px solid #304057;border-radius:8px}figure{margin:32px 0}a{color:#a9caff}</style><h1>V4.0-A1 实际运行记录</h1><p>隔离 Chrome，真实 WebGL 渲染；初始星球仅为明确标注的外观示例，没有用户经历。画面未重绘。录屏为真实导航，不是概念动画。</p><video src="universe-to-galaxy.webm" controls preload="metadata"></video>${pictures.map(name => `<figure><figcaption>${name}</figcaption><img src="${name}.png" alt="${name}"></figure>`).join("")}<a href="performance.json">原始性能采样与设备条件</a></html>`);
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
