"""Isolated original Cycles tree reference; run on COPY.blend, never save it."""
import bpy
import os
import sys
import json
from mathutils import Vector, Matrix

folder = os.path.abspath(sys.argv[sys.argv.index('--') + 1])
os.makedirs(folder, exist_ok=True)
assert os.path.basename(bpy.data.filepath) == 'pine-forest-copy.blend'
source_dir = os.path.join(os.environ['LOCALAPPDATA'], 'UNIVERSE-OF-ME', 'asset-audit', 'candidate-assets')
for image in bpy.data.images:
    if image.filepath.startswith('//'):
        image.filepath = os.path.join(source_dir, image.filepath[2:])
original_scene = bpy.context.scene
scene = bpy.data.scenes.new('batch3_original_tree_only')
scene.world = original_scene.world
bpy.context.window.scene = scene
original = bpy.data.objects['pine_02']
tree = original.copy()
tree.data = original.data.copy()
tree.matrix_world = Matrix.Identity(4)
scene.collection.objects.link(tree)
tree.hide_render = False
tree.hide_set(False)
group = bpy.data.node_groups.new('batch3_realize', 'GeometryNodeTree')
group.interface.new_socket(name='Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
group.interface.new_socket(name='Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
input_node = group.nodes.new('NodeGroupInput')
realize = group.nodes.new('GeometryNodeRealizeInstances')
output_node = group.nodes.new('NodeGroupOutput')
group.links.new(input_node.outputs['Geometry'], realize.inputs['Geometry'])
group.links.new(realize.outputs['Geometry'], output_node.inputs['Geometry'])
tree.modifiers.new('batch3_realize', 'NODES').node_group = group
depsgraph = bpy.context.evaluated_depsgraph_get()
depsgraph.update()
mesh = bpy.data.meshes.new_from_object(tree.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
reference = bpy.data.objects.new('pine_02_original_material_reference', mesh)
scene.collection.objects.link(reference)
bpy.data.objects.remove(tree, do_unlink=True)
for obj in original_scene.objects:
    if obj.type == 'LIGHT':
        light = obj.copy()
        scene.collection.objects.link(light)
minimum = Vector(tuple(min(v.co[i] for v in mesh.vertices) for i in range(3)))
maximum = Vector(tuple(max(v.co[i] for v in mesh.vertices) for i in range(3)))
center = (minimum + maximum) / 2
camera = bpy.data.objects.new('batch3_reference_camera', bpy.data.cameras.new('batch3_camera'))
scene.collection.objects.link(camera)
camera.data.lens = 28.05  # horizontal FOV ~65.8 / vertical35.6 at16:10
camera.location = center + Vector((18.9, -18.9, 2.16))
camera.rotation_euler = (center-camera.location).to_track_quat('-Z', 'Y').to_euler()
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.samples = 8
scene.cycles.use_denoising = True
scene.render.resolution_x = 1440
scene.render.resolution_y = 900
scene.render.resolution_percentage = 50
scene.render.image_settings.file_format = 'PNG'
scene.use_nodes = False
scene.render.filepath = os.path.join(folder, 'blender-pine_02-original-cycles.png')
with open(os.path.join(folder, 'render.json'), 'w') as handle:
    json.dump({'copy': bpy.data.filepath, 'source': original.name, 'polygons': len(mesh.polygons),
               'vertices': len(mesh.vertices), 'materials': [m.name if m else None for m in mesh.materials],
               'center': list(center), 'camera': list(camera.location), 'samples': 8,
               'resolution': [720, 450], 'savedBlend': False}, handle, indent=2)
bpy.ops.render.render(write_still=True)
