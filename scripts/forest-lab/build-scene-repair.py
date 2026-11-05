"""Conservative UV-delimited Blender repair of the existing source export.
No source blend, source placements or previous runtime files are changed.
"""
import bpy, json, os, math
from pathlib import Path
root=Path.cwd(); out=root/'artifacts-local/pine-scene-repair/authoring';out.mkdir(parents=True,exist_ok=True)
source=Path(os.environ['LOCALAPPDATA'])/'UNIVERSE-OF-ME/asset-audit/candidate-assets/pine-source-conversion/batch6/landmarks-source.glb'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
report=[]
seen=set()
for obj in list(bpy.context.scene.objects):
 if obj.type!='MESH':continue
 if obj.data.name in seen:continue
 seen.add(obj.data.name)
 before=len(obj.data.polygons)
 if obj.name.startswith('montaigle'):
  modifier=obj.modifiers.new('Preserve UV islands and stone normals','DECIMATE')
  modifier.decimate_type='DISSOLVE';modifier.angle_limit=math.radians(2)
  modifier.delimit={'UV','NORMAL','MATERIAL','SEAM'}
  if obj.data.users>1:obj.data=obj.data.copy()
  bpy.context.view_layer.objects.active=obj
  bpy.ops.object.modifier_apply(modifier=modifier.name)
 report.append({'name':obj.name,'before':before,'after':len(obj.data.polygons),'uvLayers':[u.name for u in obj.data.uv_layers]})
# Sharing remains explicit for the repeated source ruin placement.
original=bpy.data.objects.get('montaigle_ruins_01');duplicate=bpy.data.objects.get('montaigle_ruins_01.001')
if original and duplicate:duplicate.data=original.data
for image in bpy.data.images:
 if image.size[0]>1024 or image.size[1]>1024:
  scale=1024/max(image.size);image.scale(round(image.size[0]*scale),round(image.size[1]*scale))
bpy.ops.export_scene.gltf(filepath=str(out/'landmarks.glb'),export_format='GLB',export_apply=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'landmarks-repaired.blend'))
(out/'production.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print('REPAIRED_LANDMARKS',report,flush=True)
