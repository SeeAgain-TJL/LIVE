import bpy
from collections import Counter
import numpy as np

tree = bpy.data.objects["pine_02"]
print("TREE", tree.name, tree.type, tuple(tree.dimensions))
print("TREE_TRANSFORM", tuple(tree.location), tuple(tree.rotation_euler), tuple(tree.scale))
for modifier in tree.modifiers:
    print("MODIFIER", modifier.name, modifier.type)
depsgraph = bpy.context.evaluated_depsgraph_get()
mesh = bpy.data.meshes.new_from_object(tree.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
print("EVALUATED", len(mesh.vertices), len(mesh.polygons), "UV", list(mesh.uv_layers.keys()))
positions = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
mesh.vertices.foreach_get("co", positions)
print("BOUNDS", positions.reshape(-1, 3).min(axis=0), positions.reshape(-1, 3).max(axis=0))
print("VISIBILITY", tree.hide_render, tree.visible_get(), [(collection.name, collection.hide_render) for collection in tree.users_collection])
print("ATTRIBUTES", [(item.name, item.domain, item.data_type) for item in mesh.attributes if item.name in ("UVMap", "normal", "WebUV")])
print("MATERIAL_FACES", dict(Counter(mesh.materials[p.material_index].name for p in mesh.polygons)))
for material in mesh.materials:
    if material is None:
        continue
    print("MATERIAL", material.name, "backface", material.use_backface_culling, "surface", material.surface_render_method,
          "threshold", material.alpha_threshold)
    if not material.use_nodes:
        continue
    for node in material.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.image:
            image = node.image
            print("IMAGE", node.name, image.name, image.filepath, tuple(image.size), image.colorspace_settings.name)
        if material.name == "pine_twig" and node.type in {"MAPPING", "ATTRIBUTE"}:
            print("COORD_NODE", node.name, node.type, getattr(node, "attribute_name", ""),
                  [(s.name, str(s.default_value)) for s in node.inputs if not s.is_linked and hasattr(s, "default_value")])
    for link in material.node_tree.links:
        print("LINK", link.from_node.name, link.from_socket.name, "->", link.to_node.name, link.to_socket.name)
    for node in material.node_tree.nodes:
        if node.type in {"MIX_SHADER", "BSDF_TRANSPARENT", "BSDF_TRANSLUCENT", "MATH", "MIX"}:
            print("NODE", node.name, node.type, [(socket.name, str(socket.default_value)[:50]) for socket in node.inputs if not socket.is_linked and hasattr(socket, "default_value")])
            if material.name == "pine_twig" and node.type == "MIX":
                print("MIX_DETAIL", node.data_type, [(index, socket.name, socket.enabled, socket.is_linked,
                      tuple(socket.default_value) if hasattr(socket.default_value, "__len__") else socket.default_value)
                      for index, socket in enumerate(node.inputs) if socket.enabled])
    print("END_MATERIAL")
