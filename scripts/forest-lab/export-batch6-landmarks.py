"""Run with Blender 4.4.3 -b SOURCE.blend --python this_file -- OUTPUT_DIR."""
import bpy
import json
import sys
from pathlib import Path
from mathutils import Vector

out = Path(sys.argv[sys.argv.index("--") + 1])
out.mkdir(parents=True, exist_ok=True)
scene = bpy.context.scene
names = ["river_water", "montaigle_ruins_01", "montaigle_ruins_01.001",
         "montaigle_ruins_02", "montaigle_ruins_03"]
sources = [scene.objects[name] for name in names]
depsgraph = bpy.context.evaluated_depsgraph_get()
water = sources[0]
mesh = bpy.data.meshes.new_from_object(water.evaluated_get(depsgraph))
assert len(mesh.polygons) > 0, "Water geometry nodes produced no surface"
surface = bpy.data.objects.new("river_water_runtime", mesh)
scene.collection.objects.link(surface)
surface.matrix_world = water.matrix_world.copy()
material = bpy.data.materials.new("Pine river realtime")
material.use_nodes = True
shader = material.node_tree.nodes.get("Principled BSDF")
shader.inputs["Base Color"].default_value = (0.052, 0.092, 0.079, 0.77)
shader.inputs["Alpha"].default_value = 0.77
shader.inputs["Roughness"].default_value = 0.24
mesh.materials.clear()
mesh.materials.append(material)
for face in mesh.polygons:
    face.material_index = 0
    face.use_smooth = True
simplify = surface.modifiers.new("Realtime surface budget", "DECIMATE")
simplify.ratio = 0.075

# Preserve the source UVs and texture maps, including the repeated ruin mesh.
for name in sorted({obj.data.materials[0].name for obj in sources[1:]}):
    mat = bpy.data.materials[name]
    mat.node_tree.nodes.clear()
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    pbr = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(pbr.outputs["BSDF"], nodes.new("ShaderNodeOutputMaterial").inputs["Surface"])
    for suffix, socket in [("diff", "Base Color"), ("rough", "Roughness"), ("nor_gl", "Normal")]:
        image = bpy.data.images.load(str(Path(bpy.data.filepath).parent / "textures" / f"{name}_{suffix}.jpg"))
        if suffix != "diff":
            image.colorspace_settings.name = "Non-Color"
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image
        if suffix == "nor_gl":
            normal = nodes.new("ShaderNodeNormalMap")
            links.new(tex.outputs["Color"], normal.inputs["Color"])
            links.new(normal.outputs["Normal"], pbr.inputs[socket])
        else:
            links.new(tex.outputs["Color"], pbr.inputs[socket])

bpy.ops.object.select_all(action="DESELECT")
for obj in [surface, *sources[1:]]:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out / "landmarks.glb"), export_format="GLB",
                          use_selection=True, export_apply=True, export_yup=True)
report = {
    "source": Path(bpy.data.filepath).name,
    "objects": [{"name": obj.name, "type": obj.type, "dimensions": list(obj.dimensions),
                 "matrix": [list(row) for row in obj.matrix_world]} for obj in sources],
    "waterEvaluatedFaces": len(mesh.polygons),
    "terrain": [{"name": m.name, "type": m.type, "viewportLevels": getattr(m, "levels", None),
                 "renderLevels": getattr(m, "render_levels", None)} for m in scene.objects["terrain_main"].modifiers],
    "worldNodes": [n.name for n in scene.world.node_tree.nodes],
    "sun": [{"name": o.name, "direction": list(o.matrix_world.to_quaternion() @ Vector((0, 0, 1))),
             "energy": o.data.energy, "color": list(o.data.color)} for o in scene.objects if o.type == "LIGHT"],
}
(out / "source-landmarks.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
