import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('artifacts-local/pine-batch2');
const target=path.resolve('docs/reviews/pine-batch2');await mkdir(target,{recursive:true});
const names=['near-static','walk-forward','walk-diagonal','mid-static-release','far-static'];
for(const name of names) await copyFile(path.join(root,'accepted-dpr1',`${name}.png`),path.join(target,`${name}.png`));
await copyFile(path.join(root,'experiments/experiment-1.png'),path.join(target,'before.png'));
for(const name of await readdir(path.join(root,'lod-review'))) if(name.endsWith('-comparison.png')) await copyFile(path.join(root,'lod-review',name),path.join(target,name));
const audit=JSON.parse(await readFile(path.join(root,'geometry-audit.json')));
const experiments=JSON.parse(await readFile(path.join(root,'experiments/results.json')));
const validation=JSON.parse(await readFile(path.join(root,'asset-validation.json')));
const baseline=JSON.parse(await readFile(path.join(root,'baseline/results.json')));
const cleanBaseline=JSON.parse(await readFile(path.join(root,'baseline-clean/results.json')));
const dpr1=JSON.parse(await readFile(path.join(root,'accepted-dpr1-clean/results.json')));
const low=JSON.parse(await readFile(path.join(root,'accepted-80/results.json')));
const recording=JSON.parse(await readFile(path.join(root,'accepted-dpr1/results.json')));
const summarize=r=>({...r,resources:undefined,stages:r.stages.map(({samples,...s})=>({...s,first:samples[0],last:samples.at(-1)}))});
const submission=Object.values(experiments[0].audit).reduce((s,r)=>({instances:s.instances+r.instances,outside:s.outside+r.outside,submitted:s.submitted+r.submitted,outsideTriangles:s.outsideTriangles+r.outsideTriangles}),{instances:0,outside:0,submitted:0,outsideTriangles:0});
const summary={date:'2026-11-03',checkpointBefore:'08bec0f',validation,cleanBaseline:cleanBaseline.map(r=>({route:r.route,frameSummary:r.frameSummary,initial:r.samples.at(-1),errors:r.errors})),baseline:baseline.map(r=>({route:r.route,initial:r.initial,errors:r.errors})),submission,
  highCost:audit.rows.slice(0,12),geometryTotals:audit.totals,alphaExperiments:experiments.map(r=>({route:r.route,last:r.samples.at(-1),errors:r.errors})),
  dpr1:summarize(dpr1),internal80:summarize(low),recording:summarize(recording),verdict:'NOT PASSED: dense-region moving p95 remains above stable 30 FPS budget; visual review limitations documented.'};
await writeFile(path.join(target,'summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({dpr1:dpr1.stages.map(s=>({name:s.name,fps:s.averageFps,p95:s.p95Ms})),internal80:low.stages.map(s=>({name:s.name,fps:s.averageFps,p95:s.p95Ms})),first:dpr1.firstForestMs,settled:dpr1.settledMs,bytes:dpr1.resourceBytes},null,2));
