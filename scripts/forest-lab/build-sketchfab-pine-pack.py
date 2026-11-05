"""Extract LOLIPOP's CC BY 4.0 pine pack (Sketchfab e1e9c07b8e2e445c943fec660beefba2) per tree and LOD.

Geometry, UVs, normals and PBR textures are untouched. Each LOD is moved to a shared
trunk-base origin so the runtime can swap LODs in place. Output: pine-pack.glb (Y-up).
Run: blender --background --python scripts/forest-lab/build-sketchfab-pine-pack.py
"""
import re
from pathlib import Path
import bpy
from mathutils import Matrix

SRC = Path('artifacts-local/pine-sketchfab/pack/scene.gltf')
OUT = Path('artifacts-local/pine-sketchfab/build/pine-pack-raw.glb')
OUT.parent.mkdir(parents=True, exist_ok=True)
TREES = [f'Pine_{size}_{i}' for size in ('large', 'big', 'medium') for i in (1, 2, 3)]
LODS = {'L0': 'LOD0', 'L1': 'LOD1', 'L2': 'LOD2', 'BB': 'Billboard_LOD3'}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SRC.resolve()))
objects = {o.name: o for o in bpy.data.objects}
keep = []
for tree in TREES:
    for tag, source in LODS.items():
        holder = objects[f'{tree}_{source}']
        origin = holder.matrix_world.translation.copy()
        node = bpy.data.objects.new(f'{tree}__{tag}', None)
        bpy.context.scene.collection.objects.link(node)
        for child in list(holder.children):
            if child.type != 'MESH':
                continue
            world = child.matrix_world.copy()
            child.parent = None
            child.matrix_world = Matrix.Translation(-origin) @ world
            bpy.ops.object.select_all(action='DESELECT')
            child.select_set(True)
            bpy.context.view_layer.objects.active = child
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            child.parent = node
            keep.append(child)
        keep.append(node)
keep_names = {o.name for o in keep}
for o in list(bpy.data.objects):
    if o.name not in keep_names:
        bpy.data.objects.remove(o, do_unlink=True)
for o in keep:
    if o.type == 'MESH':
        o.name = o.name.replace('_Mat_0', '')
bpy.ops.export_scene.gltf(filepath=str(OUT.resolve()), export_format='GLB', export_yup=True,
                          export_tangents=True, export_animations=False, export_cameras=False,
                          export_lights=False, export_image_format='AUTO')
print('PACK_EXPORTED', len([o for o in keep if o.type == 'MESH']), 'meshes', OUT)