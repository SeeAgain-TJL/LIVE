// Re-download a published small artifact and verify both the receipt and server
// digest. Never prints credentials or follows GitHub auth onto an asset host.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const [receiptFile,target]=process.argv.slice(2);
if(!receiptFile||!target)throw Error('Pass remote-assets.json and an empty download directory');
const receipt=JSON.parse(await readFile(receiptFile,'utf8'));
const credential=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',windowsHide:true});
const token=credential.stdout.match(/^password=(.*)$/m)?.[1]?.trim();
if(credential.status!==0||!token)throw Error('Git credential helper unavailable');
const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json'};
const api=await fetch(`https://api.github.com/repos/${receipt.repository}/releases/tags/${receipt.tag}`,{headers,signal:AbortSignal.timeout(30000)});
if(!api.ok)throw Error(`Release lookup HTTP ${api.status}`);
const release=await api.json();
await mkdir(target,{recursive:true});
const files=[];
for(const file of receipt.files) {
 const asset=release.assets.find(asset=>asset.name===file.name);assert.ok(asset);assert.equal(asset.size,file.bytes);assert.equal(asset.digest,`sha256:${file.sha256}`);
 const destination=path.join(target,file.name),old=await readFile(destination).catch(()=>null);
 if(old && old.length===file.bytes && createHash('sha256').update(old).digest('hex')===file.sha256) {
  files.push({name:file.name,bytes:file.bytes,sha256:file.sha256});console.log({alreadyDownloadedAndVerified:file.name});continue;
 }
 console.log({downloading:file.name});
 const response=await fetch(asset.url+'?cache='+Date.now(),{headers:{...headers,Accept:'application/octet-stream'},redirect:'manual',signal:AbortSignal.timeout(30000)});
 const location=response.headers.get('location');
 let bytes;
 if(location) {
  const host=new URL(location).hostname;
  assert.ok(host.endsWith('.githubusercontent.com') && !/["\r\n]/.test(location));
  const partial=path.resolve(target,file.name+'.'+Date.now()+'.partial');
  const transfer=spawnSync('curl.exe',['--fail','--location','--silent','--show-error','--max-time','180','--config','-','--output',partial],{input:'url = "'+location+'"\n',encoding:'utf8',windowsHide:true});
  if(transfer.status!==0)throw Error('Asset transfer failed: '+transfer.stderr);
  bytes=await readFile(partial);
 }else{
  if(!response.ok)throw Error(`Download HTTP ${response.status}`);
  bytes=Buffer.from(await response.arrayBuffer());
 }
 assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
 if(old)assert.ok(old.equals(bytes),'Refusing to overwrite different existing download');
 else await writeFile(destination,bytes);
 files.push({name:file.name,bytes:bytes.length,sha256:file.sha256});console.log({verified:file.name,bytes:bytes.length});
}
await writeFile(path.join(target,'verified.json'),JSON.stringify({release:receipt.release,files},null,2)+'\n');
