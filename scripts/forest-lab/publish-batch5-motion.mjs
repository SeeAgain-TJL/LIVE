import { mkdir,readFile,writeFile,stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
const base='artifacts-local/pine-batch5',out='docs/reviews/pine-batch5';
const ffmpeg=process.env.PINE_FFMPEG||path.join(process.env.LOCALAPPDATA,'ms-playwright/ffmpeg-1013/ffmpeg-win64.exe');
const video=path.resolve(base,'sample-walk/continuous-movement.webm');
await mkdir(base+'/video-review',{recursive:true});
function run(args) {const p=spawnSync(ffmpeg,['-hide_banner','-loglevel','error',...args],{encoding:'utf8',windowsHide:true});if(p.status!==0)throw Error(p.stderr||String(p.error));}
const probe=spawnSync(ffmpeg,['-hide_banner','-i',video],{encoding:'utf8',windowsHide:true});
const match=/Duration: (\d+):(\d+):([\d.]+)/.exec(probe.stderr);if(!match)throw Error('Cannot read video duration');
const duration=Number(match[1])*3600+Number(match[2])*60+Number(match[3]);
const seconds=[.12,.27,.42,.57,.72,.9].map(f=>Math.floor(duration*f));
run(['-i',video,'-vf','scale=960:600','-c:v','libvpx-vp9','-b:v','500k','-deadline','realtime','-cpu-used','8','-y',out+'/continuous-walk-review.webm']);
const layers=[];
for(const [i,second] of seconds.entries()) {
 const frame=base+`/video-review/frame-${second}.png`;run(['-ss',String(second),'-i',video,'-frames:v','1','-y',frame]);
 const x=i%3*480,y=Math.floor(i/3)*330;
 layers.push({input:Buffer.from(`<svg width="480" height="30"><rect width="100%" height="100%" fill="#172421"/><text x="12" y="22" fill="white" font-size="17" font-family="Arial">Continuous sample exploration: ${second}s</text></svg>`),top:y,left:x},
 {input:await sharp(frame).resize(480,300).png().toBuffer(),top:y+30,left:x});
}
await sharp({create:{width:1440,height:660,channels:3,background:'#172421'}}).composite(layers).webp({quality:92}).toFile(out+'/video-timeline.webp');
async function hash(file){const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
const runs={};
for(const [name,folder] of [['withoutRecording','final-clean'],['extendedRecorded','final-walk'],['gpuDiagnostic','final-gpu']]) {
 const r=JSON.parse(await readFile(`${base}/${folder}/results.json`,'utf8'));
 runs[name]={route:r.route,renderer:r.renderer,canvasSize:r.canvasSize,firstForestMs:r.firstForestMs,settledMs:r.settledMs,motion:r.motion,qualityTargetMet:r.qualityTargetMet,passed:r.passed,errors:r.errors,contextEvents:r.contextEvents,archiveAccess:r.archiveAccess,released:r.released,returnDistanceFromStart:r.returnDistanceFromStart,gpuTimerSupported:r.gpuTimerSupported,
 stages:r.stages.map(s=>({name:s.name,averageFps:s.averageFps,p95Ms:s.p95Ms,p99Ms:s.p99Ms,over100ms:s.over100ms,trianglesRange:s.trianglesRange,callsRange:s.callsRange,gpu:s.gpu,uploads:s.uploads,cpuSelfMs:s.cpuSelfMs?.slice(0,12),cameraSamples:s.samples.map(x=>({position:x.metrics.camera,direction:x.metrics.direction}))}))};
}
const core=JSON.parse(await readFile(base+'/sample-walk/results.json','utf8'));delete core.frameIntervals;
const review=out+'/continuous-walk-review.webm';
const summary={runtimeHead:'820b504',method:'Real WASD/mouse inputs only; no review mode or pose events in any walk. Core video is one uncut page recording.',limitations:'One Intel machine, serial GPU jobs, not a controlled regression/overhead comparison. Extended recording overlapped asset upload. Diagnostic uses CPU sampling/GPU queries and is not the clean FPS run. No measured VRAM claim.',
 original:{path:path.relative(process.cwd(),video).replaceAll('\\','/'),bytes:(await stat(video)).size,sha256:await hash(video)},
 review:{path:review,bytes:(await stat(review)).size,sha256:await hash(review),width:960,height:600,duration,seekSeconds:seconds,edits:'Uncut; spatial/bitrate compression only'},core,runs};
await writeFile(out+'/motion-summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({review:summary.review,core:core.recordedExploration,clean:runs.withoutRecording.motion,gpu:runs.gpuDiagnostic.stages.map(s=>({name:s.name,gpu:s.gpu}))},null,2));
