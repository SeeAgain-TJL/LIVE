import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

const source=path.resolve('artifacts-local/pine-batch3b/blender/terrain-pbr');
const output=path.resolve('public/forest-origin-assets/batch3b/terrain');
await mkdir(output,{recursive:true});
const report={source:'Blender 4.4.3 original main_terrain, path/river masks, Generated mapping',maps:[]};
for(const name of ['basecolor','normal','roughness']) {
  const input=await readFile(path.join(source,name+'.png'));
  const size=name==='basecolor'?4096:name==='normal'?2048:1024;
  const data=await sharp(input).resize(size,size).webp({quality:94}).toBuffer();
  await writeFile(path.join(output,name+'.webp'),data);
  report.maps.push({name,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),width:size,height:size});
}
await writeFile(path.join(output,'manifest.json'),JSON.stringify(report,null,2));
console.log(report);
