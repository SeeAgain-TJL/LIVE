// GitHub release assets keep large runtime/DCC files out of normal Git history.
// Uses the existing Git credential helper; credentials are never printed/saved.
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { request } from 'node:https';
import path from 'node:path';
const batch6=process.argv.includes('--batch6');
const profiles={
  '--tree-representative':{batch:'pine-tree-representative',tag:'pine-tree-representative-20261105',name:'Pine Forest - representative geometric pine',files:['pine-tree-representative-runtime.zip','pine-tree-representative-authoring.zip']},
  '--tree-rebuild':{batch:'pine-tree-rebuild',tag:'pine-tree-rebuild-20261105',name:'Pine Forest - rebuilt source trees',files:['pine-tree-rebuild-runtime.zip','pine-tree-rebuild-authoring.zip']},
  '--tree-review':{batch:'pine-tree-rebuild-review',tag:'pine-tree-rebuild-review-20261105',name:'Pine Forest - rebuilt forest walkthrough',files:['pine-tree-rebuild-walk.webm']},
  '--scene-repair':{batch:'pine-scene-repair',tag:'pine-scene-repair-20261105',name:'Pine Forest - source geometry repair',files:['pine-scene-repair-runtime.zip','pine-scene-repair-authoring.zip']},
  '--scene-repair-contact':{batch:'pine-scene-repair-contact',tag:'pine-scene-repair-contact-20261105',name:'Pine Forest - rock contact overlay',files:['pine-scene-repair-contact-runtime.zip']},
  '--scene-repair-review':{batch:'pine-scene-repair-review',tag:'pine-scene-repair-review-20261105',name:'Pine Forest - repaired scene walkthrough',files:['pine-scene-repair-walk.webm']},
  '--template-correction':{batch:'pine-template-crowns-v2',tag:'pine-template-closure-correction-20261104',name:'Pine Forest ? near needle bundle correction',files:['pine-template-crowns-v2-runtime.zip','pine-template-crowns-v2-authoring.zip']},
  '--template-crowns':{batch:'pine-template-crowns',tag:'pine-template-crowns-20261104',name:'Pine Forest ? near crown closure',files:['pine-template-crowns-runtime.zip','pine-template-crowns-authoring.zip']},
  '--template-edge':{batch:'pine-template-edge',tag:'pine-template-edge-20261104',name:'Pine Forest ? grounded forest boundary',files:['pine-template-edge-runtime.zip']},
  '--template-review':{batch:'pine-template-final',tag:'pine-template-review-20261104',name:'Pine Forest ? template pre-acceptance',files:['pine-template-walk.webm']},
  '--visual-finish':{batch:'pine-visual-finish-art',tag:'pine-visual-finish-20261104',name:'Pine Forest · source-derived visual finish',files:['pine-visual-finish-runtime.zip']},
  '--visual-review':{batch:'pine-visual-finish',tag:'pine-visual-review-20261104',name:'Pine Forest · visual finish walkthrough',files:['pine-visual-finish-walk.webm']},
  '--forest-art':{batch:'pine-final-art',tag:'pine-forest-environment-20261104',name:'Pine Forest · integrated environment',files:['pine-final-art-runtime.zip']},
  '--forest-runtime':{batch:'pine-final-runtime',tag:'pine-forest-runtime-20261104',name:'Pine Forest · runtime optimization',files:['pine-final-runtime.zip']},
  '--forest-review':{batch:'pine-final',tag:'pine-forest-review-20261104',name:'Pine Forest · browser review',files:['pine-forest-walk.webm']},
};
const profile=Object.entries(profiles).find(([flag])=>process.argv.includes(flag))?.[1];
const batch=profile?.batch ?? (batch6 ? 'pine-batch6':'pine-batch5');
const repo='SeeAgain-TJL/LIVE',tag=profile?.tag ?? (batch6 ? 'pine-batch6-landmarks-20261104':'pine-batch5-sample-20261104');
const credential=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',windowsHide:true});
if(credential.status!==0)throw Error('GitHub credential helper unavailable');
const fields=Object.fromEntries(credential.stdout.trim().split('\n').map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
if(!fields.password)throw Error('No GitHub credential returned');
const headers={Authorization:`Bearer ${fields.password}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Pine-Batch5-asset-handoff'};
async function api(url,options={}) {
  const r=await fetch(url,{...options,headers:{...headers,...options.headers}});
  if(!r.ok)throw Error(`GitHub HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}
async function upload(url,file,bytes,name) {
  // Native streaming HTTPS avoids fetch's five-minute response-header limit
  // while a large packed DCC asset is still being uploaded.
  return new Promise((resolve,reject)=>{
    const req=request(url,{method:'POST',headers:{...headers,'Content-Type':name.endsWith('.webm') ? 'video/webm':'application/zip','Content-Length':String(bytes)}},response=>{
      const blocks=[];response.on('data',b=>blocks.push(b));response.on('error',reject);
      response.on('end',()=>{
        const body=Buffer.concat(blocks).toString();
        if(response.statusCode<200||response.statusCode>=300){reject(Error(`Upload HTTP ${response.statusCode}: ${body}`));return;}
        try{resolve(JSON.parse(body));}catch(e){reject(e);}
      });
    });
    req.on('error',reject);req.setTimeout(120000,()=>req.destroy(Error('Upload connection inactive for two minutes')));
    let sent=0,next=64*1024*1024;const source=createReadStream(file);
    source.on('error',e=>req.destroy(e));source.on('data',b=>{sent+=b.length;if(sent>=next){console.log({uploading:name,readMiB:Math.round(sent/1024/1024),totalMiB:Math.round(bytes/1024/1024)});next+=64*1024*1024;}});
    source.pipe(req);
  });
}
if(process.argv.includes('--check')) {
  const r=await api(`https://api.github.com/repos/${repo}`);
  console.log({repository:r.full_name,canPush:r.permissions?.push,private:r.private});
} else {
  const head=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
  const branch=spawnSync('git',['branch','--show-current'],{encoding:'utf8'}).stdout.trim();
  if(branch!=='codex/pine-forest-vertical-slice')throw Error('Unexpected branch');
  const url=`https://api.github.com/repos/${repo}/releases`;
  let release=await fetch(`${url}/tags/${tag}`,{headers});
  if(release.status===404)release=await api(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag_name:tag,target_commitish:head,name:profile?.name ?? (batch6 ? 'Pine Forest Batch6 · source landmarks':'Pine Forest Batch5 · editable creek sample'),prerelease:true,body:profile ? `Pine Forest development artifacts. See docs/reviews/${batch} for scope and verification.`:batch6 ? 'Development runtime for the original river and ruins. See docs/reviews/pine-batch6 for restoration and remaining work.':'Runtime and packed Blender authoring assets for the current development sample. Restore using docs/reviews/pine-batch5/README.md and SHA-256 manifests. Performance and visual review remain open; this is not a production release.'})});
  else if(release.ok)release=await release.json();else throw Error(`Release lookup HTTP ${release.status}`);
  const files=profile?.files ?? (batch6 ? ['pine-batch6-runtime.zip']:['pine-batch5-runtime.zip','pine-batch5-authoring.zip']);const published=[];
  for(const name of files) {
    const file=path.resolve('artifacts-local',batch,'handoff',name);const bytes=(await stat(file)).size;
    if(bytes>=2_000_000_000)throw Error('Archive exceeds conservative upload limit');
    const hash=createHash('sha256');for await(const b of createReadStream(file))hash.update(b);const sha256=hash.digest('hex');
    let asset=release.assets.find(a=>a.name===name);
    if(asset?.state==='starter' && asset.size===0) {
      // Only discard the empty failed upload created by this release attempt.
      const removed=await fetch(asset.url,{method:'DELETE',headers});
      if(!removed.ok)throw Error(`Failed upload cleanup HTTP ${removed.status}`);asset=null;
    }
    if(asset) {
      if(asset.size!==bytes || asset.digest!==`sha256:${sha256}`)throw Error(`Existing different release asset: ${name}`);
    } else {
      asset=await upload(release.upload_url.split('{')[0]+`?name=${encodeURIComponent(name)}`,file,bytes,name);
      if(asset.size!==bytes || asset.digest!==`sha256:${sha256}`)throw Error(`Upload hash mismatch: ${name}`);
    }
    published.push({name,bytes,sha256,url:asset.browser_download_url});console.log({uploaded:name,bytes,sha256});
  }
  await writeFile(path.join('docs/reviews',batch,'remote-assets.json'),JSON.stringify({repository:repo,release:release.html_url,tag,publishedFrom:head,files:published},null,2)+'\n');
}
