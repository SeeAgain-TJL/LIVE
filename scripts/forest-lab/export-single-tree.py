import bpy
import os
import sys
import numpy as np

root = os.environ.get("PINE_CONVERSION_OUTPUT") or os.path.join(
    os.environ["LOCALAPPDATA"], "UNIVERSE-OF-ME", "asset-audit", "candidate-assets", "single-tree"
)
os.makedirs(root, exist_ok=True)
source_name = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "pine_02"
source = bpy.data.objects[source_name]
duplicate = source.copy()
duplicate.data = source.data.copy()
bpy.context.collection.objects.link(duplicate)
group = bpy.data.node_groups.new(source_name + "_realize_for_export", "GeometryNodeTree")
group.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
group.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
input_node = group.nodes.new("NodeGroupInput")
realize = group.nodes.new("GeometryNodeRealizeInstances")
output_node = group.nodes.new("NodeGroupOutput")
group.links.new(input_node.outputs["Geometry"], realize.inputs["Geometry"])
group.links.new(realize.outputs["Geometry"], output_node.inputs["Geometry"])
duplicate.modifiers.new("realize_source_instances", "NODES").node_group = group
depsgraph = bpy.context.evaluated_depsgraph_get()
depsgraph.update()
mesh = bpy.data.meshes.new_from_object(duplicate.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
attribute = mesh.attributes["UVMap"]
values = np.empty(len(attribute.data) * 3, dtype=np.float32)
attribute.data.foreach_get("vector", values)
uv = mesh.uv_layers.new(name="SourceUV")
uv.data.foreach_set("uv", values.reshape(-1, 3)[:, :2].ravel())

for index, original in enumerate(list(mesh.materials)):
    if original is None:
        continue
    material = bpy.data.materials.new(original.name + "_single_tree")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    links = material.node_tree.links
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    candidates = []
    for source_node in original.node_tree.nodes if original.use_nodes else []:
        if source_node.type != "TEX_IMAGE" or not source_node.image:
            continue
        image_path = bpy.path.abspath(source_node.image.filepath)
        if image_path.endswith("_diff.png"):
            candidates.append(os.path.basename(image_path)[:-9])
    stem = original.name.split(".")[0]
    family = stem if stem in candidates else next(
        (candidate for candidate in candidates if not candidate.endswith("_bark")),
        candidates[0] if candidates else None,
    )
    if family is None:
        raise RuntimeError("No source diffuse atlas for " + original.name)
    print("SOURCE_MATERIAL_ATLAS", original.name, family, flush=True)
    for suffix, socket in (("diff", "Base Color"), ("rough", "Roughness"), ("nor_gl", "Normal"), ("alpha", "Alpha")):
        if suffix == "alpha" and not family.endswith("twig"):
            continue
        path = bpy.path.abspath("//textures/" + family + "_" + suffix + ".png")
        image = bpy.data.images.load(path, check_existing=True)
        if suffix != "diff":
            image.colorspace_settings.name = "Non-Color"
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = image
        if suffix == "nor_gl":
            normal = nodes.new("ShaderNodeNormalMap")
            links.new(texture.outputs["Color"], normal.inputs["Color"])
            links.new(normal.outputs["Normal"], shader.inputs["Normal"])
        else:
            links.new(texture.outputs["Color"], shader.inputs[socket])
    if family.endswith("twig"):
        material.surface_render_method = "DITHERED"
        material.alpha_threshold = 0.5
        material.use_backface_culling = False
    mesh.materials[index] = material

tree = bpy.data.objects.new(source_name + "_unreduced", mesh)
bpy.context.collection.objects.link(tree)
bpy.ops.object.select_all(action="DESELECT")
tree.select_set(True)
bpy.context.view_layer.objects.active = tree
destination = os.path.join(root, source_name + "_unreduced.glb")
bpy.ops.export_scene.gltf(filepath=destination, export_format="GLB", use_selection=True,
                          export_apply=True, export_yup=True, export_image_format="AUTO")
print("SINGLE_TREE_EXPORT", destination, "faces", len(mesh.polygons), "bytes", os.path.getsize(destination))
