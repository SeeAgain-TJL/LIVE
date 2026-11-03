"""Export the three original Poly Haven terrain materials (forest_leaves_04,
forest_ground_04, rocky_trail) untouched, plus the real path/river vertex
masks that blend them. Batch3B baked this three-layer blend into one flat
basecolor/normal/roughness triplet, which lost each material's own detail
frequency. This script ships the three source materials as-is so the browser
can blend them per-pixel with the original masks instead of an averaged bake.
Does not modify terrain geometry, vertex positions, or the source .blend.
"""
import bpy
import json
import os
import sys
from pathlib import Path

assert os.path.basename(bpy.data.filepath) == "pine-forest-copy.blend"
out = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
out.mkdir(parents=True, exist_ok=True)

source_root = Path(os.environ["LOCALAPPDATA"]) / "UNIVERSE-OF-ME/asset-audit/candidate-assets"
for image in bpy.data.images:
    if image.filepath.startswith("//"):
        image.filepath = str(source_root / image.filepath[2:])

terrain = bpy.data.objects["terrain_main"]
depsgraph = bpy.context.evaluated_depsgraph_get()
evaluated = terrain.evaluated_get(depsgraph)
mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
print("TERRAIN_EVAL", len(mesh.vertices), len(mesh.polygons), [a.name for a in mesh.attributes])

report = {"source": bpy.data.filepath, "vertices": len(mesh.vertices), "polygons": len(mesh.polygons),
          "masks": [], "materials": []}

material_groups = {"forest_leaves_04": "NodeGroup.024", "forest_ground_04": "NodeGroup.025", "rocky_trail": "NodeGroup.026"}
for material_name, group_name in material_groups.items():
    group = bpy.data.node_groups[group_name]
    maps = {}
    for node in group.nodes:
        if node.bl_idname != "ShaderNodeTexImage" or node.image is None:
            continue
        image = node.image
        src_path = Path(bpy.path.abspath(image.filepath))
        for suffix in ("diff", "rough", "nor_gl", "disp"):
            if src_path.name == f"{material_name}_{suffix}.png":
                dest = out / f"{material_name}_{suffix}.png"
                dest.write_bytes(src_path.read_bytes())
                maps[suffix] = {"path": dest.name, "bytes": dest.stat().st_size, "width": image.size[0], "height": image.size[1]}
    report["materials"].append({"name": material_name, "maps": maps})

mask_mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
mask_obj = bpy.data.objects.new("terrain_batch4_masks", mask_mesh)
bpy.context.collection.objects.link(mask_obj)
for attr_name in list(mask_mesh.color_attributes.keys()):
    if attr_name not in ("path", "river"):
        mask_mesh.color_attributes.remove(mask_mesh.color_attributes[attr_name])
mask_mesh.materials.clear()
flat = bpy.data.materials.new("batch4_mask_carrier")
mask_mesh.materials.append(flat)
bpy.ops.object.select_all(action="DESELECT")
mask_obj.select_set(True)
bpy.context.view_layer.objects.active = mask_obj
bpy.ops.export_scene.gltf(filepath=str(out / "terrain-masks.glb"), export_format="GLB",
                           use_selection=True, export_apply=True, export_yup=True,
                           export_vertex_color="ACTIVE")
report["masks"] = list(mask_mesh.color_attributes.keys())
bpy.data.objects.remove(mask_obj, do_unlink=True)

(out / "layers.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print("BATCH4_TERRAIN_LAYERS_DONE", out / "layers.json")
