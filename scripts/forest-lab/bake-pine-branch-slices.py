"""Representative pine_02 only: native-material, fixed 3D crown slices.
This replaces destructive needle simplification with a bounded baked volume;
it is not a camera-facing whole-tree card or a synthetic needle overlay.
"""
import bpy,json,math
from pathlib import Path
from mathutils import Matrix,Vector
out=Path('artifacts-local/pine-scene-repair/pine02-bake').resolve();out.mkdir(parents=True,exist_ok=True)
source_scene=bpy.context.scene
scene=bpy.data.scenes.new('Source branch volume bake');bpy.context.window.scene=scene
scene.world=source_scene.world
tree=bpy.data.objects['pine_02'].copy();tree.data=tree.data.copy();tree.matrix_world=Matrix.Identity(4)
scene.collection.objects.link(tree);tree.hide_render=False;tree.hide_set(False)
group=bpy.data.node_groups.new('Realize source crown for baking','GeometryNodeTree')
group.interface.new_socket(name='Geometry',in_out='INPUT',socket_type='NodeSocketGeometry');group.interface.new_socket(name='Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry')
inp=group.nodes.new('NodeGroupInput');realize=group.nodes.new('GeometryNodeRealizeInstances');end=group.nodes.new('NodeGroupOutput')
group.links.new(inp.outputs['Geometry'],realize.inputs['Geometry']);group.links.new(realize.outputs['Geometry'],end.inputs['Geometry'])
tree.modifiers.new('Realize','NODES').node_group=group
deps=bpy.context.evaluated_depsgraph_get();mesh=bpy.data.meshes.new_from_object(tree.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
obj=bpy.data.objects.new('Original pine needle surface',mesh);scene.collection.objects.link(obj);bpy.data.objects.remove(tree,do_unlink=True)
transparent=bpy.data.materials.new('Only crown for baking');transparent.use_nodes=True;transparent.node_tree.nodes.clear()
t=transparent.node_tree.nodes.new('ShaderNodeBsdfTransparent');o=transparent.node_tree.nodes.new('ShaderNodeOutputMaterial');transparent.node_tree.links.new(t.outputs[0],o.inputs['Surface'])
for i,m in enumerate(mesh.materials):
 if not m or 'twig' not in m.name:mesh.materials[i]=transparent
for light in source_scene.objects:
 if light.type=='LIGHT':scene.collection.objects.link(light.copy())
meta=json.loads(Path('public/forest-origin-assets/batch2/impostors/pine_02.json').read_text());c=meta['center'];center=Vector((c[0],-c[2],c[1]))
camera=bpy.data.objects.new('Slice bake camera',bpy.data.cameras.new('Slice bake camera'));scene.collection.objects.link(camera);scene.camera=camera
camera.data.type='ORTHO';camera.data.ortho_scale=meta['height']
scene.render.engine='BLENDER_EEVEE_NEXT'
if hasattr(scene.eevee,'taa_render_samples'):scene.eevee.taa_render_samples=16
scene.render.film_transparent=True;scene.render.resolution_x=512;scene.render.resolution_y=1024;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.use_nodes=False
scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0
records=[]
for axis in [0,1]:
 lo=meta['bounds']['min'][0] if axis==0 else -meta['bounds']['max'][2]
 hi=meta['bounds']['max'][0] if axis==0 else -meta['bounds']['min'][2]
 for index in range(8):
  a=lo+(hi-lo)*index/8;b=lo+(hi-lo)*(index+1)/8
  camera.location=center.copy();camera.location[axis]=100
  direction=Vector((0,0,0));direction[axis]=-1;camera.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
  camera.data.clip_start=100-b-.002;camera.data.clip_end=100-a+.002
  filename=f'slice-{axis}-{index}.png';scene.render.filepath=str(out/filename);bpy.ops.render.render(write_still=True)
  rotation=camera.rotation_euler.to_matrix();right=rotation@Vector((1,0,0));up=rotation@Vector((0,1,0));origin=center.copy();origin[axis]=(a+b)/2
  corners=[origin+right*(sx*meta['width']/2)+up*(sy*meta['height']/2) for sx,sy in [(-1,-1),(1,-1),(1,1),(-1,1)]]
  records.append({'file':filename,'corners':[[v.x,v.z,-v.y] for v in corners]})
(out/'slices.json').write_text(json.dumps({'species':'pine_02','sourceFaces':len(mesh.polygons),'slices':records},indent=2),encoding='utf8')
print('SOURCE_VOLUME_BAKED',len(records),flush=True)
