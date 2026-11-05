"""Original pine_02 at the three browser review cameras (isolated subject)."""
import json
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

out = Path("artifacts-local/pine-tree-rebuild/reference").resolve()
out.mkdir(parents=True, exist_ok=True)
source = bpy.context.scene
scene = bpy.data.scenes.new("Original pine_02, matching browser cameras")
bpy.context.window.scene = scene
scene.world = source.world
for light in source.objects:
    if light.type == "LIGHT":
        scene.collection.objects.link(light.copy())

tree = bpy.data.objects["pine_02"].copy()
scene.collection.objects.link(tree)
placements = json.loads(Path("public/forest-origin-assets/source-tree-placements.json").read_text())
tree.matrix_world = Matrix(next(item["matrix"] for item in placements if item["persistentId"] == -1419543884))
tree.hide_render = False
tree.hide_set(False)
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.eevee.taa_render_samples = 24
scene.render.resolution_x, scene.render.resolution_y = 1440, 900
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.render.image_settings.file_format = "PNG"
scene.use_nodes = False
camera = bpy.data.objects.new("Matched browser pose", bpy.data.cameras.new("Vertical FOV 48.5 degrees"))
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.sensor_fit = "VERTICAL"
camera.data.angle_y = math.radians(48.5)

poses = {
    "pine02Near": ((13.8, 2.2, 57), (-4.5, 5, -2.1)),
    "pine02Mid": ((22, 2, 62), (-12.7, 5.5, -7.1)),
    "pine02Far": ((48, 7, 70), (-38.7, 1.5, -15.1)),
}
for label, (position, direction) in poses.items():
    camera.location = Vector((position[0], -position[2], position[1]))
    camera.rotation_euler = Vector((direction[0], -direction[2], direction[1])).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(out / f"{label}.png")
    bpy.ops.render.render(write_still=True)
