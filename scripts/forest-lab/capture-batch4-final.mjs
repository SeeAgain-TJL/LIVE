// Still-image review uses the existing explicit review-camera hook.
// The continuous WASD recording is a separate run with no review hook.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const folder = path.resolve('artifacts-local/pine-batch4/final-stills');
await mkdir(folder, { recursive: true });
const origin = process.env.FOREST_LAB_URL || 'http://127.0.0.1:3314';
const reference = JSON.parse(await readFile('artifacts-local/pine-batch3b/blender/terrain-reference/camera.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const result = { browser: browser.version(), viewport: [1440, 900], internal: [1152, 720], errors: [], shots: [] };
async function capture(name, route, pose, requiredResource) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => result.errors.push(`${name}: ${error}`));
  page.on('console', message => { if (message.type() === 'error') result.errors.push(`${name}: ${message.text()}`); });
  page.on('response', response => { if (response.status() >= 400) result.errors.push(`${name}: HTTP ${response.status()} ${response.url()}`); });
  try {
    await page.goto(origin + route);
    await page.locator('canvas[data-pine-review-pose-ready=true][data-pine-terrain=layered]').waitFor({ timeout: 120000 });
    await page.evaluate(detail => window.dispatchEvent(new CustomEvent('pine-runtime-review-camera', { detail })), pose);
    await page.waitForFunction(() => {
      const s = JSON.parse(document.querySelector('canvas')?.dataset.forestStreaming || 'null');
      return s && !s.pendingTiles.length && !s.pendingResources.length && !s.queued;
    }, null, { timeout: 120000 });
    await page.waitForTimeout(4000);
    const state = await page.locator('canvas').evaluate(c => ({
      metrics: JSON.parse(c.dataset.forestOriginMetrics || 'null'),
      streaming: JSON.parse(c.dataset.forestStreaming || 'null'), terrain: c.dataset.pineTerrain,
      dimensions: [c.width, c.height],
    }));
    assert.ok(state.metrics && !state.metrics.contextLost);
    assert.ok(Math.hypot(...state.metrics.camera.map((v, i) => v - pose.position[i])) < 0.00001, 'Review camera did not move');
    if (requiredResource) assert.ok(state.streaming.resources.includes(requiredResource), `${requiredResource} not resident`);
    if (!route.includes('quality=high')) assert.ok(!state.streaming.resources.includes('pine_04/mid'), 'Low tier loaded real mid LOD');
    await page.screenshot({ path: path.join(folder, name + '.png') });
    const frames = await page.evaluate(() => new Promise(resolve => {
      const intervals = []; let last = performance.now(); const start = last;
      function frame(now) { intervals.push(now - last); last = now; if (now - start < 5000) requestAnimationFrame(frame); else resolve(intervals); }
      requestAnimationFrame(frame);
    }));
    const sorted = [...frames].sort((a, b) => a - b);
    result.shots.push({ name, route, requestedPose: pose, ...state,
      stationarySample: { seconds: frames.reduce((s, x) => s + x, 0) / 1000, fps: 1000 * frames.length / frames.reduce((s, x) => s + x, 0), p95Ms: sorted[Math.floor(sorted.length * .95)] } });
    await writeFile(path.join(folder, 'results.json'), JSON.stringify(result, null, 2));
    console.log(name, state.metrics.camera, state.metrics.triangles);
  } finally { await page.close(); }
}
try {
  const base = '/forest-runtime-lab?scale=0.8&review=1';
  await capture('near-low', base, { position: [23.155473709106445, .9223032593727112, 47.55979919433594], direction: [-.9821439487, .1260486988, -.1396602648] });
  await capture('mid-low', base, { position: [-70, 2, 26], direction: [0, -.04, -1] });
  await capture('far-low', base, { position: [10, 18, 60], direction: [.1, -.5, -1] });
  await capture('mid-high', base + '&quality=high', { position: [-70, 2, 26], direction: [0, -.04, -1] }, 'pine_04/mid');
  await capture('terrain-same-camera', '/forest-runtime-lab?scale=0.8&review=terrain', { position: reference.three_position, direction: reference.three_direction });
  assert.deepEqual(result.errors, []);
} finally {
  await browser.close();
  await writeFile(path.join(folder, 'results.json'), JSON.stringify(result, null, 2));
}
