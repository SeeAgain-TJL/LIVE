"""Turn verified Poly Haven glTF sources into browser sized GLBs.

Run with Blender 4.2 background mode. This is asset processing, not character creation.
"""
import bpy
import bmesh
import os
import sys
from pathlib import Path

source = Path(os.environ['LOCALAPPDATA']) / 'UNIVERSE-OF-ME' / 'world-slice-source' / 'models'
dest = Path.cwd() / 'public' / 'world-slice'
dest.mkdir(parents=True, exist_ok=True)
ratios = {'island_tree_01': 1, 'island_tree_02': 1, 'fern_02': 1, 'shrub_03': 1, 'rock_moss_set_01': .5}
for name, ratio in ratios.items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source / name / (name + '_1k.gltf')))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    print('SOURCE', name, [(o.name, len(o.data.polygons), tuple(round(v, 3) for v in o.dimensions)) for o in meshes], flush=True)
    if name in ('island_tree_01', 'island_tree_02'):
        obj = meshes[0]
        # Keep leaf cards far denser than the trunk. Whole-mesh decimation
        # removed the canopy and made the scanned tree look dead.
        for material_index in (1, 2):
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True); bpy.context.view_layer.objects.active = obj
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='DESELECT')
            bm = bmesh.from_edit_mesh(obj.data)
            for face in bm.faces:
                face.select_set(face.material_index == material_index)
            bmesh.update_edit_mesh(obj.data)
            bpy.ops.mesh.separate(type='SELECTED')
            bpy.ops.object.mode_set(mode='OBJECT')
        meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
        for item in meshes:
            first = next((p.material_index for p in item.data.polygons), 0)
            ratio_by_material = {0: .25, 1: .2, 2: .08}
            ratio = ratio_by_material[first]
            mod = item.modifiers.new('Web decimation by surface', 'DECIMATE')
            mod.ratio = ratio
            with bpy.context.temp_override(object=item, active_object=item):
                bpy.ops.object.modifier_apply(modifier=mod.name)
        ratio = 1
    # Source glTF uses physical metres. Keep that scale for consistent placement in Three.js.
    if ratio < 1:
        for obj in meshes:
            if len(obj.data.polygons) < 2000:
                continue
            mod = obj.modifiers.new('Web decimation', 'DECIMATE')
            mod.ratio = ratio
            with bpy.context.temp_override(object=obj, active_object=obj):
                bpy.ops.object.modifier_apply(modifier=mod.name)
    for obj in meshes:
        obj.data.name = name + '_' + obj.name
    print('OUTPUT', name, [(o.name, len(o.data.polygons)) for o in meshes], flush=True)
    bpy.ops.export_scene.gltf(filepath=str(dest / (name + '.glb')), export_format='GLB', export_image_format='JPEG', export_apply=True, export_materials='EXPORT', export_yup=True)
