"""Build browser LODs from the already licensed V4.2 GLBs; originals remain untouched."""
import bpy
from pathlib import Path

root = Path.cwd() / 'public' / 'world-slice'
for name, level, ratio in [('island_tree_01', 'lod1', .22), ('island_tree_02', 'lod2', .045)]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(root / (name + '.glb')))
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH':
            continue
        modifier = obj.modifiers.new('Distance LOD', 'DECIMATE')
        modifier.ratio = ratio
        with bpy.context.temp_override(object=obj, active_object=obj):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    triangles = sum(len(obj.data.polygons) for obj in bpy.context.scene.objects if obj.type == 'MESH')
    bpy.ops.export_scene.gltf(filepath=str(root / (name + '-' + level + '.glb')), export_format='GLB', export_image_format='JPEG', export_apply=True)
    print('LOD', name, level, triangles, flush=True)
