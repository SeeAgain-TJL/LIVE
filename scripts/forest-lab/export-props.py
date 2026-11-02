import bpy
import bmesh
import json
import os
from mathutils import Vector
from mathutils.bvhtree import BVHTree

root = os.path.join(os.environ["LOCALAPPDATA"], "UNIVERSE-OF-ME", "asset-audit", "candidate-assets", "pine-runtime")
texture_root = os.path.join(root, "textures")
sources = {
    "rock": "rock_moss_set_01_a_lod0",
    "fern": "fern_01_a_lod0",
    "pine-proxy": "pine_proxy_large",
    "fir-proxy": "fir_proxy_large",
}


def material_for(kind):
    if kind.endswith("proxy"):
        return None
    prefix = "rock_moss_set_01" if kind == "rock" else "fern_02"
    material = bpy.data.materials.new(kind + "_web_pbr")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    for suffix, socket in (("diff", "Base Color"), ("rough", "Roughness")):
        image = bpy.data.images.load(os.path.join(texture_root, f"{prefix}_{suffix}.jpg"), check_existing=True)
        if suffix == "rough":
            image.colorspace_settings.name = "Non-Color"
        node = nodes.new("ShaderNodeTexImage")
        node.image = image
        material.node_tree.links.new(node.outputs["Color"], shader.inputs[socket])
    image = bpy.data.images.load(os.path.join(texture_root, f"{prefix}_nor_gl.jpg"), check_existing=True)
    image.colorspace_settings.name = "Non-Color"
    node = nodes.new("ShaderNodeTexImage")
    node.image = image
    normal = nodes.new("ShaderNodeNormalMap")
    material.node_tree.links.new(node.outputs["Color"], normal.inputs["Color"])
    material.node_tree.links.new(normal.outputs["Normal"], shader.inputs["Normal"])
    if kind == "fern":
        image = bpy.data.images.load(os.path.join(texture_root, f"{prefix}_alpha.png"), check_existing=True)
        image.colorspace_settings.name = "Non-Color"
        node = nodes.new("ShaderNodeTexImage")
        node.image = image
        material.node_tree.links.new(node.outputs["Color"], shader.inputs["Alpha"])
        material.surface_render_method = "DITHERED"
    return material


for kind, name in sources.items():
    if os.path.exists(os.path.join(root, kind + ".glb")):
        continue
    source = bpy.data.objects[name]
    mesh = source.data.copy()
    mesh.name = kind + "_web_mesh"
    if not kind.endswith("proxy"):
        mesh.materials.clear()
        mesh.materials.append(material_for(kind))
    obj = bpy.data.objects.new(kind + "_web", mesh)
    bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(root, kind + ".glb"), export_format="GLB",
        use_selection=True, export_apply=True, export_yup=True,
    )
    print("PROP", kind, len(mesh.polygons))
    bpy.data.objects.remove(obj, do_unlink=True)

source = bpy.data.objects["terrain_main"]
depsgraph = bpy.context.evaluated_depsgraph_get()
mesh = bpy.data.meshes.new_from_object(source.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
mesh_copy = bmesh.new()
mesh_copy.from_mesh(mesh)
bvh = BVHTree.FromBMesh(mesh_copy)
origin = (-80, -100)
step = 1.5
columns, rows = 91, 84
heights = []
for row in range(rows):
    for column in range(columns):
        x = origin[0] + column * step
        y = origin[1] + row * step
        hit = bvh.ray_cast(Vector((x, y, 100)), Vector((0, 0, -1)), 200)[0]
        heights.append(round(hit.z, 3) if hit else None)

placement_path = os.path.join(root, "placements.json")
with open(placement_path, encoding="utf-8") as file:
    placements = json.load(file)
placements["collision"] = {"origin": origin, "step": step, "columns": columns, "rows": rows, "heights": heights}
with open(placement_path, "w", encoding="utf-8") as file:
    json.dump(placements, file, separators=(",", ":"))
print("COLLISION", columns, rows)
mesh_copy.free()
