"""Pack verified CC0 Poly Haven coastal source scans for the isolated browser lab."""
import bpy
from mathutils import Vector
from pathlib import Path
import os

source = Path(os.environ['LOCALAPPDATA']) / 'UNIVERSE-OF-ME' / 'world-slice-source' / 'r2'
target = Path.cwd() / 'public' / 'world-slice'
for name in ['coast_line_01', 'coastal_cliff_02', 'coast_rocks_01']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source / name / f'{name}_1k.gltf'))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    low = [min(p[i] for p in points) for i in range(3)]
    high = [max(p[i] for p in points) for i in range(3)]
    triangles = sum(len(obj.data.polygons) for obj in meshes)
    print('SCAN', name, 'bounds', low, high, 'triangles', triangles, flush=True)
    bpy.ops.export_scene.gltf(filepath=str(target / f'r2-{name}.glb'), export_format='GLB', export_image_format='JPEG', export_apply=True)
