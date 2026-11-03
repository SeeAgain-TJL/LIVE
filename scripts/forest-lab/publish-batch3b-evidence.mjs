import {mkdir,readFile,writeFile,copyFile,stat,readdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
const source=path.resolve('artifacts-local/pine-batch3b');
const output=path.resolve('docs/reviews/pine-batch3b');await mkdir(output,{recursive:true});
async function hash(file){const h=createHash('sha256');for await(const block of createReadStream(file))h.update(block);return h.digest('hex');}
const summary={environment:'Windows 11 / Chrome / Intel Graphics ANGLE D3D11 / CSS1440x900 / DPR1 / internal1152x720',runs:{}};
for(const [name,folder] of [['baseline','baseline'],['candidateCycles','candidate-low80'],['finalLow','accepted-low80'],['video','final-video80'],['higher80','final-high80']]) {
 const r=JSON.parse(await readFile(path.join(source,folder,'results.json')));
 summary.runs[name]={route:r.route,motion:r.motion,firstForestMs:r.firstForestMs,settledMs:r.settledMs,resourceBytes:r.resourceBytes,released:r.released,errors:r.errors,contextEvents:r.contextEvents,archiveAccess:r.archiveAccess,renderer:r.renderer,canvasSize:r.canvasSize,qualityTargetMet:r.qualityTargetMet,passed:r.passed,
  stages:r.stages.map(s=>({name:s.name,averageFps:s.averageFps,p95Ms:s.p95Ms,p99Ms:s.p99Ms,maxMs:s.maxMs,over100ms:s.over100ms,triangles:s.trianglesRange,calls:s.callsRange,camera:s.samples[0]?.metrics.camera,direction:s.samples[0]?.metrics.direction})),initial:r.stages[0].samples[0],final:r.final};
}
summary.localTerrainComparison=JSON.parse(await readFile(path.join(source,'browser-v2/results.json'))).variants.slice(0,2).map(v=>({name:v.name,metrics:v.metrics,motion:v.motion,trees:v.streaming.trees,props:v.streaming.props}));
for(const [folder,name] of [['instance-audit','instance-audit.json'],['context-recovery','context-recovery.json']])await copyFile(path.join(source,folder,'results.json'),path.join(output,name));
await copyFile(path.join(source,'integrity/asset-validation.json'),path.join(output,'asset-validation.json'));
await copyFile(path.join(source,'acceptance-jobs.json'),path.join(output,'acceptance-jobs.json'));
for(const [folder,name,out] of [
 ['accepted-low80','near-static.png','near.png'],['accepted-low80','walk-forward.png','ground-walk.png'],['accepted-low80','mid-static-release.png','mid.png'],['accepted-low80','far-static.png','far.png'],['accepted-low80','dense-return.png','return.png'],['final-high80','near-static.png','higher.png'],
 ['final-visuals','terrain-only-legacy.png','terrain-before.png'],['final-visuals','terrain-only-pbr.png','terrain-after.png'],['final-visuals','tree-near.png','tree-near.png'],['final-visuals','tree-mid.png','tree-mid.png'],['final-visuals','tree-cycles-atlas.png','tree-cycles-atlas.png']
])await copyFile(path.join(source,folder,name),path.join(output,out));

async function comparison(filename,items) {
 const width=720,height=450,header=36;
 const labels=Buffer.from(`<svg width="${width*items.length}" height="${header}"><rect width="100%" height="100%" fill="#172421"/><g fill="white" font-family="Arial" font-size="16">${items.map(([label],i)=>`<text x="${i*width+12}" y="24">${label}</text>`).join('')}</g></svg>`);
 const images=[];for(let i=0;i<items.length;i++)images.push({input:await sharp(items[i][1]).resize(width,height).png().toBuffer(),left:i*width,top:header});
 await sharp({create:{width:width*items.length,height:height+header,channels:3,background:'#172421'}}).composite([{input:labels,left:0,top:0},...images]).png().toFile(path.join(output,filename));
}
await comparison('tree-blender-browser.png',[
 ['Blender Cycles / original material / 12 samples',path.join(source,'blender/pine04-perspective/original-pine04-perspective.png')],
 ['Chrome / existing near LOD / PBR',path.join(source,'final-visuals/tree-near.png')],
 ['Chrome / source Cycles atlas / higher option',path.join(source,'final-visuals/tree-cycles-atlas.png')]
]);
await comparison('terrain-blender-browser.png',[
 ['Blender / original terrain only / 16 samples',path.join(source,'blender/terrain-reference/original-terrain-same-camera.png')],
 ['Chrome / previous diffuse-only terrain',path.join(source,'final-visuals/terrain-only-legacy.png')],
 ['Chrome / source-derived PBR terrain',path.join(source,'final-visuals/terrain-only-pbr.png')]
]);
await comparison('tree-trials.png',[
 ['Existing 10% near geometry',path.join(source,'tree-review/pine_04-near-baseline.png')],
 ['35% geometry trial (rejected)',path.join(source,'geometry35-review/pine_04-near-uvfloat.png')],
 ['Alpha surface trial (rejected)',path.join(source,'needles-source/pine_04-near-needlessource.png')]
]);

const root=path.join(process.env.LOCALAPPDATA,'UNIVERSE-OF-ME/asset-audit/candidate-assets');
const archive=path.join(root,'pine-source-conversion/batch3b-delivery');await mkdir(archive,{recursive:true});
const files=[];
for(const folder of ['batch3b/terrain','batch3b/impostors','batch3/impostors'])for(const filename of await readdir(path.resolve('public/forest-origin-assets',folder))) {
 if(folder==='batch3/impostors' && !filename.startsWith('pine_04.'))continue;
 const from=path.resolve('public/forest-origin-assets',folder,filename);if(!(await stat(from)).isFile())continue;
 const target=path.join(archive,folder,filename);await mkdir(path.dirname(target),{recursive:true});await copyFile(from,target);
 const sha256=await hash(from);if(await hash(target)!==sha256)throw Error('Archive copy mismatch');files.push({path:folder+'/'+filename,bytes:(await stat(from)).size,sha256});
}
const originalHash=await hash(path.join(root,'polyhaven_pine_fir_forest.blend'));
const copyHash=await hash(path.join(root,'pine-source-conversion/batch3-work/pine-forest-copy.blend'));
if(originalHash!==copyHash||originalHash!=='fdce77741081f462f11e5cefe8bf79a0bc796727dbb6e51d12fc6cf20e9c9cfb')throw Error('Original blend changed');
const video=path.join(source,'final-video80/continuous-movement.webm');
summary.video={path:'artifacts-local/pine-batch3b/final-video80/continuous-movement.webm',bytes:(await stat(video)).size,sha256:await hash(video)};
// Extract labelled evidence frames; the raw recording remains untouched.
const ffmpeg=process.env.PINE_FFMPEG || path.join(process.env.LOCALAPPDATA,'ms-playwright/ffmpeg-1013/ffmpeg-win64.exe');
const timeline=path.join(source,'video-review');await mkdir(timeline,{recursive:true});
const layers=[];const seconds=[2,8,12,35,75,120,150];
for(let i=0;i<seconds.length;i++) {
 const frame=path.join(timeline,`frame-${seconds[i]}.png`);
 const extracted=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-ss',String(seconds[i]),'-i',video,'-frames:v','1','-y',frame],{encoding:'utf8',windowsHide:true});
 if(extracted.status!==0)throw Error(`Video frame extraction failed: ${extracted.error || extracted.stderr}`);
 const x=i%3*480,y=Math.floor(i/3)*330;
 const label=Buffer.from(`<svg width="480" height="30"><rect width="100%" height="100%" fill="#172421"/><text x="12" y="22" fill="white" font-family="Arial" font-size="16">Uncut recording: ${seconds[i]} s</text></svg>`);
 layers.push({input:label,left:x,top:y},{input:await sharp(frame).resize(480,300).png().toBuffer(),left:x,top:y+30});
}
await sharp({create:{width:1440,height:990,channels:3,background:'#172421'}}).composite(layers).png().toFile(path.join(output,'video-timeline.png'));
summary.integrity={originalHash,copyHash,sourceBlendSaved:false,archive,files};
await writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2));
await writeFile(path.join(archive,'delivery-manifest.json'),JSON.stringify(summary.integrity,null,2));
console.log(JSON.stringify({runs:Object.fromEntries(Object.entries(summary.runs).map(([k,v])=>[k,v.motion])),video:summary.video,archive:summary.integrity},null,2));
