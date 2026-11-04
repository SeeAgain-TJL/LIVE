import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('artifacts-local/pine-batch4/tree-mid-ab');
await mkdir(root, { recursive: true });
const url = process.env.FOREST_LAB_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-gl=desktop','--ignore-gpu-blocklist','--enable-gpu-rasterization'] });
const errors = [];
const results = [];
const poses = [
  { name: '18m', position: [-70, 2, 19], direction: [0, -0.04, -1] },
  { name: '25m', position: [-70, 2, 26], direction: [0, -0.04, -1] },
  { name: '35m', position: [-70, 2, 36], direction: [0, -0.04, -1] },
];
try {
  for (const mode of ['far-forced', 'real-mid']) {
    // far-forced = lod=far (old billboard-only behavior, same file for every tier)
    // real-mid = default (new pine_04-mid.gltf actually requested at mid tier)
    const lodParam = mode === 'far-forced' ? '&lod=far' : '';
    for (const pose of poses) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      page.on('pageerror', e => errors.push(`${mode}/${pose.name}: ${e}`));
      page.on('console', m => { if (m.type() === 'error') errors.push(`${mode}/${pose.name}: ${m.text()}`); });
      await page.goto(`${url}/forest-runtime-lab?scale=0.8&review=1${lodParam}`);
      await page.locator('canvas[data-pine-review-pose-ready=true]').waitFor({ timeout: 120000 });
      await page.waitForTimeout(2000);
      await page.evaluate(detail => window.dispatchEvent(new CustomEvent('pine-runtime-review-camera', { detail })),
        { position: pose.position, direction: pose.direction });
      // Separate first-load stutter (warmup) from steady-state roam.
      await page.waitForTimeout(2500);
      const warm = await page.locator('canvas').evaluate(c => c.dataset.forestOriginMetrics || null);
      await page.waitForTimeout(4000);
      const steady = await page.locator('canvas').evaluate(c => c.dataset.forestOriginMetrics || null);
      await page.screenshot({ path: path.join(root, `${mode}-${pose.name}.png`) });
      results.push({ mode, pose: pose.name, warm: warm ? JSON.parse(warm) : null, steady: steady ? JSON.parse(steady) : null });
      await page.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(path.join(root, 'results.json'), JSON.stringify({ errors, results }, null, 2));
}
console.log(JSON.stringify({ errors, results }, null, 2));
