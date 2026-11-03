import { readFile, open, mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const root = path.resolve('public/forest-origin-assets');
const output = path.resolve('artifacts-local/pine-batch2');
await mkdir(output, { recursive: true });
export async function glbJson(file) {
  const handle = await open(file, 'r');
  try {
    const header = Buffer.alloc(20);
    await handle.read(header, 0, 20, 0);
    const buffer = Buffer.alloc(header.readUInt32LE(12));
    await handle.read(buffer, 0, buffer.length, 20);
    return JSON.parse(buffer.toString('utf8'));
  } finally { await handle.close(); }
}
function primitives(gltf, node) {
  return [...(gltf.meshes?.[node.mesh]?.primitives || []), ...(node.children || []).flatMap(i => primitives(gltf, gltf.nodes[i]))];
}
function cost(gltf, list) {
  return list.reduce((sum, p) => {
    const triangles = gltf.accessors[p.indices].count / 3;
    const m = gltf.materials[p.material];
    const twice = m.alphaMode === 'BLEND' && m.doubleSided;
    sum.geometry += triangles;
    sum.submitted += triangles * (twice ? 2 : 1);
    sum.calls += twice ? 2 : 1;
    if (m.name?.includes('twig')) sum.twig += triangles;
    return sum;
  }, { geometry: 0, submitted: 0, calls: 0, twig: 0 });
}
const inventory = JSON.parse(await readFile(path.join(root, 'render-inventory.json')));
const trees = JSON.parse(await readFile(path.join(root, 'source-tree-placements.json')));
const preview = JSON.parse(gunzipSync(await readFile(path.join(root, 'source-camera-preview.json.gz'))));
const distance = rows => Math.hypot(rows[0][3] - 23.155473709106445, rows[1][3] + 47.55979919433594);
const nearTrees = trees.map(t => ({ ...t, distance: distance(t.matrix) })).filter(t => t.distance < 65).sort((a,b) => a.distance-b.distance).slice(0,170);
const nearProps = preview.records.map(([index, rows]) => ({ name: inventory.sourceAssetNames[index], distance: distance(rows) })).filter(t => t.distance < 65).sort((a,b) => a.distance-b.distance).slice(0,18000);
const treeCosts = {};
for (const source of Object.keys(inventory.treeSpeciesCounts)) {
  treeCosts[source] = {};
  for (const lod of ['lod03','lod01','lod003']) {
    const gltf = await glbJson(path.join(root, 'trees', `${source}-${lod}-meshopt-webp.glb`));
    treeCosts[source][lod] = cost(gltf, gltf.meshes.flatMap(m => m.primitives));
  }
}
const props = await glbJson(path.join(root,'source-props-web-1k.glb'));
const propCosts = Object.fromEntries(props.nodes.filter(n => n.name?.startsWith('source__')).map(n => [n.name.slice(8), cost(props, primitives(props,n))]));
const summary = new Map();
function add(category, name, item) {
  const key = `${category}/${name}`;
  const row = summary.get(key) || { category, name, instances:0, geometry:0, submitted:0, twig:0 };
  row.instances++; row.geometry += item.geometry; row.submitted += item.submitted; row.twig += item.twig;
  summary.set(key,row);
}
for (const t of nearTrees) { const lod = t.distance < 18 ? 'lod03' : 'lod01'; add('trees',`${t.source}/${lod}`,treeCosts[t.source][lod]); }
for (const p of nearProps) add('props', p.name, propCosts[p.name]);
const rows = [...summary.values()].sort((a,b) => b.submitted-a.submitted);
const totals = Object.fromEntries(['trees','props'].map(category => [category,rows.filter(x=>x.category===category).reduce((s,x)=>({ instances:s.instances+x.instances, geometry:s.geometry+x.geometry, submitted:s.submitted+x.submitted, twig:s.twig+x.twig }),{instances:0,geometry:0,submitted:0,twig:0})]));
const result = { totals, rows, treeCosts, propCosts, note:'Static accessor count; submitted assumes r180 double pass for transparent DoubleSide. Does not include terrain or frustum rejection.' };
await writeFile(path.join(output,'geometry-audit.json'), JSON.stringify(result,null,2));
console.log(JSON.stringify({totals,top:rows.slice(0,18)},null,2));
