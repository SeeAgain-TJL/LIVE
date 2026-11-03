import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=path.resolve('public/forest-origin-assets');
const source=JSON.parse(await readFile(path.join(root,'runtime-tiles/manifest.json')));
const inventory=JSON.parse(await readFile(path.join(root,'render-inventory.json')));
const propNames=inventory.sourceMeshAssets.map(asset=>asset.name);
const names=[...propNames,...Object.keys(inventory.treeSpeciesCounts)];
const destination=path.join(root,'batch2/tiles');await mkdir(destination,{recursive:true});
const manifest={sourceSha256:source.sourceSha256,tileSize:32,sourcePartitions:60,propAssetCount:114,names,tiles:{},format:'Float32 little-endian, stride 13: asset index then source 3x4 row-major matrix. All original instances; no density thinning.'};
let maxError=0;
for(const key of Object.keys(source.tiles)) {
  const tile=JSON.parse(gunzipSync(await readFile(path.join(root,'runtime-tiles',`${key}.json.gz`))));
  const count=tile.props.length+tile.trees.length;
  const packed=new Float32Array(count*13);
  let cursor=0;
  for(const [index,rows] of [...tile.props.map(([index,rows])=>[names.indexOf(inventory.sourceAssetNames[index]),rows]),...tile.trees.map(t=>[names.indexOf(t.source),t.matrix])]) {
    assert.ok(index>=0 && index<names.length);
    packed[cursor++]=index;
    for(const row of rows.slice(0,3)) for(const value of row) {packed[cursor]=value;maxError=Math.max(maxError,Math.abs(value-packed[cursor++]));}
  }
  assert.equal(cursor,packed.length);
  const compressed=gzipSync(Buffer.from(packed.buffer),{level:7});
  await writeFile(path.join(destination,`${key}.bin.gz`),compressed);
  manifest.tiles[key]={trees:tile.trees.length,props:tile.props.length,bytes:compressed.length};
}
manifest.maxFloat32AbsoluteError=maxError;
manifest.totals=Object.values(manifest.tiles).reduce((s,t)=>({trees:s.trees+t.trees,props:s.props+t.props,bytes:s.bytes+t.bytes}),{trees:0,props:0,bytes:0});
assert.equal(manifest.totals.props,879825);assert.equal(manifest.totals.trees,585);
await writeFile(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({partitions:Object.keys(manifest.tiles).length,totals:manifest.totals,maxError}));
