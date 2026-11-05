"""Derive anchor clearance from actual source water/rocks and existing navigation.
This is environment data, not persisted Memory or Planet data.
"""
import bpy,json,gzip,math
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from collections import deque
runtime=Path('public/forest-origin-assets');out=runtime/'scene-repair';out.mkdir(exist_ok=True)
nav=json.loads((runtime/'environment/navigation.json').read_text())
cols,rows,step=nav['columns'],nav['rows'],nav['step'];ox,oy=nav['origin']
heights=nav['heights'];valid=np.array([v is not None and not nav['blocked'][i] for i,v in enumerate(heights)]).reshape(rows,cols)
safe=valid.copy();reachable=valid.copy()
# Run on the original blend: source meshes and the evaluated water keep their
# original Blender XY/Z-up coordinates, matching the navigation grid.
deps=bpy.context.evaluated_depsgraph_get();water=bpy.data.objects['river_water']
mesh=bpy.data.meshes.new_from_object(water.evaluated_get(deps))
bvh=BVHTree.FromPolygons([water.matrix_world@v.co for v in mesh.vertices],[p.vertices[:] for p in mesh.polygons])
water_count=0
for j in range(rows):
 for i in range(cols):
  h=heights[j*cols+i]
  if h is None:continue
  hit,*_=bvh.ray_cast(Vector((ox+i*step,oy+j*step,64)),Vector((0,0,-1)))
  if hit and hit.z>h-.12:
   safe[j,i]=False;water_count+=1
   if hit.z-h>.55:reachable[j,i]=False
# Conservative source-object bounds for stones/logs; no random relocation.
manifest=json.loads((runtime/'batch2/tiles/manifest.json').read_text());bounds={}
for index,name in enumerate(manifest['names'][:manifest['propAssetCount']]):
 if name.startswith(('rock_','dead_tree','tree_trunk','tree_roots')):
  obj=bpy.data.objects[name];bounds[index]=[Vector(c) for c in obj.bound_box]
rocks=0
for key in manifest['tiles']:
 data=np.frombuffer(gzip.decompress((runtime/f'batch2/tiles/{key}.bin.gz').read_bytes()),dtype='<f4').reshape(-1,13)
 for r in data:
  index=int(r[0])
  if index not in bounds:continue
  matrix=Matrix((r[1:5],r[5:9],r[9:13],[0,0,0,1]));corners=[matrix@c for c in bounds[index]]
  if max(c.z for c in corners)-min(c.z for c in corners)<.35:continue
  x0,x1=[min(c.x for c in corners)-.7,max(c.x for c in corners)+.7]
  y0,y1=[min(c.y for c in corners)-.7,max(c.y for c in corners)+.7]
  a,b=max(0,math.floor((x0-ox)/step)),min(cols,math.ceil((x1-ox)/step)+1)
  c,d=max(0,math.floor((y0-oy)/step)),min(rows,math.ceil((y1-oy)/step)+1)
  safe[c:d,a:b]=False;rocks+=1
# Reachability on the current navigation, excluding deep water. A full grid
# search also excludes isolated valid islands inside/behind source obstacles.
si=round((23.155473709-ox)/step);sj=round((-47.559799194-oy)/step)
seen=np.zeros((rows,cols),dtype=bool);queue=deque([(si,sj)]);seen[sj,si]=True
while queue:
 i,j=queue.popleft();h=heights[j*cols+i]
 for a,b in [(i-1,j),(i+1,j),(i,j-1),(i,j+1)]:
  if 0<=a<cols and 0<=b<rows and reachable[b,a] and not seen[b,a] and abs(heights[b*cols+a]-h)<.55:
   seen[b,a]=True;queue.append((a,b))
safe &= seen
# Reserve a full 1m standing patch and reject steep/local-height discontinuities.
clear=safe.copy()
for j in range(2,rows-2):
 for i in range(2,cols-2):
  if not safe[j-2:j+3,i-2:i+3].all():clear[j,i]=False;continue
  hs=[heights[b*cols+a] for b in range(j-2,j+3) for a in range(i-2,i+3)]
  if max(hs)-min(hs)>.65:clear[j,i]=False
clear[:2,:]=False;clear[-2:,:]=False;clear[:,:2]=False;clear[:,-2:]=False
result={'origin':nav['origin'],'step':step,'columns':cols,'rows':rows,'safe':clear.astype(int).ravel().tolist()}
(out/'memory-safety.json').write_text(json.dumps(result,separators=(',',':')),encoding='utf8')
report={'waterSamples':water_count,'rockInstances':rocks,'reachableSamples':int(seen.sum()),'safeSamples':int(clear.sum()),'sourceWaterFaces':len(mesh.polygons)}
(out/'safety-production.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(report,flush=True)
