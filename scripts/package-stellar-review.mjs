import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const folder = path.resolve("artifacts-local/v4-a3"), gitFolder = path.resolve("docs/reviews/v4-a3");
await fs.mkdir(gitFolder, { recursive: true });
const report = JSON.parse(await fs.readFile(path.join(folder, "performance.json"), "utf8"));
const comparisonPage = path.join(folder, "comparison-player.html");
await fs.writeFile(comparisonPage, `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#060b15;color:#dce6f3;font:18px/1.5 system-ui}.pair{display:flex}.item{width:800px}p{margin:0;height:60px;display:grid;place-items:center}video{display:block;width:800px;height:500px}</style><div class="pair"><div class="item"><p>舒适模式 · 实录原速</p><video src="journey-comfort.webm" muted></video></div><div class="item"><p>快速模式 · 实录原速（结束后保持末帧）</p><video src="journey-fast.webm" muted></video></div></div>`);
// Record actual synchronized playback of the source recordings; preserve full originals.
// This uses the installed Chrome/Playwright recorder, requiring no additional FFmpeg build.
const browser = await chromium.launch({ channel: "chrome", headless: true });
const video = path.join(folder, "comfort-vs-fast.webm");
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 560 }, recordVideo: { dir: path.join(folder, "comparison-video"), size: { width: 1600, height: 560 } } });
  const page = await context.newPage(); await page.goto(pathToFileURL(comparisonPage).href);
  await page.waitForFunction(() => [...document.querySelectorAll("video")].every(v => v.readyState >= 2));
  await page.evaluate(async offsets => { await Promise.all([...document.querySelectorAll("video")].map((v, i) => new Promise(resolve => { v.addEventListener("seeked", resolve, { once: true }); v.currentTime = offsets[i]; }))); }, report.journeys.map(j => j.departureOffsetMs / 1000));
  await page.evaluate(async () => { await Promise.all([...document.querySelectorAll("video")].map(v => v.play())); });
  await page.waitForFunction(() => document.querySelector("video").ended, undefined, { timeout: 45000 });
  const recording = page.video(); await context.close(); await recording.saveAs(video);
} finally { await browser.close(); }
const captions = {
  "before-overview": "A2 · 宇宙总览", "after-overview": "A3 · 同机位总览",
  "before-system": "A2 · 星系内部", "after-system": "A3 · 同机位内部",
  "before-empty-system": "A2 · 空星系", "after-empty-system": "A3 · 环境天体（新增环境边界后重新取景）",
  "stellar-close": "恒星近景 · 实时表面与光冕",
  "galaxy-unclassified-close": "棒旋星系近景", "galaxy-growth-close": "絮状星系近景", "galaxy-dream-close": "椭圆星系近景",
  "planet-near-comfort": "舒适模式 · 停稳后的主行星", "mobile": "390×844 触屏模拟 · 不是手机真机",
};
for (const name of Object.keys(captions)) await sharp(path.join(folder, `${name}.png`)).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 83 }).toFile(path.join(gitFolder, `${name}.webp`));
for (const name of ["comparison-view.json", "performance.json"]) await fs.copyFile(path.join(folder, name), path.join(gitFolder, name));
const range = (values, key) => `${Math.min(...values.map(v => v[key]))}–${Math.max(...values.map(v => v[key]))}`;
const rows = report.samples.map(s => `<tr><td>${s.scene}</td><td>${s.quality}</td><td>${range(s.stationary, "fps")}</td><td>${range(s.moving, "fps")}</td><td>${range(s.stationary, "meanMs")}</td><td>${Math.max(...s.stationary.map(v => v.p95Ms))}</td></tr>`).join("");
const figure = name => `<figure><figcaption>${captions[name]}</figcaption><img src="${name}.png" alt="${captions[name]}"></figure>`;
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>V4-A3 真实浏览器审阅</title><style>body{background:#060b15;color:#dce6f3;font:16px/1.8 system-ui;max-width:1600px;margin:auto;padding:26px}h1,h2{font-weight:500}.compare{display:grid;grid-template-columns:1fr 1fr;gap:16px}img,video{display:block;width:100%;border:1px solid #34455b;border-radius:8px}figure{margin:16px 0}figcaption{padding:10px}table{border-collapse:collapse;width:100%}td,th{padding:10px;border:1px solid #34455b}a{color:#b9d8ff}button{font:inherit;padding:10px;background:#172841;color:#fff;border:1px solid #73839b;border-radius:6px}@media(max-width:800px){.compare{grid-template-columns:1fr}}</style><h1>UNIVERSE OF ME · V4.0-A3</h1><p>所有图片和原始视频来自 Chrome 实时运行，没有生成式概念图。1600×1000、中档、截图 DPR 1；示例星球不包含用户人生记录。正式人物保持原样，视觉与舒适度是否达标仍由用户确认。</p><h2>宇宙总览：相同 position / target / 43° FOV</h2><div class="compare">${figure("before-overview")}${figure("after-overview")}</div><h2>星系内部：相同 position / target / 43° FOV</h2><div class="compare">${figure("before-system")}${figure("after-system")}</div><h2>空星系的完整环境</h2><div class="compare">${figure("before-empty-system")}${figure("after-empty-system")}</div><p>空星系里三颗天体仅属环境，不增加档案数量，不可伪装成记忆入口。其全景取景随环境边界调整，以上空星系对照并非同机位。</p><h2>连续实录：宇宙 → 星系 → 星球</h2><video src="journey-comfort.webm" controls preload="metadata"></video><h2>舒适 / 快速对比</h2><p>左：舒适；右：快速。两段真实录屏以首次点击对齐，均为原速；快速完成后保持末帧以便比较。下方也可独立播放完整录屏。</p><video src="comfort-vs-fast.webm" controls preload="metadata"></video><div class="compare"><div><p>舒适 · 原始连续录屏</p><video src="journey-comfort.webm" controls preload="metadata"></video></div><div><p>快速 · 原始连续录屏</p><video src="journey-fast.webm" controls preload="metadata"></video></div></div><h2>恒星、星系与临近</h2>${["stellar-close", "galaxy-unclassified-close", "galaxy-growth-close", "galaxy-dream-close", "planet-near-comfort", "mobile"].map(figure).join("")}<h2>实际性能</h2><p>${report.renderer} / ${report.browser} / Windows 11 / Core 5 220H。采样设备 DPR 1.5，三档各预热后 5 个约一秒静止窗口、4 个平移窗口；测量期间没有录屏。</p><table><tr><th>场景</th><th>质量</th><th>静止 FPS</th><th>移动 FPS</th><th>静止均帧时 ms</th><th>静止 p95 上界 ms</th></tr>${rows}</table><p>帧率来自 rAF 帧间隔，含浏览器/调度开销；不等同 GPU timer。资源计数是主渲染，另有一次星云离屏 pass；无 GPU 字节测量、长时压力或真机测试。</p><h2>限制</h2><p>路由间仍使用渐隐与独立局部坐标，尚非完全无缝旅行。恒星是程序化视觉近似，磁弧仍偏规整；原行星纹理、星环未重做。星云近景仍可能出现局部明暗边界及低步数纹理，不宣称电影级物理云。高档在集显上仍可能有长帧；有需要可选中/低档。舒适模式更慢且固定 FOV，但个体眩晕感需实际体验判断。</p><p><a href="performance.json">逐窗口帧时间、资源与旅行测量</a> · <a href="comparison-view.json">复现机位</a> · <a href="manifest.json">原始证据 SHA-256</a></p></html>`;
await fs.writeFile(path.join(folder, "review.html"), html);
const files = [...Object.keys(captions).map(n => `${n}.png`), "journey-comfort.webm", "journey-fast.webm", "comfort-vs-fast.webm", "review.html", "performance.json", "comparison-view.json"];
const manifest = [];
for (const name of files) { const data = await fs.readFile(path.join(folder, name)); manifest.push({ name, bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") }); }
for (const root of [folder, gitFolder]) await fs.writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ files: manifest.length, video, review: path.join(folder, "review.html") }));
