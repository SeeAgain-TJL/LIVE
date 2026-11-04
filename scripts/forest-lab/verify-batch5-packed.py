"""Audit portable authoring inputs without relying on external texture paths."""
import bpy,json
from pathlib import Path
assert Path(bpy.data.filepath).name=='pine-batch5-creek-stand.blend'
images=[i for i in bpy.data.images if i.type=='IMAGE']
unpacked=[i.name for i in images if not i.packed_file]
assert not unpacked,unpacked
terrain=bpy.data.objects['source_terrain_with_local_relief']
assert len(terrain.data.vertices)>100000
assert not any(n.inputs['Displacement'].is_linked for n in terrain.data.materials[0].node_tree.nodes if n.type=='OUTPUT_MATERIAL')
r={'passed':True,'packedImages':len(images),'unpacked':unpacked,'objects':len(bpy.context.scene.objects),'terrainVertices':len(terrain.data.vertices),'sourceNotNeededToOpen':True}
out=Path.cwd()/'docs/reviews/pine-batch5/packed-authoring.json';out.write_text(json.dumps(r,indent=2)+'\n')
print('PACKED_AUTHORING',json.dumps(r),flush=True)
