import { mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const source = path.resolve('artifacts-local/pine-batch4');
const target = path.resolve('docs/reviews/pine-batch4');
await mkdir(target, { recursive: true });
for (const name of ['near-low', 'mid-low', 'far-low', 'mid-high', 'terrain-same-camera']) {
  await sharp(path.join(source, 'final-stills', name + '.png')).webp({ quality: 90 }).toFile(path.join(target, name + '.webp'));
}
await copyFile(path.join(source, 'final-stills/results.json'), path.join(target, 'stills.json'));
const items = [
  ['Blender original / Cycles 16 samples / historical reference', 'artifacts-local/pine-batch3b/blender/terrain-reference/original-terrain-same-camera.png'],
  ['Chrome Batch3B / historical PBR composite', 'artifacts-local/pine-batch3b/final-visuals/terrain-only-pbr.png'],
  ['Chrome Batch4 / current three-layer material', path.join(source, 'final-stills/terrain-same-camera.png')],
];
const labels = Buffer.from(`<svg width="2160" height="40"><rect width="100%" height="100%" fill="#172421"/><g fill="white" font-family="Arial" font-size="16">${items.map(([label], i) => `<text x="${i * 720 + 10}" y="26">${label}</text>`).join('')}</g></svg>`);
const images = [];
for (const [index, [, file]] of items.entries()) images.push({ input: await sharp(file).resize(720, 450).png().toBuffer(), left: index * 720, top: 40 });
await sharp({ create: { width: 2160, height: 490, channels: 3, background: '#172421' } }).composite([{ input: labels, left: 0, top: 0 }, ...images]).webp({ quality: 92 }).toFile(path.join(target, 'blender-terrain-comparison.webp'));
const camera = JSON.parse(await readFile('artifacts-local/pine-batch3b/blender/terrain-reference/camera.json', 'utf8'));
const prior = JSON.parse(await readFile(path.join(source, 'tree-mid-ab3/results.json'), 'utf8'));
await writeFile(path.join(target, 'reused-evidence.json'), JSON.stringify({
  terrainReference: { camera, originalImage: items[0][1], priorBrowserImage: items[1][1], currentBrowserImage: items[2][1],
    limitations: 'Reused Blender render; terrain only, 720x450, 16 samples, denoised. Browser uses 1152x720 scaled to 1440x900. Lighting, tone mapping, displacement and UV mapping differ. Not full forest equivalence.' },
  historicalMidAB: { source: 'artifacts-local/pine-batch4/tree-mid-ab3/results.json', errors: prior.errors,
    note: 'Before quality=high gate. Forced far vs real mid; not current low vs high comparison.',
    results: prior.results.map(x => ({ mode: x.mode, pose: x.pose, warmupMs: x.settledWarmupMs, timedOut: x.settledTimedOut, metrics: x.steady2.metrics, resources: x.steady2.streaming.resources })) },
  excluded: { source: 'artifacts-local/pine-batch4/mid-lod-fps/results.json', reason: 'Requested poses differ but actual recorded camera is unchanged across all samples.' },
}, null, 2) + '\n');
console.log('Published final stills, matching terrain camera, and labelled historical A/B');
