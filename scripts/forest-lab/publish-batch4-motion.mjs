import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
const source = path.resolve('artifacts-local/pine-batch4');
const target = path.resolve('docs/reviews/pine-batch4');
const ffmpeg = process.env.PINE_FFMPEG || path.join(process.env.LOCALAPPDATA, 'ms-playwright/ffmpeg-1013/ffmpeg-win64.exe');
const video = path.join(source, 'final-walk/continuous-movement.webm');
const frames = path.join(source, 'video-review');
await mkdir(frames, { recursive: true });
function run(args) {
  const p = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8', windowsHide: true });
  if (p.status !== 0) throw Error(p.error || p.stderr);
}
async function hash(file) {
  const h = createHash('sha256');
  for await (const block of createReadStream(file)) h.update(block);
  return h.digest('hex');
}
// Whole recording, same timeline. Only spatial/bitrate compression, no cuts.
run(['-i', video, '-vf', 'scale=720:450', '-c:v', 'libvpx-vp9', '-b:v', '240k', '-deadline', 'realtime', '-cpu-used', '8', '-y', path.join(target, 'continuous-walk-review.webm')]);
console.log('Compressed uncut review video');
const layers = [];
for (const [i, second] of [12, 35, 65, 100, 125, 150].entries()) {
  const file = path.join(frames, `frame-${second}.png`);
  run(['-ss', String(second), '-i', video, '-frames:v', '1', '-y', file]);
  const x = i % 3 * 480, y = Math.floor(i / 3) * 330;
  layers.push({ input: Buffer.from(`<svg width="480" height="30"><rect width="100%" height="100%" fill="#172421"/><text x="10" y="22" fill="white" font-family="Arial" font-size="16">Uncut Walker recording: ${second} s</text></svg>`), left: x, top: y });
  layers.push({ input: await sharp(file).resize(480, 300).png().toBuffer(), left: x, top: y + 30 });
}
await sharp({ create: { width: 1440, height: 660, channels: 3, background: '#172421' } }).composite(layers).webp({ quality: 90 }).toFile(path.join(target, 'video-timeline.webp'));
const runs = {};
for (const [name, folder] of [['recorded', 'final-walk'], ['withoutRecording', 'final-clean']]) {
  const r = JSON.parse(await readFile(path.join(source, folder, 'results.json'), 'utf8'));
  runs[name] = { route: r.route, renderer: r.renderer, canvasSize: r.canvasSize, firstForestMs: r.firstForestMs, settledMs: r.settledMs,
    motion: r.motion, qualityTargetMet: r.qualityTargetMet, passed: r.passed, errors: r.errors, contextEvents: r.contextEvents,
    archiveAccess: r.archiveAccess, released: r.released, resourceBytes: r.resourceBytes, returnDistanceFromStart: r.returnDistanceFromStart,
    stages: r.stages.map(s => ({ name: s.name, seconds: s.seconds, averageFps: s.averageFps, p95Ms: s.p95Ms, p99Ms: s.p99Ms, maxMs: s.maxMs,
      over100ms: s.over100ms, trianglesRange: s.trianglesRange, callsRange: s.callsRange,
      cameraSamples: s.samples.map(p => ({ position: p.metrics.camera, direction: p.metrics.direction })) })) };
}
const review = path.join(target, 'continuous-walk-review.webm');
const summary = { runtimeHead: '2e596154a43e0a3ee5d6d1f0703d18a6ed793361', browser: 'Chrome 156.0.8078.80',
  method: 'Existing verify-batch3-motion.mjs; keyboard W/A/S/D and mouse drag; no review parameter or camera pose events. Single continuous page recording including loading.',
  limitations: 'Two serial single runs on one Intel GPU. Paths differ due to timing/collision; no precise recording-overhead or controlled regression claim. Return labels mean attempted inputs, not successful return to start.',
  original: { path: path.relative(process.cwd(), video).replaceAll('\\', '/'), bytes: (await stat(video)).size, sha256: await hash(video) },
  review: { path: 'docs/reviews/pine-batch4/continuous-walk-review.webm', bytes: (await stat(review)).size, sha256: await hash(review), width: 720, height: 450, edits: 'Uncut; spatial/bitrate compression only' }, runs };
await writeFile(path.join(target, 'motion-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ original: summary.original, review: summary.review, runs: Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, { motion: v.motion, qualityTargetMet: v.qualityTargetMet }])) }, null, 2));
