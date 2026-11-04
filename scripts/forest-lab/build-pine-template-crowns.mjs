// Recover a bounded layer of world-fixed needle silhouettes from the already
// exported source trees. No Blender scene or existing export is rewritten.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Vector3 } from 'three';

const root='public/forest-origin-assets', out=path.join(root,'template-crowns');
await mkdir(out,{recursive:true});
await MeshoptDecoder.ready;
const tool=path.join(process.env.LOCALAPPDATA,'UNIVERSE-OF-ME/tools/gltfpack-1.3/gltfpack.exe');
const authoring='artifacts-local/pine-template-crowns/authoring';
await mkdir(authoring,{recursive:true});
const reports=[];
const selected=['pine_02','pine_04','silver_fir_04'];
for(const name of selected) {
  const input=path.join(root,'batch2/trees',name+'-near');
  const gltf=JSON.parse(await readFile(input+'.gltf','utf8')), file=await readFile(input+'.bin');
  const node=gltf.nodes.find(n=>n.mesh!==undefined);
  const twig=gltf.meshes[node.mesh].primitives.find(p=>gltf.materials[p.material].name.includes('_twig_'));
  const acc=gltf.accessors[twig.attributes.POSITION], idx=gltf.accessors[twig.indices];
  assert.equal(acc.componentType,5123);
  const decode=a=>{
    const view=gltf.bufferViews[a.bufferView], e=view.extensions.EXT_meshopt_compression;
    const buffer=Buffer.alloc(view.byteLength);
    MeshoptDecoder.decodeGltfBuffer(buffer,e.count,e.byteStride,file.subarray(e.byteOffset,e.byteOffset+e.byteLength),e.mode,e.filter);
    return buffer;
  };
  const positions=decode(acc), indices=decode(idx), stride=gltf.bufferViews[acc.bufferView].byteStride;
  const points=[new Vector3(),new Vector3(),new Vector3()];
  const point=(index,target)=>{
    const i=acc.byteOffset+stride*index;
    return target.set(...[0,1,2].map(k=>positions.readUInt16LE(i+k*2)*node.scale[k]+node.translation[k]));
  };
  const indexSize=idx.componentType===5125 ? 4:2;
  const index=i=>indices.readUIntLE((idx.byteOffset||0)+indexSize*i,indexSize);
  const center=new Vector3(), axis=new Vector3(), normal=new Vector3(), width=new Vector3(), scratch=new Vector3();
  const cells=new Map();
  for(let i=0;i<idx.count;i+=21) {
    for(let k=0;k<3;k++)point(index(i+k),points[k]);
    const [a,b,c]=points;
    center.copy(a).add(b).add(c).multiplyScalar(1/3);
    if(center.y<2.6 || Math.hypot(center.x,center.z)<.55)continue;
    const ab=a.distanceToSquared(b),bc=b.distanceToSquared(c),ca=c.distanceToSquared(a);
    const max=Math.sqrt(Math.max(ab,bc,ca));
    if(max<.047 || max>.37)continue;
    normal.subVectors(b,a).cross(scratch.subVectors(c,a));
    const aspect=normal.length()/(max*max);
    if(aspect<.018 || aspect>.29)continue; // narrow original needle triangles, not broad bark planes
    if(ab>=bc && ab>=ca)axis.subVectors(b,a);
    else if(bc>=ca)axis.subVectors(c,b);else axis.subVectors(a,c);
    axis.normalize();normal.normalize();width.crossVectors(normal,axis).normalize();
    const key=[center.x,center.y,center.z].map(v=>Math.floor(v/.27)).join('/');
    const cell=cells.get(key)||[];
    if(cell.length===3)continue;
    cell.push([center.clone(),axis.clone(),width.clone(),normal.clone(),max,aspect]);cells.set(key,cell);
  }
  const raw=[],normals=[],colors=[];
  const boundsMin=[Infinity,Infinity,Infinity],boundsMax=[-Infinity,-Infinity,-Infinity];
  const fir=name.startsWith('silver');
  let sampled=0;
  for(const cell of cells.values())for(const [origin,tangent,side,n,size,aspect] of cell) {
    const halfLength=Math.min(.085,Math.max(.035,size*.40));
    const halfWidth=Math.min(.015,Math.max(.007,size*aspect*.85));
    const varied=.78+.44*(.5+.5*Math.sin(sampled*2.399963229));
    const color=(fir ? [.043,.073,.028]:[.038,.068,.023]).map(v=>v*varied);
    const base=origin.clone().addScaledVector(tangent,-halfLength);
    const tip=origin.clone().addScaledVector(tangent,halfLength);
    const left=origin.clone().addScaledVector(side,halfWidth);
    const right=origin.clone().addScaledVector(side,-halfWidth);
    const crease=origin.clone().addScaledVector(n,.009);
    for(const [v,shade] of [[base,.82],[left,1.01],[crease,1.15],[left,1.01],[tip,.83],[crease,1.15],
      [tip,.83],[right,.88],[crease,1.1],[right,.88],[base,.82],[crease,1.1]]) {
      const xyz=v.toArray();raw.push(...xyz);normals.push(...n.toArray());colors.push(...color.map(x=>x*shade));
      xyz.forEach((x,k)=>{boundsMin[k]=Math.min(boundsMin[k],x);boundsMax[k]=Math.max(boundsMax[k],x);});
    }
    sampled++;
  }
  assert.ok(sampled>400 && sampled<12000,`${name}: ${sampled}`);
  const parts=[raw,normals,colors].map(values=>Buffer.from(new Float32Array(values).buffer));
  let offset=0;
  const views=parts.map(part=>{const view={buffer:0,byteOffset:offset,byteLength:part.length,target:34962};offset+=part.length;return view;});
  const asset={asset:{version:'2.0',generator:'Pine Forest source needle layer'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],
    buffers:[{byteLength:offset}],bufferViews:views,accessors:views.map((_,bufferView)=>({bufferView,componentType:5126,count:raw.length/3,type:'VEC3',
      ...(bufferView===0?{min:boundsMin,max:boundsMax}:{})})),
    meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,COLOR_0:2},material:0}]}],
    materials:[{name:'Pine source needle volume',doubleSided:true,pbrMetallicRoughness:{metallicFactor:0,roughnessFactor:.94}}]};
  const str=JSON.stringify(asset), meta=Buffer.from(str.padEnd(Math.ceil(str.length/4)*4,' '));
  const header=Buffer.alloc(20), binHeader=Buffer.alloc(8);
  header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+meta.length+offset,8);
  header.writeUInt32LE(meta.length,12);header.write('JSON',16);binHeader.writeUInt32LE(offset);binHeader.write('BIN\0',4);
  const rawPath=path.join(authoring,name+'.glb');
  await writeFile(rawPath,Buffer.concat([header,meta,binHeader,...parts]));
  const packed=spawnSync(tool,['-i',rawPath,'-o',path.join(out,name+'.glb'),'-c','-km'],{encoding:'utf8'});
  if(packed.status!==0)throw Error(packed.stderr || String(packed.error));
  reports.push({species:name,sourceTriangles:idx.count/3,retainedNeedles:sampled,addedTriangles:raw.length/9,bounds:[boundsMin,boundsMax]});
}
await writeFile(path.join(out,'production.json'),JSON.stringify(reports,null,2)+'\n');
console.log(reports.map(({species,retainedNeedles,addedTriangles})=>({species,retainedNeedles,addedTriangles})));
