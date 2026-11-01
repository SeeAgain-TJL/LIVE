// Reproducible, verified CC0 source downloads. Run with: node scripts/world-slice/download-polyhaven.mjs
// Sources stay outside Git; only optimized browser assets are published.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'UNIVERSE-OF-ME', 'world-slice-source') : join(process.cwd(), '.world-slice-source');
const models = ['island_tree_02', 'island_tree_01', 'fern_02', 'shrub_03', 'rock_moss_set_01'];
const textures = ['leafy_grass', 'coast_sand_04', 'aerial_grass_rock'];
const sky = 'kloofendal_48d_partly_cloudy_puresky';
async function json(url) { const response = await fetch(url); if (!response.ok) throw new Error(`${response.status} ${url}`); return response.json(); }
async function download(spec, path) {
  const existing = await readFile(path).catch(() => null);
  if (existing?.length === spec.size && createHash('md5').update(existing).digest('hex') === spec.md5) return;
  const response = await fetch(spec.url);
  if (!response.ok) throw new Error(`${response.status} ${spec.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const md5 = createHash('md5').update(bytes).digest('hex');
  if (bytes.length !== spec.size || md5 !== spec.md5) throw new Error(`Checksum/size mismatch: ${path}`);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, bytes);
  console.log(`${path} (${(bytes.length / 1048576).toFixed(2)} MiB)`);
}
for (const id of models) {
  const files = await json(`https://api.polyhaven.com/files/${id}`);
  const gltf = files.gltf?.['1k']?.gltf;
  if (!gltf) throw new Error(`No 1k glTF for ${id}`);
  const dir = join(root, 'models', id);
  await download(gltf, join(dir, `${id}_1k.gltf`));
  for (const [name, spec] of Object.entries(gltf.include)) await download(spec, join(dir, name));
}
for (const id of textures) {
  const files = await json(`https://api.polyhaven.com/files/${id}`);
  for (const [channel, suffix] of [['Diffuse', 'diff'], ['nor_gl', 'normal']]) {
    await download(files[channel]['1k'].jpg, join(root, 'textures', `${id}_${suffix}.jpg`));
  }
}
const skyFiles = await json(`https://api.polyhaven.com/files/${sky}`);
await download(skyFiles.hdri['2k'].hdr, join(root, 'sky', `${sky}_2k.hdr`));
console.log(`Verified Poly Haven source cache: ${root}`);
