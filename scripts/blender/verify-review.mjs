// Validate the external Blender review gallery without touching application data.
// Usage: node scripts/blender/verify-review.mjs C:\\path\\to\\g2-1
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!root) throw new Error('Supply the external asset directory.');
const evidenceDir = path.join(root, 'evidence');
await fs.mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
const url = `file:///${root.replaceAll('\\', '/').replaceAll(' ', '%20')}/review.html`;
await page.goto(url, { waitUntil: 'load' });
const images = await page.locator('img').evaluateAll((elements) => elements.map((element) => ({
  src: element.getAttribute('src'), complete: element.complete,
  naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight,
})));
const video = page.locator('video');
await video.waitFor({ state: 'attached' });
await video.evaluate((element) => new Promise((resolve, reject) => {
  if (element.readyState >= 1) return resolve();
  element.addEventListener('loadedmetadata', resolve, { once: true });
  element.addEventListener('error', () => reject(new Error('video metadata error')), { once: true });
}));
const videoMeta = await video.evaluate((element) => ({
  duration: element.duration, width: element.videoWidth, height: element.videoHeight,
  readyState: element.readyState, src: element.getAttribute('src'),
}));
await video.evaluate((element) => { element.currentTime = Math.min(1, Math.max(0, element.duration / 3)); });
await page.waitForTimeout(250);
const before = await video.evaluate((element) => element.currentTime);
await video.evaluate((element) => element.play());
await page.waitForTimeout(900);
const after = await video.evaluate((element) => element.currentTime);
await video.evaluate((element) => element.pause());
await page.screenshot({ path: path.join(evidenceDir, 'review-desktop.png'), fullPage: true });
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await mobile.goto(url, { waitUntil: 'load' });
const mobileLayout = await mobile.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  bodyScrollWidth: document.body.scrollWidth,
}));
await mobile.screenshot({ path: path.join(evidenceDir, 'review-mobile.png'), fullPage: true });
const result = {
  url, imageCount: images.length, images,
  allImagesLoaded: images.every((image) => image.complete && image.naturalWidth > 0),
  video: videoMeta, videoAdvancedAfterPlay: after > before + 0.05,
  currentTimeBeforePlay: before, currentTimeAfterPlay: after,
  mobileLayout, mobileNoHorizontalOverflow: mobileLayout.scrollWidth <= mobileLayout.clientWidth,
  consoleErrors,
};
await fs.writeFile(path.join(evidenceDir, 'browser-review.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!result.allImagesLoaded || !result.videoAdvancedAfterPlay || !result.mobileNoHorizontalOverflow || consoleErrors.length) process.exit(1);
