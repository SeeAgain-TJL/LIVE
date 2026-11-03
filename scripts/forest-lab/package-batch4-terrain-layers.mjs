import sharp from 'sharp';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const source = path.resolve('artifacts-local/pine-batch4/blender/terrain-layers');
const output = path.resolve('public/forest-origin-assets/batch4/terrain');
await mkdir(output, { recursive: true });
const layers = JSON.parse(await readFile(path.join(source, 'layers.json'), 'utf8'));

const report = { source: 'Blender 4.4.3 original forest_leaves_04/forest_ground_04/rocky_trail materials and path/river masks, byte-identical textures resized only', materials: [] };
for (const material of layers.materials) {
  const entry = { name: material.name, maps: {} };
  for (const [suffix, map] of Object.entries(material.maps)) {
    const input = await readFile(path.join(source, map.path));
    const size = suffix === 'diff' ? 2048 : suffix === 'nor_gl' ? 1024 : 512;
    const data = suffix === 'diff'
      ? await sharp(input).resize(size, size).webp({ quality: 90 }).toBuffer()
      : await sharp(input).resize(size, size).webp({ quality: 88 }).toBuffer();
    const name = `${material.name}_${suffix}.webp`;
    await writeFile(path.join(output, name), data);
    entry.maps[suffix] = { path: name, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), width: size, height: size };
  }
  report.materials.push(entry);
}
await copyFile(path.join(source, 'terrain-masks.glb'), path.join(output, 'terrain-masks.glb'));
report.masks = layers.masks;
report.vertices = layers.vertices;
report.polygons = layers.polygons;
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(report, null, 2));
console.log(report);
