"""Blender/VRM pipeline test. This mannequin is NOT the project character."""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

out = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
out.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.preferences.addon_enable(module='io_scene_vrm')
import io_scene_vrm

report = {'blender': bpy.app.version_string, 'python': sys.version,
          'addon': list(io_scene_vrm.bl_info['version']),
          'config': bpy.utils.user_resource('CONFIG'),
          'status': 'pipeline-test-only; not character art'}
bpy.ops.wm.save_userpref()

rig_data = bpy.data.armatures.new('TEST_Humanoid')
rig = bpy.data.objects.new('TEST_Humanoid', rig_data)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bones = {
    'hips': ((0,0,.88),(0,0,1.0),None),
    'spine': ((0,0,1.0),(0,0,1.17),'hips'),
    'chest': ((0,0,1.17),(0,0,1.34),'spine'),
    'neck': ((0,0,1.34),(0,0,1.43),'chest'),
    'head': ((0,0,1.43),(0,0,1.67),'neck'),
}
for side, s in [('left',1),('right',-1)]:
    bones.update({
        f'{side}_upper_arm': ((s*.16,0,1.32),(s*.40,0,1.32),'chest'),
        f'{side}_lower_arm': ((s*.40,0,1.32),(s*.62,0,1.32),f'{side}_upper_arm'),
        f'{side}_hand': ((s*.62,0,1.32),(s*.72,0,1.32),f'{side}_lower_arm'),
        f'{side}_upper_leg': ((s*.09,0,.90),(s*.09,0,.51),'hips'),
        f'{side}_lower_leg': ((s*.09,0,.51),(s*.09,0,.10),f'{side}_upper_leg'),
        f'{side}_foot': ((s*.09,0,.10),(s*.09,-.16,.06),f'{side}_lower_leg'),
    })
for name, (head, tail, parent) in bones.items():
    bone = rig_data.edit_bones.new(name)
    bone.head, bone.tail = head, tail
    if parent:
        bone.parent = rig_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
ext = rig_data.vrm_addon_extension
ext.spec_version = '1.0'
for name in bones:
    getattr(ext.vrm1.humanoid.human_bones, name).node.bone_name = name
meta = ext.vrm1.meta
meta.vrm_name = 'UOM pipeline test mannequin - NOT final character'
meta.version = '0.1'
meta.authors.add().value = 'UNIVERSE OF ME procedural pipeline test'
meta.avatar_permission = 'onlyAuthor'
meta.allow_redistribution = False
meta.modification = 'allowModification'
mat = bpy.data.materials.new('Test blue')
mat.diffuse_color = (.13,.38,.6,1)
for name, (a,b,_) in bones.items():
    a,b = Vector(a),Vector(b)
    radius = .11 if name=='head' else .07 if name in ('hips','spine','chest') else .035
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,location=(a+b)*.5)
    obj = bpy.context.object
    obj.name = 'TEST_'+name
    obj.scale = (radius,radius,max((b-a).length*.5,radius))
    obj.rotation_euler = (b-a).to_track_quat('Z','Y').to_euler()
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.append(mat)
    vg=obj.vertex_groups.new(name=name)
    vg.add(list(range(len(obj.data.vertices))),1,'REPLACE')
    obj.modifiers.new('Test skin','ARMATURE').object=rig
    obj.parent=rig
    for p in obj.data.polygons:p.use_smooth=True
bpy.context.view_layer.objects.active=rig
report['export'] = sorted(bpy.ops.export_scene.vrm(filepath=str(out/'pipeline-test.vrm')))
assert report['export']==['FINISHED'], report
blob=(out/'pipeline-test.vrm').read_bytes()
size=int.from_bytes(blob[12:16],'little')
gltf=json.loads(blob[20:20+size])
report['vrm_spec']=gltf['extensions']['VRMC_vrm']['specVersion']
report['humanoid_bones']=len(gltf['extensions']['VRMC_vrm']['humanoid']['humanBones'])
assert report['vrm_spec']=='1.0'

scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=12
scene.cycles.use_denoising=True
scene.render.resolution_x=480;scene.render.resolution_y=640
scene.render.resolution_percentage=100
scene.world.color=(.15,.15,.15)
for pos,power,size in [((2,-3,4),500,4),((-3,-1,2),350,3),((0,3,3),500,3)]:
    bpy.ops.object.light_add(type='AREA',location=pos)
    light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size
    light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(0,-4,1.0))
cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=2.1
for label,pos in [('front',(0,-4,1)),('side',(4,0,1)),('back',(0,4,1))]:
    cam.location=pos;cam.rotation_euler=(Vector((0,0,.88))-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(out/f'test-{label}.png')
    bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'pipeline-test.blend'))
# Reimport the file just produced; do not rely only on an export operator result.
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
report['import']=sorted(bpy.ops.import_scene.vrm(filepath=str(out/'pipeline-test.vrm')))
report['imported_armatures']=sum(o.type=='ARMATURE' for o in bpy.context.scene.objects)
report['imported_meshes']=sum(o.type=='MESH' for o in bpy.context.scene.objects)
assert report['import']==['FINISHED'] and report['imported_armatures'] and report['imported_meshes']
(out/'smoke-report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print('UOM_SMOKE_PASS',json.dumps(report))
