// Portable, hash-checked runtime handoff. No DCC source or unrelated trials.
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const [mode, ...args] = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const runtime = path.resolve('public/forest-origin-assets');
const manifestFile = path.resolve(args.includes('--manifest') ? option('--manifest') : 'docs/reviews/pine-batch4/runtime-assets.json');
function inside(root, relative) {
  const result = path.resolve(root, relative);
  if (!result.startsWith(root + path.sep)) throw Error(`Unsafe asset path: ${relative}`);
  return result;
}
async function digest(file) {
  const hash = createHash('sha256');
  for await (const block of createReadStream(file)) hash.update(block);
  return hash.digest('hex');
}
async function matches(root, item) {
  const file = inside(root, item.path);
  const info = await stat(file).catch(() => null);
  return info?.size === item.bytes && await digest(file) === item.sha256;
}
if (mode === 'snapshot') {
  const paths = new Set(['terrain.glb', 'sky.hdr', 'collision-layout.json', 'source-tree-placements.json', 'batch2/tiles/manifest.json']);
  for (const name of await readdir(path.join(runtime, 'batch2/tiles'))) paths.add('batch2/tiles/' + name);
  const species = [...new Set(JSON.parse(await readFile(path.join(runtime, 'source-tree-placements.json'), 'utf8')).map(t => t.source))].sort();
  const gltfs = ['near', 'mid', 'far'].map(t => `batch2/props-${t}.gltf`);
  for (const name of species) {
    gltfs.push(`batch2/trees/${name}-near.gltf`);
    for (const ext of ['json', 'webp']) paths.add(`batch2/impostors/${name}.${ext}`);
  }
  gltfs.push('batch4/trees/pine_04-mid.gltf');
  for (const file of gltfs) {
    paths.add(file);
    const gltf = JSON.parse(await readFile(path.join(runtime, file), 'utf8'));
    for (const part of [...gltf.buffers ?? [], ...gltf.images ?? []]) {
      if (part.uri && !part.uri.startsWith('data:')) paths.add(path.posix.join(path.posix.dirname(file), decodeURIComponent(part.uri)));
    }
  }
  for (const folder of ['batch3/impostors', 'batch3b/impostors']) {
    for (const ext of ['json', 'webp']) paths.add(`${folder}/pine_04.${ext}`);
  }
  for (const name of ['basecolor', 'normal', 'roughness']) paths.add(`batch3b/terrain/${name}.webp`);
  for (const name of await readdir(path.join(runtime, 'batch4/terrain'))) {
    if (name.endsWith('.webp') || name === 'manifest.json') paths.add('batch4/terrain/' + name);
  }
  if(args.includes('--extra')) {
    const folder=option('--extra');
    for(const name of await readdir(inside(runtime,folder))) paths.add(path.posix.join(folder,name));
  }
  const files = [];
  for (const file of [...paths].sort()) files.push({ path: file, bytes: (await stat(inside(runtime, file))).size, sha256: await digest(inside(runtime, file)) });
  const manifest = { version: 1, scope: '/forest-runtime-lab low/high + terrain comparison; excludes other lab routes and DCC sources', sourceBlendSha256: 'fdce77741081f462f11e5cefe8bf79a0bc796727dbb6e51d12fc6cf20e9c9cfb', files, totalBytes: files.reduce((s, f) => s + f.bytes, 0) };
  await mkdir(path.dirname(manifestFile), { recursive: true });
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  console.log({ files: files.length, totalBytes: manifest.totalBytes });
} else if (['verify', 'export', 'restore'].includes(mode)) {
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  const source = args.includes('--from') ? path.resolve(option('--from')) : runtime;
  const target = args.includes('--to') ? path.resolve(option('--to')) : mode === 'restore' ? runtime : null;
  if (mode === 'export' && !target) throw Error('export requires --to <new folder>');
  // Verify all source bytes before copying anything.
  for (const item of manifest.files) if (!await matches(source, item)) throw Error(`Missing or changed asset: ${item.path}`);
  if (target) {
    for (const item of manifest.files) {
      const to = inside(target, item.path);
      if (await stat(to).catch(() => null)) {
        if (!await matches(target, item)) throw Error(`Refusing to overwrite different asset: ${to}`);
      }
    }
    for (const item of manifest.files) {
      const to = inside(target, item.path);
      await mkdir(path.dirname(to), { recursive: true });
      if (!await stat(to).catch(() => null)) await copyFile(inside(source, item.path), to);
      if (!await matches(target, item)) throw Error(`Copy verification failed: ${item.path}`);
    }
    if (mode === 'export') await copyFile(manifestFile, path.join(target, 'runtime-assets.json'));
  }
  console.log({ mode, source, target, verifiedFiles: manifest.files.length, totalBytes: manifest.totalBytes });
} else throw Error('Usage: node scripts/forest-lab/transfer-batch4-assets.mjs snapshot|verify|export --to <folder>|restore --from <folder> [--to <folder>]');
