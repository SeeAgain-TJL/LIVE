import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
const output = path.resolve('artifacts-local/pine-batch4/delivery-verification');
await mkdir(output, { recursive: true });
const assetRoot = path.resolve('artifacts-local/pine-batch4/zip-check/runtime');
const refusal = path.join(output, 'refusal');
await mkdir(refusal, { recursive: true });
await writeFile(path.join(refusal, 'terrain.glb'), 'existing-content-must-survive');
const rejected = spawnSync(process.execPath, ['scripts/forest-lab/transfer-batch4-assets.mjs', 'restore', '--from', assetRoot, '--to', refusal], { encoding: 'utf8', windowsHide: true });
assert.notEqual(rejected.status, 0);
assert.match(rejected.stderr, /Refusing to overwrite different asset/);
assert.equal(await readFile(path.join(refusal, 'terrain.glb'), 'utf8'), 'existing-content-must-survive');
assert.deepEqual(await readdir(refusal), ['terrain.glb'], 'Preflight refusal must not partially restore files');
const videos = {
  '/raw.webm': path.resolve('artifacts-local/pine-batch4/final-walk/continuous-movement.webm'),
  '/review.webm': path.resolve('docs/reviews/pine-batch4/continuous-walk-review.webm'),
};
const server = createServer(async (request, response) => {
  const file = videos[request.url];
  if (!file) { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><html><body><video muted controls></video></body></html>'); return; }
  const data = await readFile(file);
  const range = /bytes=(\d+)-(\d*)/.exec(request.headers.range || '');
  const start = range ? Number(range[1]) : 0, end = range && range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
  response.writeHead(range ? 206 : 200, { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1,
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${data.length}` } : {}) });
  response.end(data.subarray(start, end + 1));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { restoreRefusalPassed: true, assetSource: assetRoot, runtime: [], playback: [], errors: [] };
try {
  for (const quality of ['low', 'high']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const requests = new Set();
    page.on('pageerror', e => report.errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await page.route('**/forest-origin-assets/**', async route => {
      const file = decodeURIComponent(new URL(route.request().url()).pathname.split('/forest-origin-assets/')[1]);
      const resolved = path.resolve(assetRoot, file);
      assert.ok(resolved.startsWith(assetRoot + path.sep));
      requests.add(file);
      if (!await stat(resolved).catch(() => null)) { report.errors.push('Missing transferred asset: ' + file); await route.abort(); return; }
      await route.fulfill({ path: resolved });
    });
    const route = `/forest-runtime-lab?scale=0.8&review=1&quality=${quality}`;
    await page.goto((process.env.FOREST_LAB_URL || 'http://127.0.0.1:3314') + route);
    await page.locator('canvas[data-pine-review-pose-ready=true][data-pine-terrain=layered]').waitFor({ timeout: 120000 });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('pine-runtime-review-camera', { detail: { position: [-70, 2, 26], direction: [0, -.04, -1] } })));
    await page.waitForFunction(() => {
      const c = document.querySelector('canvas'); const s = JSON.parse(c?.dataset.forestStreaming || 'null');
      return c?.dataset.forestOriginReady === 'true' && s && !s.pendingTiles.length && !s.pendingResources.length && !s.queued;
    }, null, { timeout: 120000 });
    await page.waitForTimeout(2000);
    const state = await page.locator('canvas').evaluate(c => ({ metrics: JSON.parse(c.dataset.forestOriginMetrics), resources: JSON.parse(c.dataset.forestStreaming).resources }));
    assert.equal(state.metrics.contextLost, false);
    assert.equal(state.resources.includes('pine_04/mid'), quality === 'high');
    report.runtime.push({ quality, route, requests: [...requests].sort(), state });
    await page.close();
  }
  for (const file of Object.keys(videos)) {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const playback = await page.evaluate(async file => {
      const video = document.querySelector('video'); video.src = file;
      await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = () => reject(Error('Metadata decode failed')); });
      const metadata = { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
      const seeks = [];
      for (const second of [12, 35, 65, 100, 125, 150]) {
        await new Promise((resolve, reject) => { video.onseeked = resolve; video.onerror = () => reject(Error('Video seek/decode failed')); video.currentTime = second; });
        seeks.push({ requested: second, actual: video.currentTime, readyState: video.readyState });
      }
      video.currentTime = 20; await video.play();
      await new Promise(resolve => setTimeout(resolve, 800)); video.pause();
      return { file, ...metadata, seeks, playedTo: video.currentTime, error: video.error?.message || null };
    }, file);
    assert.ok(playback.duration > 156 && playback.duration < 159);
    assert.ok(playback.playedTo > 20.2); assert.equal(playback.error, null);
    assert.ok(playback.seeks.every(s => Math.abs(s.actual - s.requested) < .1 && s.readyState >= 2));
    report.playback.push(playback); await page.close();
  }
  assert.deepEqual(report.errors, []);
  const zip = await readFile('artifacts-local/pine-batch4/handoff/pine-batch4-runtime.zip');
  report.runtimeZip = { bytes: zip.length, sha256: createHash('sha256').update(zip).digest('hex') };
  report.passed = true;
} finally {
  await browser.close(); server.close();
  await writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ passed: report.passed, restoreRefusalPassed: report.restoreRefusalPassed, runtime: report.runtime.map(r => ({ quality: r.quality, files: r.requests.length })), playback: report.playback, runtimeZip: report.runtimeZip }, null, 2));
