// Isolated browser observation of upstream demos. Screenshots are evidence of
// the upstream sites, never screenshots of UNIVERSE OF ME.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const targets = [
  ['three-landscape-highlands', 'https://three-landscape.vercel.app/'],
  ['hello-terrain-controller', 'https://hello-terrain.kenny.wtf/examples/raycast-character-controller'],
  ['three-geospatial-atmosphere', 'https://takram-design-engineering.github.io/three-geospatial/?path=/story/atmosphere-atmosphere--basic'],
  ['pmndrs-sky-coast', 'https://sky.docs.pmnd.rs/examples/fuji/'],
];
const out = 'artifacts-local/v4-2-r2/upstream-demos';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const result = [];
for (const [name, url] of targets) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(13000);
    await page.screenshot({ path: `${out}/${name}.png` });
    result.push({ name, url, status: response?.status(), finalUrl: page.url(), title: await page.title(), canvases: await page.locator('canvas').count(), errors: errors.slice(0, 5) });
  } catch (e) { result.push({ name, url, error: String(e) }); }
  await context.close();
}
await writeFile(`${out}/observations.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
