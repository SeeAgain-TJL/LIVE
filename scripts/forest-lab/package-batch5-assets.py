"""Stream ZIPs and hash their members; exclude all temporary/source experiments."""
from pathlib import Path
import zipfile,json,hashlib
root=Path.cwd();base=root/'artifacts-local/pine-batch5';out=base/'handoff';out.mkdir(parents=True,exist_ok=True)
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for block in iter(lambda:f.read(4*1024*1024),b''):h.update(block)
 return h.hexdigest()
runtime=json.loads((root/'docs/reviews/pine-batch5/runtime-assets.json').read_text())
runtime_files=[(out/'runtime'/f['path'],'runtime/'+f['path']) for f in runtime['files']]
runtime_files.append((root/'docs/reviews/pine-batch5/runtime-assets.json','runtime/runtime-assets.json'))
authoring_files=[(base/'blender'/n,'authoring/'+n) for n in ['pine-batch5-creek-stand.blend','sample.json','comparison.json','contact-ao.png']]
authoring_files += [(root/'scripts/forest-lab'/n,'scripts/'+n) for n in ['build-batch5-sample.py','prepare-batch5-blender-inputs.mjs','render-batch5-comparison.py']]
report={'version':1,'archives':[]}
for name,files in [('pine-batch5-runtime.zip',runtime_files),('pine-batch5-authoring.zip',authoring_files)]:
 destination=out/name
 if destination.exists():raise RuntimeError('Refusing to replace existing archive: '+str(destination))
 members=[]
 with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED,compresslevel=4,allowZip64=True) as z:
  for p,relative in files:
   z.write(p,relative);members.append({'path':relative,'bytes':p.stat().st_size,'sha256':digest(p)})
 with zipfile.ZipFile(destination) as z:
  for item in members:
   h=hashlib.sha256()
   with z.open(item['path']) as f:
    for block in iter(lambda:f.read(4*1024*1024),b''):h.update(block)
   assert h.hexdigest()==item['sha256'],item['path']
 report['archives'].append({'name':name,'bytes':destination.stat().st_size,'sha256':digest(destination),'verifiedZipMembers':True,'files':members})
 print(name,destination.stat().st_size,flush=True)
(root/'docs/reviews/pine-batch5/asset-packages.json').write_text(json.dumps(report,indent=2)+'\n')
