import bpy
from collections import Counter

print("SOURCE", bpy.data.filepath)
for name in ("pine_02", "silver_fir_01", "pine_proxy_large", "pine_proxy_medium", "fir_proxy_large", "terrain_main"):
    obj = bpy.data.objects.get(name)
    if obj is None:
        print("MISSING", name)
        continue
    print("OBJECT", name, obj.type, "render_hidden", obj.hide_render,
          "collections", [c.name for c in obj.users_collection],
          "materials", [m.name if m else None for m in obj.data.materials] if hasattr(obj.data, "materials") else [],
          "modifiers", [(m.name, m.type, m.node_group.name if m.type == "NODES" and m.node_group else "") for m in obj.modifiers])

for group in bpy.data.node_groups:
    if group.bl_idname != "GeometryNodeTree":
        continue
    references = []
    for node in group.nodes:
        if node.bl_idname == "GeometryNodeObjectInfo" and node.inputs.get("Object") and node.inputs["Object"].default_value:
            references.append((node.name, node.inputs["Object"].default_value.name))
        if node.bl_idname == "GeometryNodeCollectionInfo" and node.inputs.get("Collection") and node.inputs["Collection"].default_value:
            references.append((node.name, node.inputs["Collection"].default_value.name))
    if references:
        print("NODE_GROUP", group.name, references)

counts = Counter()
for instance in bpy.context.evaluated_depsgraph_get().object_instances:
    if instance.is_instance:
        counts[instance.object.original.name] += 1
print("INSTANCE_COUNTS", counts.most_common(35))
