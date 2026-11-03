// Only run after the final clean job. All GPU/Blender/browser jobs stay serial.
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const root='artifacts-local/pine-batch3b';await mkdir(root,{recursive:true});
const jobs=[
 ['clean','verify-batch3-motion.mjs',{PINE_ROUTE:'/forest-runtime-lab?scale=0.8',PINE_EVIDENCE:root+'/accepted-low80'}],
 ['video','verify-batch3-motion.mjs',{PINE_ROUTE:'/forest-runtime-lab?scale=0.8',PINE_VIDEO:'1',PINE_EVIDENCE:root+'/final-video80'}],
 ['higher','verify-batch3-motion.mjs',{PINE_ROUTE:'/forest-runtime-lab?scale=0.8&quality=high',PINE_EVIDENCE:root+'/final-high80'}],
 ['instances','verify-batch3-instances.mjs',{PINE_ROUTE:'/forest-runtime-lab?scale=0.8&audit=1',PINE_EVIDENCE:root+'/instance-audit'}],
 ['recovery','verify-context-recovery.mjs',{PINE_ROUTE:'/forest-runtime-lab?scale=0.8',PINE_EVIDENCE:root+'/context-recovery'}],
 ['visuals','capture-batch3b-comparisons.mjs',{}],
 ['integrity','verify-batch2-assets.mjs',{PINE_EVIDENCE:root+'/integrity'}]
];
const result=[];
for(const [name,file,extra] of jobs) {
 const started=Date.now();console.log('START',name);
 const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/forest-lab/'+file],{stdio:'inherit',env:{...process.env,FOREST_LAB_URL:'http://127.0.0.1:3312',PINE_PROFILE:'0',PINE_VIDEO:'0',PINE_EVIDENCE:root+'/'+name,...extra}});child.on('exit',resolve);child.on('error',reject);});
 result.push({name,code,ms:Date.now()-started});await writeFile(root+'/acceptance-jobs.json',JSON.stringify(result,null,2));console.log('END',name,code);
 if(code!==0){process.exitCode=1;break;}
}
