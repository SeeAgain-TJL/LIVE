import bpy
import os

root = os.path.join(os.environ["LOCALAPPDATA"], "UNIVERSE-OF-ME", "asset-audit", "candidate-assets")
source = os.path.join(root, "textures", "evening_road_01_puresky_8k.exr")
target = os.path.join(root, "pine-runtime", "sky.hdr")
image = bpy.data.images.load(source, check_existing=False)
print("SKY_SOURCE", image.size[:], source)
image.scale(2048, 1024)
image.filepath_raw = target
image.file_format = "HDR"
image.save()
print("SKY_DONE", target)
