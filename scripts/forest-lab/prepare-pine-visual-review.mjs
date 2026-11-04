// Prepare shareable evidence from the final production browser capture and
// the archived Blender camera. Neither file is substituted for the 3D scene.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [capture, blenderCamera] = process.argv.slice(2);
if(!capture || !blenderCamera) throw Error('Pass the acceptance capture directory and original Blender camera PNG');
const output='docs/reviews/pine-visual-finish', handoff='artifacts-local/pine-visual-finish/handoff';
await mkdir(output,{recursive:true});await mkdir(handoff,{recursive:true});
const stills=path.join(capture,'stills-high');
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const result=await read(path.join(stills,'results.json'));
assert.equal(result.passed,true);
assert.equal(result.shots.find(shot=>shot.name==='panorama')?.streaming.trees,585);
for(const name of ['near','ruins','far','panorama']) {
  await sharp(path.join(stills,name+'.png')).resize(1280).webp({quality:87}).toFile(path.join(output,name+'.webp'));
}
await copyFile(path.join(stills,'results.json'),path.join(output,'stills.json'));
const width=540,height=338,bar=34;
const sources=[blenderCamera,'docs/reviews/pine-final/near.webp',path.join(stills,'near.png')];
const labels=['Original Blender / archived Cycles','Previous browser / 3f422c5','Visual finish / browser high'];
const images=await Promise.all(sources.map(async(input,i)=>({input:await sharp(input).resize(width,height,{fit:'fill'}).toBuffer(),top:bar,left:width*i})));
const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width*3}" height="${bar}"><rect width="100%" height="100%" fill="#18251d"/>${labels.map((label,i)=>`<text x="${i*width+12}" y="22" font-size="15" font-family="sans-serif" fill="white">${label}</text>`).join('')}</svg>`);
await sharp({create:{width:width*3,height:height+bar,channels:3,background:'#18251d'}}).composite([...images,{input:svg,left:0,top:0}]).webp({quality:88}).toFile(path.join(output,'source-camera.webp'));
for(const tier of ['low','mid','high','low-recorded']) {
  const folder=path.join(capture,'walk-'+tier), report=await read(path.join(folder,'results.json'));
  assert.equal(report.passed,true,tier);
  await writeFile(path.join(output,'walk-'+tier+'.json'),JSON.stringify(report,null,2)+'\n');
}
await copyFile(path.join(capture,'walk-low-recorded','continuous.webm'),path.join(handoff,'pine-visual-finish-walk.webm'));
