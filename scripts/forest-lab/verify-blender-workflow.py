"""Blender 4.4: inspect an isolated Pine Forest copy, reversible source export.

Run with --background <COPY.blend> --python this.py -- <output-directory>.
Never saves the loaded scene or original blend. Only one small original mesh is
copied into a temporary scene for native glTF export; all originals stay intact.
"""
import bpy
import sys
import os
import json
from collections import Counter

output = os.path.abspath(sys.argv[sys.argv.index('--') + 1])
os.makedirs(output, exist_ok=True)
source_dir = os.path.join(os.environ['LOCALAPPDATA'], 'UNIVERSE-OF-ME', 'asset-audit', 'candidate-assets')
assert os.path.abspath(bpy.data.filepath) != os.path.join(source_dir, 'polyhaven_pine_fir_forest.blend')
report = {'version': bpy.app.version_string, 'loadedCopy': bpy.data.filepath,
          'objects': len(bpy.data.objects), 'meshes': len(bpy.data.meshes),
          'materials': len(bpy.data.materials), 'images': len(bpy.data.images),
          'sourceTrees': [], 'needleMaterials': [], 'exports': []}
for image in bpy.data.images:
    if image.filepath.startswith('//'):
        image.filepath = os.path.join(source_dir, image.filepath[2:])
for obj in bpy.data.objects:
    if obj.name in ['pine_02', 'silver_fir_02']:
        report['sourceTrees'].append({'name': obj.name, 'mesh': obj.data.name,
            'modifiers': [(m.name, m.type) for m in obj.modifiers],
            'materials': [m.name if m else None for m in obj.data.materials]})
for material in bpy.data.materials:
    if material.name not in ['pine_twig', 'fir_twig']:
        continue
    nodes = material.node_tree.nodes if material.use_nodes else []
    for node in nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            node.image.reload()
    report['needleMaterials'].append({'name': material.name,
        'surface': material.surface_render_method, 'backfaceCulling': material.use_backface_culling,
        'nodes': dict(Counter(n.type for n in nodes)),
        'images': [{'name': n.image.name, 'file': n.image.filepath, 'size': list(n.image.size),
                    'colorSpace': n.image.colorspace_settings.name}
                   for n in nodes if n.type == 'TEX_IMAGE' and n.image],
        'links': [(l.from_node.name, l.from_socket.name, l.to_node.name, l.to_socket.name)
                  for l in material.node_tree.links]})

# Resolve the copy's relative image paths against the original directory without
# saving any changes to either blend. Keep original mesh/material and UV intact.
for image in bpy.data.images:
    if image.filepath.startswith('//'):
        image.filepath = os.path.join(source_dir, image.filepath[2:])
candidate = next(o for o in bpy.data.objects if o.type == 'MESH' and
                 'rock' in o.name.lower() and 20 < len(o.data.polygons) < 10000)
scene = bpy.data.scenes.new('batch3_reversible_export')
copy = candidate.copy()
copy.data = candidate.data.copy()
scene.collection.objects.link(copy)
bpy.context.window.scene = scene
copy.hide_set(False)
copy.hide_viewport = False
copy.select_set(True)
bpy.context.view_layer.objects.active = copy
before = copy.location.copy()
copy.location.x += 0.125
changed = list(copy.location)
copy.location = before
destination = os.path.join(output, 'source-rock-roundtrip.glb')
bpy.ops.export_scene.gltf(filepath=destination, export_format='GLB', use_selection=True,
                          export_apply=True, export_yup=True)
report['exports'].append({'source': candidate.name, 'vertices': len(copy.data.vertices),
    'polygons': len(copy.data.polygons), 'UV': list(copy.data.uv_layers.keys()),
    'temporaryTranslation': changed, 'restoredTranslation': list(copy.location),
    'path': destination, 'bytes': os.path.getsize(destination)})
bpy.data.objects.remove(copy, do_unlink=True)
bpy.data.scenes.remove(scene)
report['savedBlend'] = False
with open(os.path.join(output, 'workflow.json'), 'w', encoding='utf-8') as handle:
    json.dump(report, handle, ensure_ascii=False, indent=2)
print('BATCH3_BLENDER_WORKFLOW', json.dumps(report, ensure_ascii=False), flush=True)
