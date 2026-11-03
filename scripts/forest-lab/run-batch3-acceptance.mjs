// All graphics tasks run serially. Parent waits for each Chrome process to exit;
// no additional screenshots, DCC renders, or browser suites may run concurrently.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const jobs=[
  ['low80', 'verify-batch3-motion.mjs',{PINE_ROUTE:'/forest-runtime-lab?scale=0.8',PINE_EVIDENCE:'artifacts-local/pine-batch3/final-low80'}],
  ['high', 'verify-batch3-motion.mjs',{PINE_ROUTE:'/forest-runtime-lab?quality=high',PINE_EVIDENCE:'artifacts-local/pine-batch3/final-high'}],
  ['video', 'verify-batch3-motion.mjs',{PINE_ROUTE:'/forest-runtime-lab?scale=0.8',PINE_VIDEO:'1',PINE_EVIDENCE:'artifacts-local/pine-batch3/final-video80'}],
  ['instances','verify-batch3-instances.mjs',{}],
  ['recovery','verify-context-recovery.mjs',{PINE_ROUTE:'/forest-runtime-lab',PINE_EVIDENCE:'artifacts-local/pine-batch3/context-recovery'}],
];
await mkdir('artifacts-local/pine-batch3',{recursive:true});const results=[];
for(const [name,script,extra] of jobs) {
  console.log('START',name,new Date().toISOString());
  const started=Date.now();
  const code=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[path.join('scripts/forest-lab',script)],{stdio:'inherit',env:{...process.env,FOREST_LAB_URL:'http://127.0.0.1:3310',PINE_PROFILE:'0',PINE_VIDEO:'0',PINE_ROUTE:'/forest-runtime-lab',...extra}});
    child.on('error',reject);child.on('exit',resolve);
  });
  results.push({name,code,ms:Date.now()-started});console.log('END',name,code,new Date().toISOString());
  await writeFile('artifacts-local/pine-batch3/acceptance-jobs.json',JSON.stringify(results,null,2));
}
if(results.some(job=>job.code!==0)) process.exitCode=1;
