import { readFile,mkdir,rename,stat } from 'node:fs/promises';
import { createReadStream,createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
const remote=JSON.parse(await readFile('docs/reviews/pine-batch5/remote-assets.json','utf8'));
const file=remote.files.find(f=>f.name==='pine-batch5-runtime.zip');
const folder='artifacts-local/pine-batch5/remote-download';await mkdir(folder,{recursive:true});
const target=folder+'/'+file.name;
if(!await stat(target).catch(()=>null)) {
 const response=await fetch(file.url);if(!response.ok)throw Error(`Download HTTP ${response.status}`);
 await pipeline(Readable.fromWeb(response.body),createWriteStream(target+'.part',{flags:'wx'}));await rename(target+'.part',target);
}
const hash=createHash('sha256');for await(const b of createReadStream(target))hash.update(b);
if(hash.digest('hex')!==file.sha256)throw Error('Downloaded runtime hash mismatch');
console.log({downloaded:file.url,bytes:(await stat(target)).size,sha256:file.sha256});
