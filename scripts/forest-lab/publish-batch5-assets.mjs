// GitHub release assets keep large runtime/DCC files out of normal Git history.
// Uses the existing Git credential helper; credentials are never printed/saved.
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const repo='SeeAgain-TJL/LIVE',tag='pine-batch5-sample-20261104';
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
if(process.argv.includes('--check')) {
  const r=await api(`https://api.github.com/repos/${repo}`);
  console.log({repository:r.full_name,canPush:r.permissions?.push,private:r.private});
} else {
  const head=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
  const branch=spawnSync('git',['branch','--show-current'],{encoding:'utf8'}).stdout.trim();
  if(branch!=='codex/pine-forest-vertical-slice')throw Error('Unexpected branch');
  const url=`https://api.github.com/repos/${repo}/releases`;
  let release=await fetch(`${url}/tags/${tag}`,{headers});
  if(release.status===404)release=await api(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag_name:tag,target_commitish:head,name:'Pine Forest Batch5 · editable creek sample',prerelease:true,body:'Runtime and packed Blender authoring assets for the current development sample. Restore using docs/reviews/pine-batch5/README.md and SHA-256 manifests. Performance and visual review remain open; this is not a production release.'})});
  else if(release.ok)release=await release.json();else throw Error(`Release lookup HTTP ${release.status}`);
  const files=['pine-batch5-runtime.zip','pine-batch5-authoring.zip'];const published=[];
  for(const name of files) {
    const file=path.resolve('artifacts-local/pine-batch5/handoff',name);const bytes=(await stat(file)).size;
    if(bytes>=2_000_000_000)throw Error('Archive exceeds conservative upload limit');
    const hash=createHash('sha256');for await(const b of createReadStream(file))hash.update(b);const sha256=hash.digest('hex');
    let asset=release.assets.find(a=>a.name===name);
    if(asset) {
      if(asset.size!==bytes || asset.digest!==`sha256:${sha256}`)throw Error(`Existing different release asset: ${name}`);
    } else {
      asset=await api(release.upload_url.split('{')[0]+`?name=${encodeURIComponent(name)}`,{method:'POST',headers:{'Content-Type':'application/zip','Content-Length':String(bytes)},body:createReadStream(file),duplex:'half'});
      if(asset.size!==bytes || asset.digest!==`sha256:${sha256}`)throw Error(`Upload hash mismatch: ${name}`);
    }
    published.push({name,bytes,sha256,url:asset.browser_download_url});console.log({uploaded:name,bytes,sha256});
  }
  await writeFile('docs/reviews/pine-batch5/remote-assets.json',JSON.stringify({repository:repo,release:release.html_url,tag,publishedFrom:head,files:published},null,2)+'\n');
}
