import bpy
import os
import sys
import numpy as np

species = sys.argv[sys.argv.index("--") + 1]
source_names = {"pine": "pine_02", "fir": "silver_fir_01"}
if species not in source_names:
    raise ValueError(species)

root = os.path.join(os.environ["LOCALAPPDATA"], "UNIVERSE-OF-ME", "asset-audit", "candidate-assets", "pine-runtime")
texture_root = os.path.join(root, "textures")
os.makedirs(root, exist_ok=True)


def pbr_material(source_name):
    if "twig" in source_name:
        family = species + "_twig"
    elif source_name.startswith("pine_trunk_"):
        family = source_name.split(".")[0]
    else:
        family = species + "_bark"
    material = bpy.data.materials.new(source_name + "_web_pbr")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    shader.inputs["Metallic"].default_value = 0
    for suffix, socket in (("diff", "Base Color"), ("rough", "Roughness")):
        image = bpy.data.images.load(os.path.join(texture_root, f"{family}_{suffix}.jpg"), check_existing=True)
        if suffix != "diff":
            image.colorspace_settings.name = "Non-Color"
        node = nodes.new("ShaderNodeTexImage")
        node.image = image
        material.node_tree.links.new(node.outputs["Color"], shader.inputs[socket])
    image = bpy.data.images.load(os.path.join(texture_root, f"{family}_nor_gl.jpg"), check_existing=True)
    image.colorspace_settings.name = "Non-Color"
    node = nodes.new("ShaderNodeTexImage")
    node.image = image
    normal = nodes.new("ShaderNodeNormalMap")
    material.node_tree.links.new(node.outputs["Color"], normal.inputs["Color"])
    material.node_tree.links.new(normal.outputs["Normal"], shader.inputs["Normal"])
    if "twig" in source_name:
        image = bpy.data.images.load(os.path.join(texture_root, f"{family}_alpha.png"), check_existing=True)
        image.colorspace_settings.name = "Non-Color"
        node = nodes.new("ShaderNodeTexImage")
        node.image = image
        material.node_tree.links.new(node.outputs["Color"], shader.inputs["Alpha"])
        material.surface_render_method = "DITHERED"
        material.use_nodes = True
        material.diffuse_color = (0.8, 0.85, 0.78, 1)
    return material


source = bpy.data.objects[source_names[species]]
depsgraph = bpy.context.evaluated_depsgraph_get()
mesh = bpy.data.meshes.new_from_object(source.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
print("EVALUATED", species, len(mesh.polygons), "UV", len(mesh.uv_layers))
source_uv = mesh.attributes.get("UVMap")
if source_uv is None or source_uv.domain != "CORNER":
    raise RuntimeError("Evaluated tree has no corner UV attribute")
coordinates = np.empty(len(source_uv.data) * 3, dtype=np.float32)
source_uv.data.foreach_get("vector", coordinates)
uv_layer = mesh.uv_layers.new(name="WebUV")
uv_layer.data.foreach_set("uv", coordinates.reshape(-1, 3)[:, :2].ravel())
for index, old in enumerate(list(mesh.materials)):
    mesh.materials[index] = pbr_material(old.name if old else species + "_bark")

tree = bpy.data.objects.new(species + "_web", mesh)
bpy.context.collection.objects.link(tree)
bpy.ops.object.select_all(action="DESELECT")
tree.select_set(True)
bpy.context.view_layer.objects.active = tree

for name, ratio in (("high", 0.012), ("mid", 0.0025)):
    copy = tree.copy()
    copy.data = tree.data.copy()
    bpy.context.collection.objects.link(copy)
    tree.select_set(False)
    copy.select_set(True)
    bpy.context.view_layer.objects.active = copy
    modifier = copy.modifiers.new("web_lod", "DECIMATE")
    modifier.ratio = ratio
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    print("LOD", species, name, len(copy.data.polygons))
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(root, f"{species}-{name}.glb"),
        export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_image_format="AUTO",
    )
    bpy.data.objects.remove(copy, do_unlink=True)
    tree.select_set(True)

bpy.data.objects.remove(tree, do_unlink=True)
print("DONE", species)
