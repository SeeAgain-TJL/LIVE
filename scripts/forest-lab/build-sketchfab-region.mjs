// Maps the 38 original tree transforms in game-region/region.json to LOLIPOP pine-pack variants (CC BY 4.0).
// Position and yaw come from the original tree; the model is scaled so its height matches the original.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root = 'public/forest-origin-assets';
// LOD0 heights (m, Y-up) measured from the pack in Blender.
const height = { large_1: 31.17, large_2: 31.0, large_3: 29.62, big_1: 16.31, big_2: 15.32, big_3: 18.65, medium_1: 13.34, medium_2: 12.02, medium_3: 10.02 };
const pools = [
  [21, ['large_1', 'large_2', 'large_3']],
  [16.5, ['big_3', 'big_1', 'big_2']],
  [0, ['big_1', 'big_2', 'medium_1']],
];
const region = JSON.parse(await readFile(`${root}/game-region/region.json`, 'utf8'));
const trees = [];
for (const tree of region.trees) {
  const m = tree.matrix;
  const scale = Math.hypot(m[0][0], m[1][0], m[2][0]);
  const meta = JSON.parse(await readFile(`${root}/batch2/impostors/${tree.source}.json`, 'utf8'));
  const target = meta.bounds.max[1] * scale;
  const pool = pools.find(([min]) => target >= min)[1];
  const variant = pool[Math.abs(tree.persistentId) % pool.length];
  // Blender Z-up -> three Y-up: C = (x, y, z) -> (x, z, -y). Keep the unit rotation (incl. tilt): C R C^T, row-major.
  const R = [0, 1, 2].map(r => [0, 1, 2].map(c => m[r][c] / scale));
  const C = [[1, 0, 0], [0, 0, 1], [0, -1, 0]];
  const mul = (a, b) => a.map((row, i) => b[0].map((_, j) => row.reduce((s, _, k) => s + a[i][k] * b[k][j], 0)));
  const Ct = C[0].map((_, i) => C.map(row => row[i]));
  const basis = mul(mul(C, R), Ct).flat().map(v => +v.toFixed(5));
  trees.push({
    id: tree.persistentId, source: tree.source, variant,
    position: [+m[0][3].toFixed(3), +m[2][3].toFixed(3), +(-m[1][3]).toFixed(3)],
    basis,
    scale: +(target / height[variant]).toFixed(4),
    targetHeight: +target.toFixed(2),
  });
}
await mkdir(`${root}/sketchfab-region`, { recursive: true });
await writeFile(`${root}/sketchfab-region/region.json`, JSON.stringify({ center: region.center, radius: region.radius, trees }, null, 2) + '\n');
const count = {}; for (const t of trees) count[t.variant] = (count[t.variant] ?? 0) + 1;
const scales = trees.map(t => t.scale);
console.log({ trees: trees.length, count, scaleMin: Math.min(...scales), scaleMax: Math.max(...scales) });