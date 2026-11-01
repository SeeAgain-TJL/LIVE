// Verified Poly Haven CC0 coastal scans. Original source stays outside Git.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(process.env.LOCALAPPDATA, 'UNIVERSE-OF-ME', 'world-slice-source', 'r2');
const ids = ['coast_line_01', 'coastal_cliff_02', 'coast_rocks_01'];
async function fetchJson(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status}: ${url}`); return r.json(); }
async function verified(spec, destination) {
  const previous = await readFile(destination).catch(() => null);
  if (previous?.length === spec.size && createHash('md5').update(previous).digest('hex') === spec.md5) return;
  const r = await fetch(spec.url); if (!r.ok) throw new Error(`${r.status}: ${spec.url}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.length !== spec.size || createHash('md5').update(bytes).digest('hex') !== spec.md5) throw new Error(`Bad asset checksum: ${destination}`);
  await mkdir(join(destination, '..'), { recursive: true });
  await writeFile(destination, bytes);
  console.log(`${destination}: ${(bytes.length / 1048576).toFixed(1)} MiB`);
}
for (const id of ids) {
  const files = await fetchJson(`https://api.polyhaven.com/files/${id}`);
  const gltf = files.gltf?.['1k']?.gltf;
  if (!gltf) throw new Error(`No 1K glTF: ${id}`);
  const dir = join(root, id);
  await verified(gltf, join(dir, `${id}_1k.gltf`));
  for (const [name, spec] of Object.entries(gltf.include)) await verified(spec, join(dir, name));
}
