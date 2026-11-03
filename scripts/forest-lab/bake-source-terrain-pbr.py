"""Bake original Pine Forest terrain PBR maps from a disposable source copy."""
import bpy
import os
import sys
from pathlib import Path

assert os.path.basename(bpy.data.filepath) == "pine-forest-copy.blend"
size = int(sys.argv[sys.argv.index("--") + 1])
out = Path(sys.argv[sys.argv.index("--") + 2]).resolve()
out.mkdir(parents=True, exist_ok=True)
assert size == 4096

source_root = Path(os.environ["LOCALAPPDATA"]) / "UNIVERSE-OF-ME/asset-audit/candidate-assets"
for image in bpy.data.images:
    if image.filepath.startswith("//"):
        image.filepath = str(source_root / image.filepath[2:])

scene = bpy.context.scene
source = bpy.data.objects["terrain_main"]
material = bpy.data.materials["main_terrain"]
depsgraph = bpy.context.evaluated_depsgraph_get()
mesh = bpy.data.meshes.new_from_object(source.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
terrain = bpy.data.objects.new("terrain_source_pbr", mesh)
scene.collection.objects.link(terrain)
terrain.matrix_world = source.matrix_world.copy()
terrain.data.materials.clear()
terrain.data.materials.append(material)
assert terrain.data.uv_layers.active and len(terrain.data.uv_layers.active.data) == len(mesh.loops)

# Baking in the source scene would also synchronize all high-poly scatter. Keep
# only the evaluated terrain in a new disposable scene, as in batch 3 tree work.
scene = bpy.data.scenes.new("batch3b_terrain_bake")
bpy.context.window.scene = scene
scene.collection.objects.link(terrain)

scene.render.engine = "CYCLES"
scene.cycles.samples = 1
scene.cycles.use_denoising = False
scene.render.bake.margin = 16
scene.render.bake.use_clear = True
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
scene.render.resolution_percentage = 100

def bake_image(name, bake_type, path, pass_filter=None, tangent=False):
    image = bpy.data.images.new(name, width=size, height=size, alpha=False, float_buffer=False)
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.colorspace_settings.name = "sRGB" if name == "basecolor" else "Non-Color"
    nodes = terrain.data.materials[0].node_tree.nodes
    for node in list(nodes):
        if node.type == "TEX_IMAGE" and node.name.startswith("Batch3B Bake"):
            nodes.remove(node)
    target = nodes.new("ShaderNodeTexImage")
    target.name = "Batch3B Bake " + name
    target.image = image
    nodes.active = target
    scene.render.bake.normal_space = "TANGENT"
    if tangent:
        scene.render.bake.normal_r = "POS_X"
        scene.render.bake.normal_g = "POS_Y"
        scene.render.bake.normal_b = "POS_Z"
    if bake_type == "EMIT":
        scene.render.bake.use_pass_color = True
        scene.render.bake.use_pass_direct = False
        scene.render.bake.use_pass_indirect = False
    bpy.ops.object.bake(type=bake_type, pass_filter=pass_filter or set())
    image.save()
    print("BAKE", name, image.filepath_raw, flush=True)
    return image

# Preserve the original attribute-driven forest/ground/trail material selection.
bpy.ops.object.select_all(action="DESELECT")
terrain.select_set(True)
bpy.context.view_layer.objects.active = terrain
base = bake_image("basecolor", "DIFFUSE", out / "basecolor.png", {"COLOR"})
normal = bake_image("normal", "NORMAL", out / "normal.png", tangent=True)

# The original material mixes three source roughness channels through the same
# path and river masks. Clone its node groups and route each roughness value to
# emission so Cycles can bake that exact mix without changing the source graph.
rough_material = material.copy()
terrain.data.materials[0] = rough_material
cloned_groups = {}
for node in rough_material.node_tree.nodes:
    if node.type != "GROUP" or not node.node_tree:
        continue
    original_group = node.node_tree
    copied = cloned_groups.get(original_group.name)
    if copied is None:
        copied = original_group.copy()
        cloned_groups[original_group.name] = copied
        rough_nodes = copied.nodes
        rough_shader = next((n for n in rough_nodes if n.type == "BSDF_PRINCIPLED"), None)
        rough_output = next((n for n in rough_nodes if n.type == "GROUP_OUTPUT"), None)
        rough_link = next((l for l in list(copied.links) if l.to_node == rough_shader and l.to_socket.name == "Roughness"), None)
        if not rough_shader or not rough_output or not rough_link:
            raise RuntimeError("Cannot find source roughness channel in " + original_group.name)
        rough_source = rough_link.from_socket
        copied.links.remove(rough_link)
        shader_link = next((l for l in list(copied.links) if l.to_node == rough_output and l.to_socket.name == "BSDF"), None)
        if not shader_link:
            raise RuntimeError("Cannot find source shader output in " + original_group.name)
        copied.links.remove(shader_link)
        emission = rough_nodes.new("ShaderNodeEmission")
        copied.links.new(rough_source, emission.inputs["Color"])
        copied.links.new(emission.outputs["Emission"], rough_output.inputs["BSDF"])
    node.node_tree = copied
rough = bake_image("roughness", "EMIT", out / "roughness.png")

terrain.data.materials[0] = material
report = out / "bake.json"
report.write_text(__import__("json").dumps({"source": bpy.data.filepath, "vertices": len(mesh.vertices),
    "polygons": len(mesh.polygons), "uv": terrain.data.uv_layers.active.name, "maps": [
        {"name": image.name, "path": image.filepath_raw, "size": list(image.size)} for image in (base, normal, rough)]}, indent=2), encoding="utf-8")
print("TERRAIN_PBR_DONE", report, flush=True)
