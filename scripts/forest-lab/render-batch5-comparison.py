"""Render the packed derived sample, not the untouched official Cycles scene."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
assert Path(bpy.data.filepath).name=='pine-batch5-creek-stand.blend'
root=Path.cwd();out=root/'artifacts-local/pine-batch5/blender';scene=bpy.context.scene
sun=bpy.data.objects['creek_morning_sun']
sun.rotation_euler=Vector((30,12,-45)).to_track_quat('-Z','Y').to_euler()
terrain=bpy.data.objects['source_terrain_with_local_relief']
material=terrain.data.materials[0].copy();terrain.data.materials[0]=material
for node in material.node_tree.nodes:
    if node.type=='OUTPUT_MATERIAL':
        for link in list(node.inputs['Displacement'].links):material.node_tree.links.remove(link)
# Packed images make this sample editable without machine-specific file paths.
missing=[i.name for i in bpy.data.images if i.type=='IMAGE' and not i.packed_file and not Path(bpy.path.abspath(i.filepath)).is_file()]
assert not missing,missing
scene.camera.data.sensor_fit='VERTICAL';scene.camera.data.sensor_height=24
scene.camera.data.lens=24/(2*math.tan(math.radians(48.5)/2))
scene.render.resolution_x=960;scene.render.resolution_y=600;scene.render.resolution_percentage=100
poses={
 'near':{'position':[23.155473709106445,.9223032593727112,47.55979919433594],'direction':[-.9821439487,.1260486988,-.1396602648]},
 'mid':{'position':[0,3,43],'direction':[0,-.08,-1]},
 'far':{'position':[10,18,60],'direction':[.1,-.5,-1]},
}
report={'verticalFov':48.5,'resolution':[960,600],'samples':16,'denoised':True,'packedImages':sum(bool(i.packed_file) for i in bpy.data.images),'missingImages':missing,'poses':poses,
 'limitations':['Derived existing near-tree / mid-prop geometry, not full original Cycles trees.','Tiny moss cards omitted in Blender preview; full terrain extends beyond core, props do not.','Different lighting, fog, tone mapping and resolution; matching position/direction/framing only.']}
for name,pose in poses.items():
 p=pose['position'];d=pose['direction'];scene.camera.location=(p[0],-p[2],p[1])
 scene.camera.rotation_euler=Vector((d[0],-d[2],d[1])).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=str(out/f'blender-{name}.png');bpy.ops.render.render(write_still=True)
 if name=='near':
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
(out/'comparison.json').write_text(json.dumps(report,indent=2))
print('BATCH5_COMPARISON',json.dumps(report),flush=True)
