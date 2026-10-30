"""Reopen the saved source and GLB in fresh scenes. No edits to user archives."""
import bpy
import sys
import json
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]).resolve()
bpy.ops.wm.open_mainfile(filepath=str(out/'silver-spirit-draft01.blend'))
collection=bpy.data.collections.get('G01_DRAFT_EDITABLE')
assert collection and bpy.data.objects.get('FACE_custom_cheek_chin_nose_surface')
report={'blend_reopened':True,'editable_meshes':sum(o.type=='MESH' for o in collection.objects),
        'packed_references':sum(bool(i.packed_file) for i in bpy.data.images),
        'draft_marked': 'NOT visually approved' in bpy.context.scene.get('stage',''),
        'animation_scope':'camera turntable only; no character rig'}
assert report['packed_references']==2 and report['draft_marked']
glb=(out/'silver-spirit-draft01.glb').read_bytes()
gltf=json.loads(glb[20:20+int.from_bytes(glb[12:16],'little')])
report['glb_meshes']=len(gltf.get('meshes',[]))
report['vertex_colored_primitives']=sum('COLOR_0' in p.get('attributes',{}) for m in gltf.get('meshes',[]) for p in m['primitives'])
report['external_uris']=[x['uri'] for kind in ('images','buffers') for x in gltf.get(kind,[]) if 'uri' in x and not x['uri'].startswith('data:')]
assert not report['external_uris'] and report['vertex_colored_primitives']>0
bpy.ops.wm.read_factory_settings(use_empty=True)
report['glb_import']=sorted(bpy.ops.import_scene.gltf(filepath=str(out/'silver-spirit-draft01.glb')))
report['imported_meshes']=sum(o.type=='MESH' for o in bpy.context.scene.objects)
assert report['glb_import']==['FINISHED'] and report['imported_meshes']>0
(out/'verification.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print('UOM_ASSET_VERIFIED',json.dumps(report))
