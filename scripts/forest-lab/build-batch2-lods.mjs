import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// gltfpack owns mesh simplification/attribute error control. This script only
// packages the output, sharing the unchanged 1K image bytes between all tiers.
const root = path.resolve('public/forest-origin-assets');
const output = path.join(process.env.LOCALAPPDATA,'UNIVERSE-OF-ME/asset-audit/candidate-assets/pine-source-conversion/batch2');
const publish = path.join(root,'batch2');
const tool = path.join(process.env.LOCALAPPDATA,'UNIVERSE-OF-ME/tools/gltfpack-1.3/gltfpack.exe');
await mkdir(output,{recursive:true}); await mkdir(path.join(publish,'textures'),{recursive:true});
const manifest = {tool:'meshoptimizer gltfpack 1.3',source:'source-props-web-1k.glb',tiers:{}};
for(const [tier,ratio,error] of [['near',0.25,0.003],['mid',0.04,0.01],['far',0.008,0.02]]) {
  const file=path.join(output,`props-${tier}.glb`);
  const args=['-i',path.join(root,manifest.source),'-o',file,'-c','-kn','-km','-si',String(ratio),'-se',String(error)];
  if(!await stat(file).catch(()=>null)) {
    const result=spawnSync(tool,args,{encoding:'utf8',maxBuffer:4*1024*1024});
    if(result.status!==0) throw Error(result.stderr || result.stdout);
  }
  const bytes=await readFile(file);
  const length=bytes.readUInt32LE(12);
  const gltf=JSON.parse(bytes.subarray(20,20+length));
  const binary=bytes.subarray(28+length);
  // Images are separate content-addressed files. All tiers use the verified
  // original 1K atlas bytes: no new 4K path or extra GPU texture set per LOD.
  for(const image of gltf.images) {
    const view=gltf.bufferViews[image.bufferView];
    const data=binary.subarray(view.byteOffset,view.byteOffset+view.byteLength);
    const hash=createHash('sha256').update(data).digest('hex').slice(0,20);
    const filename=`textures/${hash}.webp`;
    await writeFile(path.join(publish,filename),data);
    image.uri=filename;delete image.bufferView;
  }
  // Keep only geometry buffer ranges. Image bufferViews are not referenced
  // after externalization, so truncating the unused tail is safe.
  const used=new Set();
  for(const accessor of gltf.accessors) if(accessor.bufferView!==undefined) used.add(accessor.bufferView);
  const blocks=[];
  let offset=0;
  for(const i of used) {
    const view=gltf.bufferViews[i];
    const range=view.extensions?.EXT_meshopt_compression || view;
    if(range.buffer!==0) throw Error('Unexpected non-meshopt geometry buffer');
    const padding=(4-offset%4)%4;
    if(padding) {blocks.push(Buffer.alloc(padding));offset+=padding;}
    blocks.push(binary.subarray(range.byteOffset || 0,(range.byteOffset || 0)+range.byteLength));
    range.byteOffset=offset;offset+=range.byteLength;
  }
  // Remove image-only views: avoid dangling byte ranges in valid glTF.
  const remap=new Map();
  gltf.bufferViews=gltf.bufferViews.filter((v,i)=>{if(!used.has(i)) return false;remap.set(i,remap.size);return true;});
  for(const accessor of gltf.accessors) if(accessor.bufferView!==undefined) accessor.bufferView=remap.get(accessor.bufferView);
  const geometry=Buffer.concat(blocks);
  gltf.buffers[0].uri=`props-${tier}.bin`;gltf.buffers[0].byteLength=geometry.length;
  await writeFile(path.join(publish,`props-${tier}.bin`),geometry);
  await writeFile(path.join(publish,`props-${tier}.gltf`),JSON.stringify(gltf));
  const triangles=gltf.meshes.flatMap(m=>m.primitives).reduce((s,p)=>s+gltf.accessors[p.indices].count/3,0);
  const names=gltf.nodes.filter(n=>n.name?.startsWith('source__')).map(n=>n.name);
  if(names.length!==114) throw Error(`Lost source objects: ${names.length}`);
  function hasGeometry(node) {return node.mesh!==undefined || node.children?.some(i=>hasGeometry(gltf.nodes[i]));}
  const fallbacks={};
  for(const node of gltf.nodes.filter(n=>n.name?.startsWith('source__') && !hasGeometry(n))) {
    const counterpart=node.name.replace(/_lod([01])$/,(_,level)=>`_lod${1-Number(level)}`);
    if(!gltf.nodes.some(n=>n.name===counterpart && hasGeometry(n))) throw Error(`No source-native fallback for ${node.name}`);
    fallbacks[node.name]=counterpart;
  }
  manifest.tiers[tier]={ratio,error,triangles,geometryBytes:geometry.length,sourceObjects:names.length,fallbacks,args};
  console.log(tier,manifest.tiers[tier]);
}
await writeFile(path.join(publish,'lod-manifest.json'),JSON.stringify(manifest,null,2));
await writeFile(path.join(output,'lod-manifest.json'),JSON.stringify(manifest,null,2));
