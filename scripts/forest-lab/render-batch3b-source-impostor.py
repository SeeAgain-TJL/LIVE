"""Original pine_04 material, isolated Cycles render; source blend never saved."""
import bpy
import json
import os
import sys
import math
from pathlib import Path
from mathutils import Matrix, Vector

assert os.path.basename(bpy.data.filepath) == "pine-forest-copy.blend"
out = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
out.mkdir(parents=True, exist_ok=True)
views = 16 if "atlas" in sys.argv else 1
perspective = "perspective" in sys.argv
metadata = json.loads(Path("public/forest-origin-assets/batch3/impostors/pine_04.json").read_text(encoding="utf-8"))
root = Path(os.environ["LOCALAPPDATA"]) / "UNIVERSE-OF-ME/asset-audit/candidate-assets"
for image in bpy.data.images:
    if image.filepath.startswith("//"):
        image.filepath = str(root / image.filepath[2:])
original_scene = bpy.context.scene
scene = bpy.data.scenes.new("batch3b_original_pine04")
scene.world = original_scene.world
bpy.context.window.scene = scene
tree = bpy.data.objects["pine_04"].copy()
tree.data = tree.data.copy()
tree.matrix_world = Matrix.Identity(4)
scene.collection.objects.link(tree)
tree.hide_render = False
tree.hide_set(False)
group = bpy.data.node_groups.new("batch3b_realize", "GeometryNodeTree")
group.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
group.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
inp = group.nodes.new("NodeGroupInput")
realize = group.nodes.new("GeometryNodeRealizeInstances")
end = group.nodes.new("NodeGroupOutput")
group.links.new(inp.outputs["Geometry"], realize.inputs["Geometry"])
group.links.new(realize.outputs["Geometry"], end.inputs["Geometry"])
tree.modifiers.new("realize_source", "NODES").node_group = group
depsgraph = bpy.context.evaluated_depsgraph_get()
mesh = bpy.data.meshes.new_from_object(tree.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
original = bpy.data.objects.new("pine04_original_shader", mesh)
scene.collection.objects.link(original)
bpy.data.objects.remove(tree, do_unlink=True)
for obj in original_scene.objects:
    if obj.type == "LIGHT":
        scene.collection.objects.link(obj.copy())
camera = bpy.data.objects.new("same_atlas_camera", bpy.data.cameras.new("same_atlas_camera"))
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.type = "ORTHO"
camera.data.ortho_scale = metadata["height"]
# Three Y-up -> Blender Z-up, inverse of rotationX(-pi/2).
c = metadata["center"]
center = Vector((c[0], -c[2], c[1]))
scene.render.engine = "CYCLES"
scene.cycles.samples = 12
scene.cycles.use_denoising = True
scene.cycles.transparent_max_bounces = 16
scene.render.use_simplify = True
scene.cycles.texture_limit_render = "2048"
scene.render.film_transparent = True
scene.use_nodes = False
scene.render.resolution_x = 512
scene.render.resolution_y = 1024
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
if perspective:
    camera.data.type = "PERSP"
    camera.data.lens = 35.04
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 50
    scene.render.film_transparent = False
scene.view_settings.view_transform = original_scene.view_settings.view_transform
scene.view_settings.look = original_scene.view_settings.look
scene.view_settings.exposure = original_scene.view_settings.exposure
scene.view_settings.gamma = original_scene.view_settings.gamma
report = {"source": bpy.data.filepath, "species": "pine_04", "polygons": len(mesh.polygons),
          "materials": [m.name if m else None for m in mesh.materials], "views": views, "samples": scene.cycles.samples,
          "original_world": scene.world.name, "view_transform": scene.view_settings.view_transform,
          "center_blender": list(center), "width": metadata["width"], "height": metadata["height"],
          "perspective": perspective, "savedBlend": False}
(out / "render.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
for index in range(views):
    angle = index * 2 * math.pi / 16
    camera.location = center + Vector((math.sin(angle)*100, -math.cos(angle)*100, 0))
    if perspective:
        camera.location = center + Vector((18.9,-18.9,2.16))
    camera.rotation_euler = (center-camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(out / ("original-pine04-perspective.png" if perspective else "original-pine04-%02d.png" % index))
    bpy.ops.render.render(write_still=True)
    print("SOURCE_VIEW", index, flush=True)
