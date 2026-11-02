import bpy
from collections import Counter, defaultdict

for group in bpy.data.node_groups:
    if group.bl_idname != "GeometryNodeTree":
        continue
    for node in group.nodes:
        if node.bl_idname != "GeometryNodeIsViewport":
            continue
        for link in list(group.links):
            if link.from_node == node and hasattr(link.to_socket, "default_value"):
                socket = link.to_socket
                group.links.remove(link)
                socket.default_value = False

targets = {
    "pine_01", "pine_02", "pine_03", "pine_04", "pine_05",
    "silver_fir_01", "silver_fir_02", "silver_fir_03", "silver_fir_04", "silver_fir_05", "silver_fir_06",
    "pine_twig", "pine_trunk_01", "pine_trunk_02", "fir_twig", "fir_trunk_01",
    "moss_patch_01_lod1", "pine_cover_01", "rock_moss_set_02_rock10_lod1", "river_water",
}
depsgraph = bpy.context.evaluated_depsgraph_get()
depsgraph.update()
seen = defaultdict(dict)
root_counts = Counter()
root_examples = {}
for instance in depsgraph.object_instances:
    if not instance.is_instance or instance.object.original.name not in targets:
        continue
    obj = instance.object.original
    parent = getattr(instance, "parent", None)
    persistent_id = tuple(getattr(instance, "persistent_id", ()))
    translation = tuple(round(value, 5) for value in instance.matrix_world.translation)
    if len(persistent_id) > 1 and persistent_id[1] == 2147483647:
        root_counts[obj.name] += 1
        root_examples.setdefault(obj.name, translation)
    key = (persistent_id, translation)
    if key in seen[obj.name]:
        continue
    seen[obj.name][key] = {
        "parent": parent.original.name if parent else None,
        "persistent_id": persistent_id,
        "translation": translation,
        "matrix": tuple(tuple(round(v, 5) for v in row) for row in instance.matrix_world),
        "object_type": obj.type,
        "mesh_vertices": len(obj.data.vertices) if obj.type == "MESH" else None,
        "mesh_faces": len(obj.data.polygons) if obj.type == "MESH" else None,
        "modifiers": [(m.type, m.node_group.name if m.type == "NODES" and m.node_group else None) for m in obj.modifiers],
    }

for name in sorted(seen):
    print("HIERARCHY", name, "UNIQUE_KEYS", len(seen[name]))
    for value in list(seen[name].values())[:3]:
        print("SAMPLE", name, value)

print("ROOT_INSTANCE_TOTAL", sum(root_counts.values()))
for name, count in root_counts.most_common():
    print("ROOT_INSTANCE", name, count, root_examples[name])

for name in sorted(targets):
    obj = bpy.data.objects.get(name)
    if obj is None:
        continue
    print("SOURCE_OBJECT", name, obj.type, "vertices", len(obj.data.vertices) if obj.type == "MESH" else None,
          "faces", len(obj.data.polygons) if obj.type == "MESH" else None,
          "collections", [collection.name for collection in obj.users_collection],
          "modifiers", [(m.type, m.node_group.name if m.type == "NODES" and m.node_group else None) for m in obj.modifiers])
