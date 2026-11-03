"""Original terrain-only material reference, same camera as browser diagnostic."""
import bpy
import json
import math
import os
import sys
from pathlib import Path
from mathutils import Vector

assert os.path.basename(bpy.data.filepath) == "pine-forest-copy.blend"
out=Path(sys.argv[sys.argv.index("--")+1]).resolve()
out.mkdir(parents=True,exist_ok=True)
root=Path(os.environ["LOCALAPPDATA"])/"UNIVERSE-OF-ME/asset-audit/candidate-assets"
for image in bpy.data.images:
    if image.filepath.startswith("//"):
        image.filepath=str(root/image.filepath[2:])
original_scene=bpy.context.scene
source=bpy.data.objects["terrain_main"]
depsgraph=bpy.context.evaluated_depsgraph_get()
mesh=bpy.data.meshes.new_from_object(source.evaluated_get(depsgraph),preserve_all_data_layers=True,depsgraph=depsgraph)
scene=bpy.data.scenes.new("batch3b_original_terrain_only")
scene.world=original_scene.world
bpy.context.window.scene=scene
terrain=bpy.data.objects.new("original_terrain",mesh)
scene.collection.objects.link(terrain)
for obj in original_scene.objects:
    if obj.type=="LIGHT":scene.collection.objects.link(obj.copy())
camera=bpy.data.objects.new("matching_browser_camera",bpy.data.cameras.new("matching_browser_camera"))
scene.collection.objects.link(camera)
scene.camera=camera
camera.data.sensor_fit="VERTICAL"
camera.data.sensor_height=24
camera.data.lens=24/(2*math.tan(math.radians(48.5)/2))
position=Vector((23.155473709106445,-47.55979919433594,0.9223032593727112))
direction=Vector((-0.9821439487,0.1396602648,-0.18)).normalized()
camera.location=position
camera.rotation_euler=direction.to_track_quat("-Z","Y").to_euler()
scene.render.engine="CYCLES"
scene.cycles.samples=16
scene.cycles.use_denoising=True
scene.render.use_simplify=True
scene.cycles.texture_limit_render="2048"
scene.render.resolution_x=1440
scene.render.resolution_y=900
scene.render.resolution_percentage=50
scene.render.image_settings.file_format="PNG"
scene.use_nodes=False
scene.view_settings.view_transform=original_scene.view_settings.view_transform
scene.view_settings.look=original_scene.view_settings.look
scene.view_settings.exposure=original_scene.view_settings.exposure
scene.view_settings.gamma=original_scene.view_settings.gamma
scene.render.filepath=str(out/"original-terrain-same-camera.png")
(out/"camera.json").write_text(json.dumps({"blender_position":list(position),"blender_direction":list(direction),
    "three_position":[position.x,position.z,-position.y],"three_direction":[direction.x,direction.z,-direction.y],
    "fov":48.5,"samples":16,"resolution":[720,450],"terrain_only":True,"savedBlend":False},indent=2),encoding="utf-8")
bpy.ops.render.render(write_still=True)
