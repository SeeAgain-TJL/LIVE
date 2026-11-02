"""Export source Pine Forest ground meshes as reusable glTF PBR assets.

Only copies original mesh datablocks and uses original texture maps. The source
.blend is opened in background mode and is never saved.
"""

import bpy
import json
import os
from pathlib import Path


root = Path(os.environ["LOCALAPPDATA"]) / "UNIVERSE-OF-ME" / "asset-audit" / "candidate-assets"
destination = root / "pine-source-conversion" / "props"
destination.mkdir(parents=True, exist_ok=True)
inventory = json.loads((root / "pine-source-conversion" / "render-inventory.json").read_text(encoding="utf-8"))
source_names = [entry["name"] for entry in inventory["sourceMeshAssets"]]
textures = root / "textures"


def image_node(nodes, file, color):
    image = bpy.data.images.load(str(textures / file), check_existing=True)
    image.colorspace_settings.name = "sRGB" if color else "Non-Color"
    node = nodes.new("ShaderNodeTexImage")
    node.image = image
    return node


def texture_prefix(material_name):
    if material_name == "pine_cover":
        return "pine_cover_01"
    if material_name == "fir_sapling_branches":
        return "fir_bark"
    if material_name == "moss_01":
        return "moss"
    return material_name


materials = {}
limitations = []


def pbr_material(original):
    if original.name in materials:
        return materials[original.name]
    name = original.name
    prefix = texture_prefix(name)
    material = bpy.data.materials.new(name + "_source_pbr")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    links = material.node_tree.links
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    shader.inputs["Metallic"].default_value = 0
    diffuse = f"{prefix}_diff.png"
    rough = f"{prefix}_rough.png"
    normal = f"{prefix}_nor_gl.png"
    alpha = f"{prefix}_alpha.png"
    if name == "pine_cover":
        diffuse, normal = "pine_cover_01_diffuse.png", "pine_cover_01_diffuse_normal.png"
    for file, socket, color in ((diffuse, "Base Color", True), (rough, "Roughness", False)):
        if (textures / file).exists():
            links.new(image_node(nodes, file, color).outputs["Color"], shader.inputs[socket])
        else:
            limitations.append(f"{name}: missing {file}")
    if (textures / normal).exists():
        node = image_node(nodes, normal, False)
        mapping = nodes.new("ShaderNodeNormalMap")
        links.new(node.outputs["Color"], mapping.inputs["Color"])
        links.new(mapping.outputs["Normal"], shader.inputs["Normal"])
    if (textures / alpha).exists():
        links.new(image_node(nodes, alpha, False).outputs["Color"], shader.inputs["Alpha"])
        material.surface_render_method = "DITHERED"
        material.use_backface_culling = False
    if name == "grass_medium_01":
        limitations.append("grass_medium_01: original dry/green shader mix is not baked; base atlas retained")
    elif name == "dead_tree":
        limitations.append("dead_tree: original tiled/detail shader mix is not baked; base atlas retained")
    elif name == "moss_01":
        limitations.append("moss_01: original moss mask shader mix is not baked; base atlas retained")
    elif name == "pine_cover":
        limitations.append("pine_cover: original mask shader mix is not baked; base atlas retained")
    materials[name] = material
    return material


for obj in list(bpy.context.scene.objects):
    obj.select_set(False)
exported = []
for name in source_names:
    source = bpy.data.objects[name]
    if source.type != "MESH":
        raise RuntimeError(f"{name} is not a mesh")
    copy = bpy.data.objects.new("source__" + name, source.data.copy())
    bpy.context.scene.collection.objects.link(copy)
    copy.data.materials.clear()
    for original in source.data.materials:
        if original is None:
            raise RuntimeError(f"{name} contains an empty material slot")
        copy.data.materials.append(pbr_material(original))
    copy.select_set(True)
    exported.append(copy)

path = destination / "source-props.glb"
bpy.context.view_layer.objects.active = exported[0]
bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                          export_apply=True, export_yup=True, export_image_format="AUTO")
report = {"sourceObjects": len(exported), "sourceMaterials": sorted(materials), "limitations": sorted(set(limitations)),
          "output": str(path), "bytes": path.stat().st_size}
(destination / "export-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print("SOURCE_PROPS_EXPORT", len(exported), len(materials), path.stat().st_size, flush=True)
for limitation in report["limitations"]:
    print("MATERIAL_LIMITATION", limitation, flush=True)
