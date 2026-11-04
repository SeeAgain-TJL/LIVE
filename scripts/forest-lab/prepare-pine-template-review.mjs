import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const base='artifacts-local/pine-template/baseline-views/stills-high';
const final='artifacts-local/pine-template/acceptance';
const out='docs/reviews/pine-template-final';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
await mkdir(out,{recursive:true});
const stills=await read(path.join(final,'stills-high/results.json'));
assert.equal(stills.passed,true);assert.equal(stills.shots.find(s=>s.name==='panorama').streaming.trees,585);
for(const name of ['near','ruins','far','crown','walkMid','walkFar','edge','raisedEdge','panorama']) {
 await sharp(path.join(final,'stills-high',name+'.png')).resize(1280).webp({quality:87}).toFile(path.join(out,name+'.webp'));
}
async function comparison(name,files,labels,width=620,height=388) {
 const bar=33;
 const images=await Promise.all(files.map(async(file,i)=>({input:await sharp(file).resize(width,height,{fit:'fill'}).toBuffer(),left:i*width,top:bar})));
 const heading=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width*files.length}" height="${bar}"><rect width="100%" height="100%" fill="#19261e"/>${labels.map((s,i)=>`<text x="${i*width+12}" y="22" font-size="15" font-family="sans-serif" fill="white">${s}</text>`).join('')}</svg>`);
 await sharp({create:{width:width*files.length,height:height+bar,channels:3,background:'#19261e'}}).composite([...images,{input:heading,left:0,top:0}]).webp({quality:89}).toFile(path.join(out,name+'.webp'));
}
const original=path.join(process.env.LOCALAPPDATA,'UNIVERSE-OF-ME/asset-audit/candidate-assets/pine-source-camera-1440.png');
await comparison('source-camera',[original,path.join(base,'near.png'),path.join(final,'stills-high/near.png')],['Original Blender / archived Cycles','Previous browser / 63865d7','Current browser / bb522f7'],540,338);
for(const name of ['crown','raisedEdge','panorama'])await comparison(name+'-comparison',[path.join(base,name+'.png'),path.join(final,'stills-high',name+'.png')],['Previous / 63865d7','Current candidate']);
await copyFile(path.join(final,'stills-high/results.json'),path.join(out,'stills.json'));
const performance=[];
for(const q of ['low','mid','high']) {
 const report=await read(path.join(final,'walk-'+q,'results.json'));assert.equal(report.passed,true);
 await writeFile(path.join(out,'walk-'+q+'.json'),JSON.stringify(report,null,2)+'\n');
 const before=await read(path.join('artifacts-local/pine-template/baseline','walk-'+q,'results.json'));
 performance.push({quality:q,scale:report.scale,baseline:before.combined,final:report.combined,firstReadyMs:report.firstReadyMs,firstSettledMs:report.firstSettledMs});
}
const recorded=await read(path.join(final,'walk-low-recorded/results.json'));assert.equal(recorded.passed,true);
await writeFile(path.join(out,'walk-recorded.json'),JSON.stringify(recorded,null,2)+'\n');
await writeFile(path.join(out,'performance.json'),JSON.stringify(performance,null,2)+'\n');
const handoff='artifacts-local/pine-template-final/handoff';await mkdir(handoff,{recursive:true});
await copyFile(path.join(final,'walk-low-recorded/continuous.webm'),path.join(handoff,'pine-template-walk.webm'));
console.log(performance);
