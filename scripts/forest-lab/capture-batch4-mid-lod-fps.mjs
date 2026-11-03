import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('artifacts-local/pine-batch4/mid-lod-fps');
await mkdir(root, { recursive: true });
const url = process.env.FOREST_LAB_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${url}/forest-runtime-lab?scale=0.8&review=1`);
  await page.locator('canvas[data-pine-review-pose-ready=true]').waitFor({ timeout: 120000 });
  await page.waitForTimeout(2000);
  const poses = [
    { name: 'pine04-cluster-25m', position: [-70, 2, 26], direction: [0, -0.04, -1] },
    { name: 'pine04-cluster-18m', position: [-70, 2, 19], direction: [0, -0.04, -1] },
    { name: 'pine04-cluster-35m', position: [-70, 2, 36], direction: [0, -0.04, -1] },
  ];
  for (const pose of poses) {
    await page.evaluate(detail => window.dispatchEvent(new CustomEvent('pine-runtime-review-camera', { detail })),
      { position: pose.position, direction: pose.direction });
    await page.waitForTimeout(4000);
    const metrics = await page.locator('canvas').evaluate(c => c.dataset.forestOriginMetrics || null);
    results.push({ name: pose.name, metrics: metrics ? JSON.parse(metrics) : null });
    await page.screenshot({ path: path.join(root, `${pose.name}.png`) });
  }
  await page.close();
} finally {
  await browser.close();
  await writeFile(path.join(root, 'results2.json'), JSON.stringify({ errors, results }, null, 2));
}
console.log(JSON.stringify({ errors, results }, null, 2));
