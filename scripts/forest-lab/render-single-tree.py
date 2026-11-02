import bpy
import math
import os
from mathutils import Vector

root = os.path.join(os.environ["LOCALAPPDATA"], "UNIVERSE-OF-ME", "asset-audit", "candidate-assets", "single-tree")
os.makedirs(root, exist_ok=True)
tree = bpy.data.objects["pine_02"]
depsgraph = bpy.context.evaluated_depsgraph_get()
source_mesh = bpy.data.meshes.new_from_object(tree.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
for obj in bpy.data.objects:
    if obj.type in {"MESH", "CURVE", "FONT", "VOLUME", "POINTCLOUD"} and obj != tree:
        obj.hide_render = True
reference = bpy.data.objects.new("pine_02_reference", source_mesh)
bpy.context.scene.collection.objects.link(reference)

scene = bpy.context.scene
for layer in scene.view_layers:
    layer.use = layer.name == "main_scene"
scene.render.engine = "CYCLES"
scene.cycles.samples = 8
scene.cycles.use_denoising = True
scene.render.use_simplify = True
scene.cycles.texture_limit_render = "2048"
scene.render.resolution_x = 1440
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.use_nodes = False
camera = bpy.data.cameras.new("single_tree_camera")
camera.lens = 35
object_camera = bpy.data.objects.new("single_tree_camera", camera)
scene.collection.objects.link(object_camera)
scene.camera = object_camera
target = Vector((0, 0, 7.5))
for label, offset in (("near", (18, -18, 9)), ("mid", (37, -37, 12))):
    object_camera.location = offset
    object_camera.rotation_euler = (target - object_camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(root, "blender-" + label + ".png")
    print("SINGLE_TREE_RENDER", label, scene.render.filepath, flush=True)
    bpy.ops.render.render(write_still=True)
