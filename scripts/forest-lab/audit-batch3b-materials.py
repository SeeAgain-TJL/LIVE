"""Read-only material graph audit on the verified source copy. Never saves blend."""
import bpy
import json
import os
import sys

assert os.path.basename(bpy.data.filepath) == "pine-forest-copy.blend"
folder = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
os.makedirs(folder, exist_ok=True)

def value(socket):
    try:
        v = socket.default_value
        return list(v) if hasattr(v, "__len__") and not isinstance(v, str) else v
    except (AttributeError, TypeError):
        return None

seen = {}
def graph(tree):
    if tree.name in seen:
        return tree.name
    seen[tree.name] = {
        "nodes": [{"name": n.name, "type": n.bl_idname,
                   "image": {"name": n.image.name, "path": bpy.path.abspath(n.image.filepath),
                             "size": list(n.image.size), "colorspace": n.image.colorspace_settings.name}
                   if n.type == "TEX_IMAGE" and n.image else None,
                   "operation": getattr(n, "operation", None),
                   "blend_type": getattr(n, "blend_type", None),
                   "uv_map": getattr(n, "uv_map", None),
                   "inputs": {s.name: value(s) for s in n.inputs if not s.is_linked},
                   "group": graph(n.node_tree) if n.type == "GROUP" and n.node_tree else None}
                  for n in tree.nodes],
        "links": [[l.from_node.name, l.from_socket.name, l.to_node.name, l.to_socket.name] for l in tree.links]
    }
    return tree.name

terrain = bpy.data.objects["terrain_main"]
names = [m.name for m in terrain.data.materials] + ["pine_twig", "fir_twig"]
materials = {}
for name in names:
    m = bpy.data.materials.get(name)
    if m and m.use_nodes:
        materials[name] = {"graph": graph(m.node_tree), "diffuse": list(m.diffuse_color),
                           "surface_render_method": m.surface_render_method}
report = {"source": bpy.data.filepath, "blender": bpy.app.version_string,
          "terrain": {"matrix": [list(row) for row in terrain.matrix_world],
                      "vertices": len(terrain.data.vertices), "polygons": len(terrain.data.polygons),
                      "uv": [{"name": uv.name, "active_render": uv.active_render} for uv in terrain.data.uv_layers],
                      "modifiers": [{"type": m.type, "name": m.name} for m in terrain.modifiers]},
          "materials": materials, "graphs": seen}
with open(os.path.join(folder, "material-audit.json"), "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2)
print("BATCH3B_AUDIT", json.dumps({"materials": names, "graphs": list(seen), "terrain": report["terrain"]}))
