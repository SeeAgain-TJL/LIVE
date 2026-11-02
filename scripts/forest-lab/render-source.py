import bpy
import os

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 2
scene.cycles.use_denoising = False
scene.render.resolution_x = 1440
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.use_simplify = True
scene.render.simplify_subdivision = 0
scene.cycles.texture_limit_render = "1024"
scene.use_nodes = False
for layer in scene.view_layers:
    if layer.name != "main_scene":
        layer.use = False
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = os.path.join(
    os.environ["LOCALAPPDATA"],
    "UNIVERSE-OF-ME", "asset-audit", "candidate-assets", "pine-source-camera-1440.png"
)
print("SOURCE_BASELINE", scene.render.filepath, "samples", scene.cycles.samples)
bpy.ops.render.render(write_still=True)
