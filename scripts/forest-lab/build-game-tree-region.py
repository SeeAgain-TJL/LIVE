"""Import unmodified EZ-Tree preset meshes into Blender at 38 source tree transforms."""
import json
from pathlib import Path
import bpy
from mathutils import Matrix

root = Path('artifacts-local/pine-game-trees')
source = root / 'source/ez-tree/src/app/public/textures'
out = Path('public/forest-origin-assets/game-region')
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name, image, alpha=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .9
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(str(image.resolve()), check_existing=True)
    tex.image.pack()
    mat.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
    if alpha:
        # Export conventional MASK foliage with the author's alpha threshold.
        mask = mat.node_tree.nodes.new('ShaderNodeMath')
        mask.operation = 'GREATER_THAN'
        mask.inputs[1].default_value = .3
        mat.node_tree.links.new(tex.outputs['Alpha'], mask.inputs[0])
        mat.node_tree.links.new(mask.outputs[0], shader.inputs['Alpha'])
        mat.use_backface_culling = False
    return mat

bark = material('EZ bark', source/'bark/Bark003_1K-JPG/Bark003_1K-JPG_Color.jpg')
leaf = material('EZ pine foliage', source/'leaves/pine.png', True)
library = []
for i, item in enumerate(json.loads((root/'generated.json').read_text())):
    meshes = []
    height = max(item['parts'][0]['position'][1::3])
    for part in item['parts']:
        points = list(zip(part['position'][::3], part['position'][1::3], part['position'][2::3]))
        vertices = [(x/height, -z/height, y/height) for x,y,z in points]
        mesh = bpy.data.meshes.new(f"preset_{i}_{part['name']}")
        mesh.from_pydata(vertices, [], list(zip(part['index'][::3],part['index'][1::3],part['index'][2::3])))
        uv = mesh.uv_layers.new(name='UVMap')
        for polygon in mesh.polygons:
            polygon.use_smooth = True
            for loop in polygon.loop_indices:
                index = mesh.loops[loop].vertex_index
                uv.data[loop].uv = part['uv'][index*2:index*2+2]
        mesh.normals_split_custom_set_from_vertices([(x,-z,y) for x,y,z in zip(part['normal'][::3],part['normal'][1::3],part['normal'][2::3])])
        mesh.materials.append(leaf if part['name']=='leaves' else bark)
        meshes.append(mesh)
    library.append(meshes)

trees = json.loads(Path('public/forest-origin-assets/source-tree-placements.json').read_text())
selected = [t for t in trees if (t['matrix'][0][3]-4)**2+(t['matrix'][1][3]+44)**2<33**2]
assert len(selected)==38
for tree in selected:
    meta = json.loads(Path(f"public/forest-origin-assets/batch2/impostors/{tree['source']}.json").read_text())
    height = meta['bounds']['max'][1]
    variant = (0 if tree['source'].startswith('pine') else 1) + 2*(abs(tree['persistentId'])%2)
    for mesh in library[variant]:
        obj = bpy.data.objects.new(f"{tree['persistentId']}_{mesh.name}",mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.matrix_world = Matrix(tree['matrix']) @ Matrix.Diagonal((height,height,height,1))
bpy.ops.wm.save_as_mainfile(filepath=str((root/'game-region.blend').resolve()))
bpy.ops.export_scene.gltf(filepath=str((out/'trees.glb').resolve()),export_format='GLB',export_animations=False)
(out/'region.json').write_text(json.dumps({'center':[4,-44],'radius':33,'trees':selected},indent=2)+'\n')
print('AUTHORED_REGION',len(selected))
