// Match the existing scenic rim to the *evaluated source mesh perimeter*.
// Keep the previous scenic placement count; replace analytic root elevations
// with the actual rendered rim triangles. No walkable terrain is expanded.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const root='public/forest-origin-assets',out=path.join(root,'template-edge');
await mkdir(out,{recursive:true});
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const bytes=await readFile(path.join(root,'environment/terrain.glb'));
const length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.toString('utf8',20,20+length)),bin=bytes.subarray(length+28);
const primitive=gltf.meshes[0].primitives[0], grid=new Map();
function vector(accessor,index,dim) {
  const a=gltf.accessors[accessor],view=gltf.bufferViews[a.bufferView];
  assert.equal(a.componentType,5126);
  return Array.from({length:dim},(_,i)=>bin.readFloatLE((view.byteOffset||0)+(a.byteOffset||0)+index*(view.byteStride||dim*4)+i*4));
}
for(let i=0;i<gltf.accessors[primitive.attributes.POSITION].count;i++) {
  const uv=vector(primitive.attributes.TEXCOORD_0,i,2);
  grid.set(uv.map(v=>Math.round(v*256)).join('/'),vector(primitive.attributes.POSITION,i,3));
}
assert.equal(grid.size,257*257);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
function source(u,v) {
  const x=clamp(u*256,0,256),z=clamp(v*256,0,256),i=Math.min(255,Math.floor(x)),j=Math.min(255,Math.floor(z));
  const corners=[[i,j],[i+1,j],[i,j+1],[i+1,j+1]].map(p=>grid.get(p.join('/')));
  const a=x-i,b=z-j;
  return [0,1,2].map(k=>(1-b)*((1-a)*corners[0][k]+a*corners[1][k])+b*((1-a)*corners[2][k]+a*corners[3][k]));
}
const steps=1024,distances=[-.48,0,1.25,3.5,7,12,20,32,50,76,110,165,255,410,540];
const positions=[],uvs=[],indices=[];
for(const d of distances)for(let i=0;i<steps;i++) {
  const side=Math.floor(i/(steps/4)),t=i/(steps/4)-side;
  const [u,v]=[[t,0],[1,t],[1-t,1],[0,1-t]][side];
  const [dx,dz]=[[0,-1],[1,0],[0,1],[-1,0]][side];
  const edge=source(u,v),inner=source(u-dx/256,v-dz/256);
  const distance=Math.hypot(edge[0]-inner[0],edge[2]-inner[2]);
  const slope=clamp((edge[1]-inner[1])/Math.max(.3,distance),-.7,.7);
  const x=edge[0]+dx*d,z=edge[2]+dz*d;
  const distant=1-Math.exp(-Math.max(0,d)/72);
  const lift=2.1*Math.sin(.034*x+.028*z)+1.9*Math.sin(.072*z-.019*x)+Math.max(0,d)*.025;
  const y=d<0 ? source(u+dx*d/200,v+dz*d/200)[1]-.08 : edge[1]-.035+slope*d*Math.exp(-d/12)+distant*lift;
  positions.push(x,y,z);uvs.push(u+dx*d/200,v+dz*d/200);
}
for(let ring=1;ring<distances.length;ring++)for(let i=0;i<steps;i++) {
  const a=(ring-1)*steps+i,b=(ring-1)*steps+(i+1)%steps,c=ring*steps+i,e=ring*steps+(i+1)%steps;
  indices.push(a,b,c,b,e,c);
}
// Intersect the generated triangles vertically so roots agree with the actual
// triangulated surface, including the wide rings and sloping source edge.
function groundAt(x,z) {
  for(let i=0;i<indices.length;i+=3) {
    const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
    const den=(positions[b+2]-positions[c+2])*(positions[a]-positions[c])+(positions[c]-positions[b])*(positions[a+2]-positions[c+2]);
    if(Math.abs(den)<1e-10)continue;
    const u=((positions[b+2]-positions[c+2])*(x-positions[c])+(positions[c]-positions[b])*(z-positions[c+2]))/den;
    const v=((positions[c+2]-positions[a+2])*(x-positions[c])+(positions[a]-positions[c])*(z-positions[c+2]))/den;
    if(u<-.00001||v<-.00001||u+v>1.00001)continue;
    return u*positions[a+1]+v*positions[b+1]+(1-u-v)*positions[c+1];
  }
  throw Error(`No rim below ${x},${z}`);
}
const previous=await read(path.join(root,'visual-finish/edge-stands.json'));
const stands=previous.map(([x,,z,speciesScale,variant])=>[x,+groundAt(x,z).toFixed(5),z,speciesScale,variant]);
assert.equal(stands.length,previous.length);
const {data,info}=await sharp(path.join(root,'visual-finish/edge-crowns.webp')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const rootUv=[];
for(let variant=0;variant<4;variant++) {
  let row=0,sum=0,count=0;
  for(let y=Math.floor(info.height*.6);y<info.height;y++) {
    let n=0,sx=0;
    for(let x=variant*128+24;x<variant*128+104;x++)if(data[(y*info.width+x)*4+3]>130){n++;sx+=x-variant*128;}
    if(n>0){row=y;sum=sx;count=n;}
  }
  assert.ok(row>info.height*.7&&count>0);
  rootUv.push([sum/count/128-.5,1-(row+.5)/info.height]);
}
await writeFile(path.join(out,'edge-ground.json'),JSON.stringify({positions,uvs,indices})+'\n');
await writeFile(path.join(out,'edge-stands.json'),JSON.stringify({stands,rootUv})+'\n');
const maxRootError=Math.max(...stands.map(([x,y,z])=>Math.abs(y-groundAt(x,z))));
assert.ok(maxRootError<.00001);
const report={sourceVertices:grid.size,rimVertices:positions.length/3,rimTriangles:indices.length/3,scenicTrees:stands.length,rootUv,maxRootError,
  originalBoundaryVerticalOffset:-.035,walkableTerrainChanged:false};
await writeFile(path.join(out,'production.json'),JSON.stringify(report,null,2)+'\n');
console.log(report);
