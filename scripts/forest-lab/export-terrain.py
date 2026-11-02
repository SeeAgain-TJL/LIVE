import bpy
import json
import os
from mathutils import Vector

root = os.path.join(os.environ["LOCALAPPDATA"], "UNIVERSE-OF-ME", "asset-audit", "candidate-assets", "pine-runtime")
os.makedirs(root, exist_ok=True)
scene = bpy.context.scene
source = bpy.data.objects["terrain_main"]
depsgraph = bpy.context.evaluated_depsgraph_get()
mesh = bpy.data.meshes.new_from_object(source.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
terrain = bpy.data.objects.new("pine_source_terrain_web", mesh)
scene.collection.objects.link(terrain)
print("TERRAIN", len(mesh.vertices), len(mesh.polygons), [item.name for item in mesh.attributes])

original_camera = scene.camera
original_target = original_camera.location + original_camera.rotation_euler.to_matrix() @ Vector((0, 0, -50))
placements = {"camera": list(original_camera.location), "target": list(original_target), "trees": [], "details": []}
for instance in depsgraph.object_instances:
    if not instance.is_instance:
        continue
    position = instance.matrix_world.translation
    if not (-80 < position.x < 55 and -100 < position.y < 25):
        continue
    name = instance.object.original.name
    category = None
    if name.startswith("pine_proxy"):
        category = "pine"
    elif name.startswith("fir_proxy"):
        category = "fir"
    elif name.startswith("rock_proxy"):
        category = "rock"
    elif name.startswith("fern_proxy"):
        category = "fern"
    if category is None:
        continue
    translation, rotation, scale = instance.matrix_world.decompose()
    entry = {"kind": category, "source": name, "position": list(translation), "rotation": list(rotation), "scale": list(scale)}
    placements["trees" if category in ("pine", "fir") else "details"].append(entry)

print("PLACEMENTS", len(placements["trees"]), len(placements["details"]))
with open(os.path.join(root, "placements.json"), "w", encoding="utf-8") as file:
    json.dump(placements, file, separators=(",", ":"))

for obj in list(scene.objects):
    if obj != terrain:
        bpy.data.objects.remove(obj, do_unlink=True)
bpy.ops.object.select_all(action="DESELECT")
terrain.select_set(True)
bpy.context.view_layer.objects.active = terrain

scene.render.engine = "CYCLES"
scene.cycles.samples = 1
scene.render.use_simplify = True
scene.cycles.texture_limit_render = "1024"
image = bpy.data.images.new("pine_terrain_bake", width=2048, height=2048, alpha=False)
image.filepath_raw = os.path.join(root, "terrain-baked.png")
image.file_format = "PNG"
material = terrain.data.materials[0]
target = material.node_tree.nodes.new("ShaderNodeTexImage")
target.image = image
material.node_tree.nodes.active = target
print("BAKE_START", image.filepath_raw)
bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, margin=4)
image.save()
material.node_tree.nodes.remove(target)

web = bpy.data.materials.new("pine_terrain_web_pbr")
web.use_nodes = True
shader = web.node_tree.nodes.get("Principled BSDF")
texture = web.node_tree.nodes.new("ShaderNodeTexImage")
texture.image = image
web.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
shader.inputs["Roughness"].default_value = 0.95
terrain.data.materials.clear()
terrain.data.materials.append(web)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(root, "terrain.glb"), export_format="GLB",
    use_selection=True, export_apply=True, export_yup=True,
)
print("TERRAIN_DONE", os.path.join(root, "terrain.glb"))
