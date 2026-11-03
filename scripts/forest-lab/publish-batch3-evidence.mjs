import { readFile, writeFile, mkdir, copyFile, readdir, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
const root='artifacts-local/pine-batch3';
const delivery='docs/reviews/pine-batch3';await mkdir(delivery,{recursive:true});
const blender=await readFile(`${root}/blender/blender-pine_02-original-cycles.png`);
const web=await sharp(`${root}/alpha-review/pine_02-near-source-single.png`).resize(720,450).png().toBuffer();
const label=Buffer.from('<svg width="1440" height="32"><rect width="1440" height="32" fill="#172421"/><g fill="white" font-size="18" font-family="Arial"><text x="12" y="23">Original Blender Cycles / 8 samples / original world</text><text x="732" y="23">Three.js full-source geometry / converted PBR</text></g></svg>');
await sharp({create:{width:1440,height:482,channels:3,background:'#172421'}}).composite([{input:label,left:0,top:0},{input:blender,left:0,top:32},{input:web,left:720,top:32}]).png().toFile(`${root}/lod-review/blender-three-original-material.png`);
const cases={};
for(const name of ['baseline-clean','baseline-profile','optimized-profile','low-dpr1','final-low80','final-high','final-video80','final-dpr1']) {
  const raw=await readFile(`${root}/${name}/results.json`,'utf8').catch(()=>null);if(!raw) continue;
  const data=JSON.parse(raw);
  cases[name]={route:data.route,renderer:data.renderer,diagnostic:data.diagnostic,canvasSize:data.canvasSize,firstForestMs:data.firstForestMs,settledMs:data.settledMs,resourceBytes:data.resourceBytes,
    motion:data.motion,qualityTargetMet:data.qualityTargetMet,returnedTiles:data.returnedTiles,tileReentries:data.tileReentries,released:data.released,
    storageAccess:data.archiveAccess,contextEvents:data.contextEvents,errors:data.errors,passed:data.passed,failed:data.failed,
    stages:data.stages.map(({name,averageFps,p95Ms,p99Ms,maxMs,over100ms,trianglesRange,callsRange,gpu,uploads,seconds})=>({name,averageFps,p95Ms,p99Ms,maxMs,over100ms,trianglesRange,callsRange,gpu,uploads,seconds})),
    initial:data.stages[0]?.samples[0],final:data.final};
}
await writeFile(`${delivery}/summary.json`,JSON.stringify(cases,null,2));
for(const file of ['near-static','walk-forward','mid-static-release','far-static','dense-return']) {
  const from=`${root}/final-video80/${file}.png`;
  await copyFile(from,`${delivery}/low80-${file}.png`);
}
for(const file of ['near-static','far-static']) await copyFile(`${root}/final-high/${file}.png`,`${delivery}/higher-${file}.png`);
for(const file of ['near-comparison','mid-comparison','far-comparison','blender-three-original-material']) await copyFile(`${root}/lod-review/${file}.png`,`${delivery}/${file}.png`);
await copyFile(`${root}/alpha-review/comparison.png`,`${delivery}/alpha-coverage-comparison.png`);
for(const [from,to] of [['blender/workflow.json','blender-workflow.json'],['blender/render.json','blender-render.json'],['context-recovery/results.json','context-recovery.json'],['acceptance-jobs.json','acceptance-jobs.json']]) await copyFile(`${root}/${from}`,`${delivery}/${to}`);
const audit=JSON.parse(await readFile(`${root}/instance-audit/results.json`));
await writeFile(`${delivery}/instance-audit.json`,JSON.stringify({passed:audit.passed,audit:audit.audit,errors:audit.errors,qualitySwitch:audit.qualitySwitch},null,2));
// Preserve all new runtime assets outside Git, with verified hashes. Batch 2
// delivery remains immutable and is referenced rather than duplicated again.
const assetSource='public/forest-origin-assets/batch3';
const archive=path.join(process.env.LOCALAPPDATA,'UNIVERSE-OF-ME/asset-audit/candidate-assets/pine-source-conversion/batch3-delivery');
await mkdir(archive,{recursive:true});await cp(assetSource,archive,{recursive:true});
const files=[];
async function walk(directory) {
  for(const item of await readdir(directory,{withFileTypes:true})) {
    const file=path.join(directory,item.name);if(item.isDirectory()) {await walk(file);continue;}
    const data=await readFile(file),relative=path.relative(assetSource,file).replaceAll('\\','/');
    const sha256=createHash('sha256').update(data).digest('hex');
    if(createHash('sha256').update(await readFile(path.join(archive,relative))).digest('hex')!==sha256) throw Error('Copy mismatch '+relative);
    files.push({file:relative,bytes:data.length,sha256});
  }
}
await walk(assetSource);
const manifest={parent:'batch2-delivery/delivery-sha256.json',source:'original Pine Forest source retained',files,totalBytes:files.reduce((sum,file)=>sum+file.bytes,0)};
await writeFile(path.join(archive,'delivery-sha256.json'),JSON.stringify(manifest,null,2));
await writeFile(`${delivery}/delivery-sha256.json`,JSON.stringify(manifest,null,2));
console.log({cases:Object.keys(cases),assets:files.length,totalBytes:manifest.totalBytes,archive});
