import { readFile,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

/** Separate meshopt geometry from content-addressed, actually resized images.
 * gltfpack can pass existing WebP images through without applying -tl. */
export async function packageSharedGlb(input,output,stem,textureLimit) {
  await mkdir(path.join(output,'textures'),{recursive:true});
  const bytes=await readFile(input),length=bytes.readUInt32LE(12);
  const gltf=JSON.parse(bytes.subarray(20,20+length)),binary=bytes.subarray(28+length);
  const images=[];
  for(const image of gltf.images) {
    const view=gltf.bufferViews[image.bufferView];
    const source=binary.subarray(view.byteOffset || 0,(view.byteOffset || 0)+view.byteLength);
    const data=await sharp(source).resize({width:textureLimit,height:textureLimit,fit:'inside',withoutEnlargement:true}).webp({quality:90,alphaQuality:100}).toBuffer();
    const hash=createHash('sha256').update(data).digest('hex').slice(0,20);
    image.uri=`textures/${hash}.webp`;delete image.bufferView;image.mimeType='image/webp';
    await writeFile(path.join(output,image.uri),data);
    const metadata=await sharp(data).metadata();images.push({uri:image.uri,bytes:data.length,width:metadata.width,height:metadata.height});
  }
  const used=new Set(gltf.accessors.filter(a=>a.bufferView!==undefined).map(a=>a.bufferView));
  const blocks=[];let offset=0;const remap=new Map();
  gltf.bufferViews=gltf.bufferViews.filter((view,i)=>{
    if(!used.has(i)) return false;
    remap.set(i,remap.size);
    const range=view.extensions?.EXT_meshopt_compression || view;
    if(range.buffer!==0) throw Error('Unexpected geometry buffer');
    const padding=(4-offset%4)%4;if(padding) {blocks.push(Buffer.alloc(padding));offset+=padding;}
    blocks.push(binary.subarray(range.byteOffset || 0,(range.byteOffset || 0)+range.byteLength));range.byteOffset=offset;offset+=range.byteLength;
    return true;
  });
  for(const accessor of gltf.accessors) if(accessor.bufferView!==undefined) accessor.bufferView=remap.get(accessor.bufferView);
  const geometry=Buffer.concat(blocks);gltf.buffers[0].uri=`${stem}.bin`;gltf.buffers[0].byteLength=geometry.length;
  await writeFile(path.join(output,`${stem}.bin`),geometry);await writeFile(path.join(output,`${stem}.gltf`),JSON.stringify(gltf));
  return {geometryBytes:geometry.length,triangles:gltf.meshes.flatMap(m=>m.primitives).reduce((s,p)=>s+gltf.accessors[p.indices].count/3,0),images,
    estimatedRgbaMipMiB:images.reduce((s,i)=>s+i.width*i.height*4*4/3/1048576,0)};
}
