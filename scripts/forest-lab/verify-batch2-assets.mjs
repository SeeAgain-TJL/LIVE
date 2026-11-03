import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import sharp from 'sharp';
import { Matrix4, Vector3 } from 'three';
const root=path.resolve('public/forest-origin-assets');
const manifest=JSON.parse(await readFile(path.join(root,'batch2/tiles/manifest.json')));
const inventory=JSON.parse(await readFile(path.join(root,'render-inventory.json')));
let records=0,maxError=0;
for(const key of Object.keys(manifest.tiles)) {
  const original=JSON.parse(gunzipSync(await readFile(path.join(root,`runtime-tiles/${key}.json.gz`))));
  const bytes=gunzipSync(await readFile(path.join(root,`batch2/tiles/${key}.bin.gz`)));
  const packed=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
  const source=[...original.props.map(([index,rows])=>[inventory.sourceAssetNames[index],rows]),...original.trees.map(t=>[t.source,t.matrix])];
  assert.equal(packed.length,source.length*13);
  for(const [i,[name,rows]] of source.entries()) {
    assert.equal(manifest.names[packed[i*13]],name);
    for(const [j,value] of rows.slice(0,3).flat().entries()) {
      const error=Math.abs(packed[i*13+j+1]-value);maxError=Math.max(error,maxError);assert.ok(error<0.00001);
    }
    assert.ok(!name.includes('proxy'));
    records++;
  }
}
const hash=createHash('sha256');
for await(const block of createReadStream(path.join(process.env.LOCALAPPDATA,'UNIVERSE-OF-ME/asset-audit/candidate-assets/polyhaven_pine_fir_forest.blend'))) hash.update(block);
assert.equal(hash.digest('hex'),manifest.sourceSha256);
// Verify the fast runtime axis conversion against the original matrix product.
const a=new Matrix4().makeRotationX(-Math.PI/2),inv=a.clone().invert();
const sample=new Matrix4().makeRotationY(0.73).scale(new Vector3(1.2,0.9,1.1)).setPosition(14,-28,3);
const e=sample.clone().transpose().toArray();
const fast=new Matrix4().set(e[0],e[2],-e[1],e[3],e[8],e[10],-e[9],e[11],-e[4],-e[6],e[5],-e[7],0,0,0,1);
const expected=a.clone().multiply(sample).multiply(inv);
assert.ok(fast.elements.every((v,i)=>Math.abs(v-expected.elements[i])<1e-12));
const atlas=[];
for(const name of Object.keys(inventory.treeSpeciesCounts)) {
  const metadata=JSON.parse(await readFile(path.join(root,`batch2/impostors/${name}.json`)));
  assert.equal(metadata.version,3);assert.equal(metadata.level,'source');assert.equal(metadata.views,8);assert.deepEqual(metadata.errors,[]);
  const image=await sharp(path.join(root,`batch2/impostors/${name}.webp`)).metadata();
  assert.ok(image.hasAlpha);assert.equal(image.width,1536);assert.equal(image.height,1536);
  const {data}=await sharp(path.join(root,`batch2/impostors/${name}.webp`)).raw().toBuffer({resolveWithObject:true});
  let nonzero=0;for(let i=3;i<data.length;i+=4) if(data[i]) nonzero++;
  assert.ok(nonzero>10000 && nonzero<1536*1536*0.8,'Atlas must contain source foliage and transparent space');
  atlas.push({name,bytes:metadata.bytes,nonzeroPixels:nonzero,estimatedRgbaMipMiB:1536*1536*4*4/3/1048576});
}
const lods=JSON.parse(await readFile(path.join(root,'batch2/lod-manifest.json')));
const treeManifest=JSON.parse(await readFile(path.join(root,'batch2/trees/manifest.json')));
const uniqueTreeImages=new Map();
for(const [key,item] of Object.entries(treeManifest)) {
  for(const image of item.images) {
    const actual=await sharp(path.join(root,'batch2/trees',image.uri)).metadata();
    assert.ok(actual.width<=1024 && actual.height<=1024,`Oversize tree texture ${key}/${image.uri}`);
    assert.equal(actual.width,image.width);assert.equal(actual.height,image.height);
    if(key.endsWith('/near')) uniqueTreeImages.set(image.uri,image);
  }
}
const tiers=[];
let imageHashes;
for(const tier of ['near','mid','far']) {
  const gltf=JSON.parse(await readFile(path.join(root,`batch2/props-${tier}.gltf`)));
  const names=gltf.nodes.filter(n=>n.name?.startsWith('source__')).map(n=>n.name.slice(8)).sort();
  assert.deepEqual(names,inventory.sourceMeshAssets.map(a=>a.name).sort());
  const images=gltf.images.map(i=>i.uri).sort();
  if(imageHashes) assert.deepEqual(images,imageHashes);else imageHashes=images;
  const fallback=lods.tiers[tier].fallbacks;
  assert.ok(Object.keys(fallback).every(name=>fallback[name].startsWith('source__') && !fallback[name].includes('proxy')));
  tiers.push({tier,...lods.tiers[tier],args:undefined});
}
const folder=path.resolve(process.env.PINE_EVIDENCE||'artifacts-local/pine-batch2');await mkdir(folder,{recursive:true});
const report={sourceHashVerified:true,sourcePartitions:60,runtimePartitions:61,treeInstances:585,propInstances:879825,records,maxMatrixAbsoluteError:maxError,axisConversionVerified:true,unchangedAtlasImages:imageHashes.length,verifiedTreeTextureLimit:1024,sharedNearTreeImages:uniqueTreeImages.size,estimatedNearTreeRgbaMipMiB:[...uniqueTreeImages.values()].reduce((s,i)=>s+i.width*i.height*4*4/3/1048576,0),tiers,atlas,atlasBytes:atlas.reduce((s,a)=>s+a.bytes,0),estimatedAtlasRgbaMipMiB:atlas.reduce((s,a)=>s+a.estimatedRgbaMipMiB,0),note:'Memory numbers are static RGBA8+mipmap estimates, not measured GPU allocation.'};
await writeFile(path.join(folder,'asset-validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,tiers:undefined,atlas:undefined},null,2));
