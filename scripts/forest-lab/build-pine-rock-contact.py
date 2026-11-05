"""Keep source rock XY/rotation/scale; transfer original ground contact to relief."""
import bpy,json,gzip,math
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
runtime=Path('public/forest-origin-assets');out=runtime/'scene-repair-contact';out.mkdir(exist_ok=True)
nav=json.loads((runtime/'environment/navigation.json').read_text());cols=nav['columns'];rows=nav['rows'];ox,oy=nav['origin'];step=nav['step']
source=bpy.data.objects['terrain_main'];deps=bpy.context.evaluated_depsgraph_get();mesh=bpy.data.meshes.new_from_object(source.evaluated_get(deps))
ground=BVHTree.FromPolygons([source.matrix_world@v.co for v in mesh.vertices],[p.vertices[:] for p in mesh.polygons])
manifest=json.loads((runtime/'batch2/tiles/manifest.json').read_text());result={};deltas=[]
for key in manifest['tiles']:
 data=np.frombuffer(gzip.decompress((runtime/f'batch2/tiles/{key}.bin.gz').read_bytes()),dtype='<f4').reshape(-1,13);changes=[]
 for index,r in enumerate(data):
  if not manifest['names'][int(r[0])].startswith('rock_'):continue
  x,y=float(r[4]),float(r[8]);fx,fy=(x-ox)/step,(y-oy)/step;i,j=math.floor(fx),math.floor(fy)
  if not (0<=i<cols-1 and 0<=j<rows-1):continue
  hs=[nav['heights'][j*cols+i],nav['heights'][j*cols+i+1],nav['heights'][(j+1)*cols+i],nav['heights'][(j+1)*cols+i+1]]
  if any(h is None for h in hs):continue
  hit,*_=ground.ray_cast(Vector((x,y,64)),Vector((0,0,-1)))
  if hit is None:continue
  a,b=fx-i,fy-j;height=(hs[0]*(1-a)+hs[1]*a)*(1-b)+(hs[2]*(1-a)+hs[3]*a)*b
  delta=height-hit.z
  if .002<abs(delta)<.3:changes.append([index,round(delta,6)]);deltas.append(delta)
 if changes:result[key]=changes
(out/'rock-contact.json').write_text(json.dumps(result,separators=(',',':')),encoding='utf8')
report={'correctedInstances':len(deltas),'minOffset':min(deltas),'maxOffset':max(deltas),'xyRotationScaleChanged':False,'sourceTilesChanged':False}
(out/'production.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(report,flush=True)
